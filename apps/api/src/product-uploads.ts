import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { requireAuth, adminOnly } from "./auth.js";
import { id, fail, audit, AppError } from "./core.js";
import { row, run, now, transaction } from "./db.js";
import { config } from "./config.js";
import { productSelect, serializeProduct } from "./catalog.js";

export const uploadedProductImagesRouter = Router();
uploadedProductImagesRouter.get("/:id", async (req, res) => {
  const imageId = z.string().uuid().parse(req.params.id);
  const stored = await row(
    "SELECT image,thumbnail FROM product_uploaded_images WHERE id=?",
    imageId,
  );
  if (!stored) fail(404, "Product photo not found.");
  // Each replacement has its own immutable URL; previous order snapshots stay valid.
  res
    .set("Cache-Control", "public, max-age=86400, immutable")
    .type("image/webp")
    .send(
      Buffer.from(
        req.query.size === "thumb" ? stored!.thumbnail : stored!.image,
      ),
    );
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1, fields: 0 },
});
export const productUploadsRouter = Router();
productUploadsRouter.post(
  "/:id/photo",
  requireAuth,
  adminOnly,
  upload.single("file"),
  async (req, res) => {
    const productId = z.string().uuid().parse(req.params.id);
    if (!req.file) fail(400, "Choose a product photo.");
    if (
      !(await row(
        "SELECT id FROM products WHERE id=? AND deleted_at IS NULL",
        productId,
      ))
    )
      fail(404, "Product not found.");
    let full: Buffer, thumb: Buffer;
    try {
      const pipeline = sharp(req.file!.buffer, {
        limitInputPixels: 25000000,
        animated: false,
      });
      const info = await pipeline.metadata();
      if (!["jpeg", "png", "webp"].includes(info.format || ""))
        fail(422, "Choose a valid JPG, PNG or WebP product photo.");
      full = await pipeline
        .clone()
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 86 })
        .toBuffer();
      thumb = await pipeline
        .clone()
        .rotate()
        .resize({
          width: 384,
          height: 384,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer();
      if (full.length + thumb.length > 900 * 1024)
        fail(422, "This photo is too detailed. Choose a smaller image.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      fail(
        422,
        "Cannot read this product photo. Choose a JPG, PNG or WebP image up to 1 MB.",
      );
    }
    const imageId = id();
    const imageUrl = `${config.serverless ? "https" : req.protocol}://${req.get("host")}/api/catalog/uploaded-product-images/${imageId}`;
    await transaction(async () => {
      if (
        !(await row(
          "SELECT id FROM products WHERE id=? AND deleted_at IS NULL",
          productId,
        ))
      )
        fail(404, "Product not found.");
      await run(
        "INSERT INTO product_uploaded_images(id,product_id,image,thumbnail,created_at) VALUES(?,?,?,?,?)",
        imageId,
        productId,
        full!,
        thumb!,
        now(),
      );
      await run(
        "UPDATE products SET image_url=?,updated_at=? WHERE id=?",
        imageUrl,
        now(),
        productId,
      );
      await audit(req.user.id, "product.photo.upload", productId);
    });
    res.status(201).json({
      product: serializeProduct(
        (await row(productSelect + " WHERE p.id=?", productId))!,
      ),
    });
  },
);
