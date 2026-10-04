import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { Router } from "express";
import { z } from "zod";
import { verifyAccess, requireAuth } from "./auth.js";
import { rows, row, run, now } from "./db.js";
import { id } from "./core.js";
import { config } from "./config.js";
type Client = {
  userId: string;
  expiresAt: number;
  alive: boolean;
  token: string;
};
const clients = new Map<WebSocket, Client>();
const published = new Set<string>();
export async function queueNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
  sound = "default",
) {
  const nid = id();
  await run(
    "INSERT INTO notification_outbox(id,user_id,title,body,data_json,sound,available_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
    nid,
    userId,
    title,
    body,
    JSON.stringify({ ...data, eventId: nid }),
    sound,
    now(),
    now(),
  );
  return nid;
}
export async function notifyAdmins(
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
  for (const u of await rows(
    "SELECT id FROM users WHERE role=? AND deleted_at IS NULL",
    "admin",
  ))
    await queueNotification(u.id, title, body, data, "aone_order.wav");
}
export async function publishPending() {
  for (const n of await rows(
    "SELECT * FROM notification_outbox WHERE sent_at IS NULL AND attempts=0 AND available_at<=?",
    now(),
  )) {
    if (published.has(n.id)) continue;
    published.add(n.id);
    if (published.size > 1000)
      published.delete(published.values().next().value!);
    for (const [socket, client] of clients)
      if (
        client.userId === n.user_id &&
        socket.readyState === WebSocket.OPEN &&
        (await validClient(socket, client))
      )
        socket.send(
          JSON.stringify({
            type: "notification",
            id: n.id,
            title: n.title,
            body: n.body,
            data: JSON.parse(n.data_json),
            sound: n.sound,
          }),
        );
  }
}
export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/realtime",
    maxPayload: 4096,
  });
  wss.on("connection", (socket) => {
    const deadline = setTimeout(
      () => socket.close(4401, "Authentication required"),
      5000,
    );
    socket.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type !== "auth" || clients.has(socket)) return;
        const user = await verifyAccess(
          z.string().max(2048).parse(message.token),
        );
        const claims = JSON.parse(
          Buffer.from(message.token.split(".")[1], "base64url").toString(),
        );
        clients.set(socket, {
          userId: user.id,
          expiresAt: claims.exp * 1000,
          alive: true,
          token: message.token,
        });
        clearTimeout(deadline);
        socket.send(JSON.stringify({ type: "ready" }));
      } catch {
        socket.close(4401, "Session expired");
      }
    });
    socket.on("pong", () => {
      const c = clients.get(socket);
      if (c) c.alive = true;
    });
    socket.on("close", () => {
      clearTimeout(deadline);
      clients.delete(socket);
    });
    socket.on("error", () => {
      clients.delete(socket);
    });
  });
  const heart = setInterval(async () => {
    for (const [socket, c] of clients) {
      if (!c.alive) {
        socket.terminate();
        clients.delete(socket);
        continue;
      }
      if (c.expiresAt <= Date.now() || !(await validClient(socket, c))) {
        socket.close(4401, "Session expired");
        continue;
      }
      c.alive = false;
      socket.ping();
    }
  }, 30000);
  heart.unref();
  server.on("close", () => {
    clearInterval(heart);
    for (const socket of clients.keys()) socket.close();
    wss.close();
  });
}
async function validClient(socket: WebSocket, c: Client) {
  try {
    await verifyAccess(c.token);
    return true;
  } catch {
    socket.close(4401, "Session expired");
    return false;
  }
}
let processing = false;
export async function processPushQueue() {
  if (processing) return;
  processing = true;
  try {
    for (const n of await rows(
      "SELECT * FROM notification_outbox WHERE sent_at IS NULL AND attempts<6 AND available_at<=? ORDER BY created_at LIMIT 50",
      now(),
    )) {
      const tokens = await rows(
        "SELECT token FROM device_tokens WHERE user_id=? AND active=1",
        n.user_id,
      );
      if (!tokens.length) {
        await run(
          "UPDATE notification_outbox SET sent_at=? WHERE id=?",
          now(),
          n.id,
        );
        continue;
      }
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.expoToken
              ? { Authorization: `Bearer ${config.expoToken}` }
              : {}),
          },
          body: JSON.stringify(
            tokens.map((t) => ({
              to: t.token,
              title: n.title,
              body: "Open Aone Mart to view this order update.",
              data: JSON.parse(n.data_json),
              sound: n.sound,
              channelId:
                n.sound === "aone_order.wav"
                  ? "aone-orders-v1"
                  : "aone-updates",
              priority: "high",
            })),
          ),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Push HTTP ${response.status}`);
        const result = (await response.json()) as {
          data?: Array<{
            status: string;
            id?: string;
            details?: {
              error?: string;
            };
          }>;
        };
        if (!Array.isArray(result.data) || result.data.length !== tokens.length)
          throw new Error("Push provider unavailable");
        let retry = false;
        await Promise.all(
          result.data.map(async (ticket, i) => {
            if (ticket.details?.error === "DeviceNotRegistered")
              await run(
                "UPDATE device_tokens SET active=0 WHERE token=?",
                tokens[i].token,
              );
            else if (ticket.status !== "ok") retry = true;
            if (ticket.id)
              await run(
                "INSERT OR IGNORE INTO push_receipts VALUES(?,?,?,NULL)",
                ticket.id,
                tokens[i].token,
                new Date(Date.now() + 15 * 60000).toISOString(),
              );
          }),
        );
        if (retry) throw new Error("Some push tickets failed");
        await run(
          "UPDATE notification_outbox SET sent_at=?,attempts=attempts+1,last_error=NULL WHERE id=?",
          now(),
          n.id,
        );
      } catch {
        await run(
          "UPDATE notification_outbox SET attempts=attempts+1,available_at=?,last_error=? WHERE id=?",
          new Date(
            Date.now() + Math.min(600000, 5000 * 2 ** n.attempts),
          ).toISOString(),
          "Push delivery failed; retry scheduled",
          n.id,
        );
      }
    }
    const receipts = await rows(
      "SELECT * FROM push_receipts WHERE checked_at IS NULL AND check_at<=? LIMIT 1000",
      now(),
    );
    if (receipts.length) {
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.expoToken
              ? { Authorization: `Bearer ${config.expoToken}` }
              : {}),
          },
          body: JSON.stringify({ ids: receipts.map((v) => v.id) }),
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) {
          const { data } = (await r.json()) as {
            data: Record<
              string,
              {
                details?: {
                  error?: string;
                };
              }
            >;
          };
          for (const ticket of receipts) {
            if (data?.[ticket.id]?.details?.error === "DeviceNotRegistered")
              await run(
                "UPDATE device_tokens SET active=0 WHERE token=?",
                ticket.token,
              );
            if (data?.[ticket.id])
              await run(
                "UPDATE push_receipts SET checked_at=? WHERE id=?",
                now(),
                ticket.id,
              );
          }
        }
      } catch {
        /* Retain receipts for the next worker pass. */
      }
    }
  } finally {
    processing = false;
  }
}
export const devicesRouter = Router();
devicesRouter.use(requireAuth);
devicesRouter.post("/", async (req, res) => {
  const { token } = z
    .object({
      token: z
        .string()
        .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
        .max(250),
    })
    .parse(req.body);
  await run(
    "INSERT INTO device_tokens VALUES(?,?,1,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,active=1,updated_at=excluded.updated_at",
    token,
    req.user.id,
    now(),
  );
  res.json({ ok: true });
});
devicesRouter.delete("/", async (req, res) => {
  const { token } = z.object({ token: z.string().max(250) }).parse(req.body);
  await run(
    "DELETE FROM device_tokens WHERE token=? AND user_id=?",
    token,
    req.user.id,
  );
  res.json({ ok: true });
});
devicesRouter.get("/notifications", async (req, res) =>
  res.json({
    notifications: (
      await rows(
        "SELECT id,title,body,data_json data,sound,created_at createdAt FROM notification_outbox WHERE user_id=? ORDER BY created_at DESC LIMIT 40",
        req.user.id,
      )
    ).map((n) => ({ ...n, data: JSON.parse(n.data) })),
  }),
);
