// Run intentionally when updating the bundled library; never during app startup.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const output = new URL('../apps/mobile/assets/products/', import.meta.url);
const sources = JSON.parse(await readFile(new URL('sources.json', output), 'utf8'));
await mkdir(output, { recursive: true });
for (const item of sources) {
  const response = await fetch(`${item.image}?w=1024&h=1024&fit=crop&fm=webp&q=82`);
  if (!response.ok) throw new Error(`${item.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const image = sharp(bytes);
  const meta = await image.metadata();
  if (meta.width < 1024 || meta.height < 1024) throw new Error(`${item.id}: source too small`);
  await writeFile(new URL(`${item.id}.webp`, output), bytes);
  await image.resize(384, 384).webp({ quality: 80, effort: 6 }).toFile(new URL(`${item.id}-thumb.webp`, output).pathname);
  console.log(`${item.id}: 1024px detail + 384px thumbnail`);
}
