import sharp from "sharp";
import path from "path";
import fs from "fs";

const svgPath = path.join(__dirname, "..", "public", "icon.svg");
const publicDir = path.join(__dirname, "..", "public");
const svgBuffer = fs.readFileSync(svgPath);

async function main() {
  for (const size of [192, 512]) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }
  // Apple touch icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, "apple-icon.png"));
  console.log("Generated apple-icon.png");
  // Favicon
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, "favicon.png"));
  console.log("Generated favicon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
