import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { row, run, transaction, now } from "./db.js";
import { AppError, fail, id, hash, phone, password } from "./core.js";
export interface User {
  id: string;
  name: string;
  phone: string;
  role: "customer" | "admin";
  points: number;
  auth_version: number;
  password_hash: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role,
  points: u.points,
  createdAt: u.created_at,
});
export function verifyAccess(token: string): User {
  try {
    const claims = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "aone-mart",
      audience: "aone-native",
    }) as jwt.JwtPayload;
    const user = row<User>(
      "SELECT * FROM users WHERE id=? AND deleted_at IS NULL",
      String(claims.sub),
    );
    if (!user || user.auth_version !== claims.ver) throw new Error("revoked");
    if (
      !claims.sid ||
      !row(
        "SELECT token_hash FROM refresh_sessions WHERE token_hash=? AND user_id=? AND expires_at>?",
        String(claims.sid),
        user.id,
        now(),
      )
    )
      throw new Error("session revoked");
    return user;
  } catch {
    throw new AppError(
      401,
      "Your session has expired. Please log in again.",
      "UNAUTHORIZED",
    );
  }
}
export const requireAuth = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) fail(401, "Please log in.", "UNAUTHORIZED");
    req.user = verifyAccess(token!);
    next();
  } catch (e) {
    next(e);
  }
};
export const adminOnly = (req: Request, _res: Response, next: NextFunction) =>
  req.user.role === "admin"
    ? next()
    : next(new AppError(403, "Admin access required.", "FORBIDDEN"));
function issueTokens(user: User) {
  const refreshToken = randomBytes(48).toString("base64url");
  const accessToken = jwt.sign(
    { role: user.role, ver: user.auth_version, sid: hash(refreshToken) },
    config.jwtSecret,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: "aone-mart",
      audience: "aone-native",
      expiresIn: "15m",
    },
  );
  run(
    "INSERT INTO refresh_sessions VALUES(?,?,?,?)",
    hash(refreshToken),
    user.id,
    new Date(Date.now() + 30 * 86400000).toISOString(),
    now(),
  );
  return { accessToken, refreshToken, user: publicUser(user) };
}
const limit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many attempts. Please try again later.",
    code: "RATE_LIMITED",
  },
  skip: () => process.env.NODE_ENV === "test",
});
export const authRouter = Router();
authRouter.post("/signup", limit, async (req, res) => {
  const data = z
    .object({ name: z.string().trim().min(2).max(100), phone, password })
    .strict()
    .parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = transaction(() => {
    if (row("SELECT id FROM users WHERE phone=?", data.phone))
      fail(
        409,
        "An account with this phone already exists. Contact the mart admin if it was disabled.",
      );
    const uid = id(),
      stamp = now();
    run(
      "INSERT INTO users(id,name,phone,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      uid,
      data.name,
      data.phone,
      passwordHash,
      "customer",
      stamp,
      stamp,
    );
    return row<User>("SELECT * FROM users WHERE id=?", uid)!;
  });
  res.status(201).json(issueTokens(user));
});
authRouter.post("/login", limit, async (req, res) => {
  const data = z
    .object({
      phone,
      password: z.string().max(72),
      role: z.enum(["admin", "customer"]),
    })
    .parse(req.body);
  const user = row<User>(
    "SELECT * FROM users WHERE phone=? AND deleted_at IS NULL",
    data.phone,
  );
  const dummy = "$2b$12$JRoRDBejcMVTQCsc/X/D9.eLOh0a7eZIBYRAmUmCpZaUzBhql6oeK";
  const correct = await bcrypt.compare(
    data.password,
    user?.password_hash || dummy,
  );
  if (!user || !correct || user.role !== data.role)
    fail(
      401,
      "Phone or password is incorrect for this login.",
      "INVALID_CREDENTIALS",
    );
  res.json(issueTokens(user!));
});
authRouter.post("/refresh", limit, (req, res) => {
  const { refreshToken } = z
    .object({ refreshToken: z.string().min(40).max(200) })
    .parse(req.body);
  const result = transaction(() => {
    const session = row(
      "SELECT * FROM refresh_sessions WHERE token_hash=? AND expires_at>?",
      hash(refreshToken),
      now(),
    );
    if (!session) fail(401, "Please log in again.", "UNAUTHORIZED");
    const user = row<User>(
      "SELECT * FROM users WHERE id=? AND deleted_at IS NULL",
      session!.user_id,
    );
    if (!user) fail(401, "Please log in again.", "UNAUTHORIZED");
    run("DELETE FROM refresh_sessions WHERE token_hash=?", hash(refreshToken));
    return issueTokens(user!);
  });
  res.json(result);
});
authRouter.post("/logout", requireAuth, (req, res) => {
  const body = z
    .object({
      refreshToken: z.string().optional(),
      deviceToken: z.string().optional(),
    })
    .parse(req.body || {});
  if (body.refreshToken)
    run(
      "DELETE FROM refresh_sessions WHERE token_hash=? AND user_id=?",
      hash(body.refreshToken),
      req.user.id,
    );
  if (body.deviceToken)
    run(
      "DELETE FROM device_tokens WHERE token=? AND user_id=?",
      body.deviceToken,
      req.user.id,
    );
  res.json({ ok: true });
});
authRouter.get("/me", requireAuth, (req, res) =>
  res.json({ user: publicUser(req.user) }),
);
authRouter.patch("/me", requireAuth, (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(2).max(100) })
    .strict()
    .parse(req.body);
  run(
    "UPDATE users SET name=?,updated_at=? WHERE id=?",
    body.name,
    now(),
    req.user.id,
  );
  res.json({
    user: publicUser(row<User>("SELECT * FROM users WHERE id=?", req.user.id)!),
  });
});
authRouter.post("/change-password", requireAuth, limit, async (req, res) => {
  const body = z
    .object({ currentPassword: z.string().max(72), newPassword: password })
    .parse(req.body);
  if (!(await bcrypt.compare(body.currentPassword, req.user.password_hash)))
    fail(400, "Current password is incorrect.");
  const newHash = await bcrypt.hash(body.newPassword, 12);
  transaction(() => {
    run(
      "UPDATE users SET password_hash=?,auth_version=auth_version+1,updated_at=? WHERE id=?",
      newHash,
      now(),
      req.user.id,
    );
    run("DELETE FROM refresh_sessions WHERE user_id=?", req.user.id);
  });
  res.json(
    issueTokens(row<User>("SELECT * FROM users WHERE id=?", req.user.id)!),
  );
});
