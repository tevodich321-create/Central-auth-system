import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';

const zipPath = path.resolve('Central-auth-system-main.zip');
const outDir = path.resolve('.render-runtime');
const fixedAppRoot = path.join(outDir, 'central-auth-v3.3.0');

if (!fs.existsSync(zipPath)) throw new Error(`Missing ${zipPath}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

async function extractZip(filePath, destination) {
  const archive = await unzipper.Open.file(filePath);
  console.log(`Extracting ${path.relative(process.cwd(), filePath)} (${archive.files.length} entries)`);
  for (const entry of archive.files) {
    const target = path.resolve(destination, entry.path);
    if (!target.startsWith(destination + path.sep)) throw new Error(`Unsafe archive path: ${entry.path}`);
    if (entry.type === 'Directory' || entry.path.endsWith('/')) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await pipeline(entry.stream(), fs.createWriteStream(target, { mode: 0o644 }));
  }
}

await extractZip(zipPath, outDir);

for (let pass = 0; pass < 3; pass++) {
  const nested = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.zip')) nested.push(full);
    }
  };
  walk(outDir);

  const packageAlreadyExists = fs.existsSync(path.join(outDir, 'central-auth-v3.3.0', 'package.json'));
  if (packageAlreadyExists) break;
  if (!nested.length) break;

  for (const nestedZip of nested) {
    const nestedOut = path.join(path.dirname(nestedZip), `.nested-${path.basename(nestedZip, '.zip')}`);
    fs.mkdirSync(nestedOut, { recursive: true });
    await extractZip(nestedZip, nestedOut);
  }
}

function findPackageRoot(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findPackageRoot(full);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === 'package.json') {
      const candidate = path.dirname(full);
      if (fs.existsSync(path.join(candidate, 'src', 'server.js'))) return candidate;
    }
  }
  return null;
}

let appRoot = findPackageRoot(outDir);
if (!appRoot) throw new Error('Could not find Central Auth package.json + src/server.js after expanding the uploaded archive.');

if (path.resolve(appRoot) !== path.resolve(fixedAppRoot)) {
  fs.rmSync(fixedAppRoot, { recursive: true, force: true });
  fs.mkdirSync(fixedAppRoot, { recursive: true });
  fs.cpSync(appRoot, fixedAppRoot, { recursive: true });
  appRoot = fixedAppRoot;
}

console.log(`Prepared application at ${appRoot}`);
