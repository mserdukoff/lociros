// Writes smaller copies of public/art/*.webp into public/art/{width}/ so <Art>
// can offer a srcset. Run after adding or replacing art:
//   node scripts/art-sizes.mjs
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ART = path.join(process.cwd(), "public", "art");
const WIDTHS = [320, 640];

const files = (await readdir(ART)).filter((f) => f.endsWith(".webp"));
for (const width of WIDTHS) {
  await mkdir(path.join(ART, String(width)), { recursive: true });
}
for (const file of files) {
  const source = path.join(ART, file);
  const { width: full } = await sharp(source).metadata();
  for (const width of WIDTHS) {
    if (!full || width >= full) continue;
    await sharp(source)
      .resize({ width })
      .webp({ quality: 80, effort: 6 })
      .toFile(path.join(ART, String(width), file));
  }
}
console.log(`Resized ${files.length} files to ${WIDTHS.join(", ")} px.`);
