import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');

export async function prepareHeroAssets(brandReference, balconyReference, audienceReference) {
  const output = path.join(root, 'output/ui/assets');
  await mkdir(output, { recursive: true });
  const inputs = [
    { file: brandReference, output: 'liverse-logo-reference.png', crop: { left: 65, top: 41, width: 543, height: 100 }, role: 'brand-logo', treatment: 'Extract original orange logo pixels; preserve the radiating V; make the dark background transparent.' },
    { file: balconyReference, output: 'liverse-stage-balcony.png', crop: { left: 6, top: 155, width: 1363, height: 617 }, role: 'alternate-background', treatment: 'Crop the upper title, orange rule and screenshot border; retain the stage and audience-area photograph.' },
    { file: audienceReference, output: 'liverse-live-audience.png', crop: { left: 0, top: 710, width: 6400, height: 2890 }, role: 'primary-background', treatment: 'Crop the upper title and orange rule; retain the existing user-supplied edited stage/audience image.' },
  ];
  const assets = [];
  for (const input of inputs) {
    const source = await readFile(input.file);
    let buffer;
    if (input.role === 'brand-logo') {
      const { data, info } = await sharp(source).extract(input.crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let index = 0; index < data.length; index += 4) {
        const [r, g, b] = data.subarray(index, index + 3);
        data[index + 3] = r > 100 && r > g * 1.6 && g < 160 && b < 80 ? 255 : 0;
      }
      buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    } else {
      buffer = await sharp(source).extract(input.crop).resize({ width: 2048, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    }
    await writeFile(path.join(output, input.output), buffer);
    const metadata = await sharp(buffer).metadata();
    assets.push({ file: input.output, source: path.basename(input.file), sourceSha256: hash(source), sha256: hash(buffer), role: input.role, crop: input.crop, width: metadata.width, height: metadata.height, treatment: input.treatment });
  }
  await writeFile(path.join(output, 'hero-assets.json'), `${JSON.stringify({ description: 'User-supplied brand and venue imagery for Hero design; not seat-specific user submissions.', assets }, null, 2)}\n`);
  return assets;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inputs = process.argv.slice(2);
  if (inputs.length !== 3) throw new Error('Usage: node scripts/prepare-hero-assets.mjs <brand-reference> <balcony-reference> <audience-reference>');
  console.log(await prepareHeroAssets(...inputs));
}
