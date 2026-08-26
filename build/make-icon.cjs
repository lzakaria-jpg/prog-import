const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [256, 128, 64, 48, 32, 16];

function pngToIco(pngsBySize) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type = icon
  dir.writeUInt16LE(SIZES.length, 4); // count

  const entries = [];
  let offset = 6 + SIZES.length * 16;
  const imageData = Buffer.alloc(0);
  for (const size of SIZES) {
    const png = pngsBySize[size];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8); // bytes in res
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([dir, ...entries, ...SIZES.map((s) => pngsBySize[s])]);
}

async function main() {
  const svg = fs.readFileSync(path.join(__dirname, 'app-icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, backgroundColor: '#00000000' });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;padding:0;background:transparent">${svg}</body></html>`));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  const base = img.toPNG();
  fs.writeFileSync(path.join(__dirname, 'icon.png'), base);

  const pngsBySize = {};
  for (const size of SIZES) {
    const ni = img.resize({ width: size, height: size });
    pngsBySize[size] = ni.toPNG();
  }
  const ico = pngToIco(pngsBySize);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), ico);
  console.log('Wrote icon.png and icon.ico (' + ico.length + ' bytes)');
  win.close();
  app.quit();
}

app.whenReady().then(main);
