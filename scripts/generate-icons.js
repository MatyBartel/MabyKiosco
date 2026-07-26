const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const iconSrc = path.join(root, 'src/assets/brand/maby-icon.png');
const bannerSrc = path.join(root, 'src/assets/brand/maby-banner.png');

async function writeIfChanged(target, buffer) {
  fs.writeFileSync(target, buffer);
  console.log('[icons] OK', path.relative(root, target));
}

async function main() {
  const iconBuf = await sharp(iconSrc).png().toBuffer();
  const bannerBuf = await sharp(bannerSrc).png().toBuffer();
  const ico = await pngToIco(iconBuf);

  await writeIfChanged(path.join(root, 'assets/icon.ico'), ico);
  await writeIfChanged(path.join(root, 'assets/icon.png'), iconBuf);
  await writeIfChanged(path.join(root, 'assets/icon-source.png'), iconBuf);
  await writeIfChanged(path.join(root, 'public/favicon.png'), iconBuf);

  try {
    await writeIfChanged(iconSrc, iconBuf);
    await writeIfChanged(bannerSrc, bannerBuf);
  } catch (error) {
    console.warn('[icons] No se pudieron actualizar archivos en src/assets/brand (puede estar abierto en el editor).');
    console.warn('[icons]', error.message);
  }

  console.log('[icons] ICO valido:', ico.slice(0, 4).toString('hex'), `(${ico.length} bytes)`);
}

main().catch((error) => {
  console.error('[icons] Error:', error.message);
  process.exit(1);
});
