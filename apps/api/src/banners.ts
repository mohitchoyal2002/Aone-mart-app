import { Router, type Request } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, audit } from "./core.js";
import { row, rows, run, now, transaction } from "./db.js";

export async function listBanners() {
  return (
    await rows(
      "SELECT id,title,alt_text,sort_order,created_at FROM store_banners ORDER BY sort_order,created_at",
    )
  ).map((b) => ({
    id: b.id,
    title: b.title,
    altText: b.alt_text,
    imagePath: `/api/catalog/banners/${b.id}/image?v=${encodeURIComponent(b.created_at)}`,
  }));
}

export const bannerImagesRouter = Router();
bannerImagesRouter.get("/:id/image", async (req, res) => {
  const banner = await row(
    "SELECT image,mime_type FROM store_banners WHERE id=?",
    String(req.params.id),
  );
  if (!banner) fail(404, "Banner not found.");
  // Short public cache allows a replaced/deleted image to expire. Each replacement
  // also has a new versioned path, so the app does not show a stale image.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type(banner!.mime_type).send(Buffer.from(banner!.image));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1, fields: 2 },
});
const details = z
  .object({
    title: z.string().trim().min(2).max(100),
    altText: z.string().trim().min(2).max(200),
  })
  .strict();
async function image(req: Request) {
  if (!req.file) fail(400, "Choose a banner image.");
  try {
    const pipeline = sharp(req.file!.buffer, {
      limitInputPixels: 25000000,
      animated: false,
    });
    const metadata = await pipeline.metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      !metadata.width ||
      !metadata.height
    )
      fail(422, "Choose a valid JPG, PNG or WebP image.");
    const bytes = await pipeline
      .rotate()
      .resize({
        width: 1600,
        height: 1000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#FFF9EE" })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (bytes.length > 700 * 1024)
      fail(422, "This image is too detailed. Choose a smaller banner image.");
    return bytes;
  } catch {
    fail(
      422,
      "Cannot read this banner. Choose a JPG, PNG or WebP image up to 1 MB.",
    );
  }
}
export const bannersRouter = Router();
bannersRouter.use(requireAuth, adminOnly);
bannersRouter.get("/", async (_req, res) =>
  res.json({ banners: await listBanners() }),
);
bannersRouter.post("/", upload.single("file"), async (req, res) => {
  const d = details.parse(req.body),
    bytes = await image(req),
    bid = id();
  await transaction(async () => {
    const current = (await row(
      "SELECT count(*) count,coalesce(max(sort_order),-1) last FROM store_banners",
    ))!;
    if (current.count >= 5)
      fail(
        409,
        "You can have up to 5 banners. Replace or remove an existing banner first.",
      );
    await run(
      "INSERT INTO store_banners VALUES(?,?,?,?,?,?,?)",
      bid,
      d.title,
      d.altText,
      bytes!,
      "image/jpeg",
      current.last + 1,
      now(),
    );
    await audit(req.user.id, "banner.create", bid);
  });
  res.status(201).json({ banners: await listBanners() });
});
bannersRouter.put("/:id", upload.single("file"), async (req, res) => {
  const d = details.parse(req.body),
    bytes = await image(req),
    bid = String(req.params.id);
  await transaction(async () => {
    if (!(await row("SELECT id FROM store_banners WHERE id=?", bid)))
      fail(404, "Banner not found.");
    await run(
      "UPDATE store_banners SET title=?,alt_text=?,image=?,mime_type=?,created_at=? WHERE id=?",
      d.title,
      d.altText,
      bytes!,
      "image/jpeg",
      now(),
      bid,
    );
    await audit(req.user.id, "banner.replace", bid);
  });
  res.json({ banners: await listBanners() });
});
bannersRouter.patch("/order", async (req, res) => {
  const { ids } = z
    .object({ ids: z.array(z.string().uuid()).min(1).max(5) })
    .strict()
    .parse(req.body);
  await transaction(async () => {
    const current = await rows("SELECT id FROM store_banners");
    if (
      new Set(ids).size !== ids.length ||
      current.length !== ids.length ||
      current.some((b) => !ids.includes(b.id))
    )
      fail(409, "Banner list changed. Refresh and try again.");
    for (const [index, bid] of ids.entries())
      await run("UPDATE store_banners SET sort_order=? WHERE id=?", index, bid);
    await audit(req.user.id, "banner.reorder");
  });
  res.json({ banners: await listBanners() });
});
bannersRouter.delete("/:id", async (req, res) => {
  const bid = String(req.params.id);
  await transaction(async () => {
    if (!(await row("SELECT id FROM store_banners WHERE id=?", bid)))
      fail(404, "Banner not found.");
    if ((await row("SELECT count(*) count FROM store_banners"))!.count <= 1)
      fail(409, "Keep at least one banner. Replace this image to change it.");
    await run("DELETE FROM store_banners WHERE id=?", bid);
    await audit(req.user.id, "banner.delete", bid);
  });
  res.json({ banners: await listBanners() });
});
