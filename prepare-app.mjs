import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';

const zipPath = path.resolve('Central-auth-system-main.zip');
const outDir = path.resolve('.render-runtime');

if (!fs.existsSync(zipPath)) throw new Error(`Missing ${zipPath}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const archive = await unzipper.Open.file(zipPath);
console.log(`Archive entries: ${archive.files.length}`);

for (const entry of archive.files) {
  const target = path.resolve(outDir, entry.path);
  if (!target.startsWith(outDir + path.sep)) throw new Error(`Unsafe archive path: ${entry.path}`);
  if (entry.type === 'Directory' || entry.path.endsWith('/')) {
    fs.mkdirSync(target, { recursive: true });
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await pipeline(entry.stream(), fs.createWriteStream(target, { mode: 0o644 }));
}

const appRoot = path.join(outDir, 'central-auth-v3.3.0');
const packagePath = path.join(appRoot, 'package.json');
const serverPath = path.join(appRoot, 'src', 'server.js');

if (!fs.existsSync(packagePath)) throw new Error('Archive extraction succeeded, but central-auth-v3.3.0/package.json is missing.');
if (!fs.existsSync(serverPath)) throw new Error('Archive extraction succeeded, but central-auth-v3.3.0/src/server.js is missing.');

console.log(`Prepared application at ${appRoot}`);
