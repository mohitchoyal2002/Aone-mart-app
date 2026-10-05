import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { ZodError } from "zod";
import { rateLimit } from "express-rate-limit";
import { DatabaseRateStore } from "./rate-store.js";
import { authRouter } from "./auth.js";
import { catalogRouter, inventoryRouter } from "./catalog.js";
import { ordersRouter, adminOrdersRouter } from "./orders.js";
import { rewardsRouter, adminCouponsRouter } from "./coupons.js";
import { usersRouter, settingsRouter } from "./admin.js";
import { reportsRouter } from "./reports.js";
import { importsRouter } from "./imports.js";
import { aiRouter } from "./ai.js";
import { devicesRouter } from "./notifications.js";
import { config } from "./config.js";
import { AppError } from "./core.js";
import { row } from "./db.js";
import { bannersRouter, bannerImagesRouter } from "./banners.js";
export const app = express();
app.disable("x-powered-by");
if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);
app.use(helmet());
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const origins = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(
  rateLimit({
    store: new DatabaseRateStore("api:"),
    windowMs: 60000,
    limit: 180,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
      error: "Too many requests. Try again shortly.",
      code: "RATE_LIMITED",
    },
  }),
);
app.get(["/", "/health"], async (_req, res) => {
  await row("SELECT 1");
  res.json({
    ok: true,
    service: "aone-mart-api",
    version: "1.2.0",
    database: config.tursoUrl ? "turso" : "sqlite",
    realtime: config.serverless ? "polling" : "websocket",
    maxUploadBytes: (config.serverless ? 4 : 5) * 1024 * 1024,
  });
});
app.use("/api/auth", authRouter);
app.use("/api/catalog/banners", bannerImagesRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/admin/inventory", inventoryRouter);
app.use("/api/admin/orders", adminOrdersRouter);
app.use("/api/admin/users", usersRouter);
app.use("/api/admin/coupons", adminCouponsRouter);
app.use("/api/admin/reports", reportsRouter);
app.use("/api/admin/imports", importsRouter);
app.use("/api/admin/settings/banners", bannersRouter);
app.use("/api/admin/settings", settingsRouter);
app.use("/api/admin/ai", aiRouter);
app.use((_req, res) =>
  res.status(404).json({ error: "Endpoint not found.", code: "NOT_FOUND" }),
);
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(422).json({
        error: "Check the entered details.",
        code: "VALIDATION_ERROR",
        details: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(413).json({
        error: req.path.startsWith("/api/admin/settings/banners")
          ? "Upload one banner image, no larger than 1 MB."
          : `Upload one file, no larger than ${config.serverless ? 4 : 5} MB.`,
        code: "UPLOAD_LIMIT",
      });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res
        .status(400)
        .json({ error: "Invalid JSON body.", code: "BAD_REQUEST" });
      return;
    }
    // Log only a class and code, never request bodies, passwords, keys, file bytes or provider errors.
    console.error("API error", error instanceof Error ? error.name : "unknown");
    res.status(500).json({
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    });
  },
);

export default app;
