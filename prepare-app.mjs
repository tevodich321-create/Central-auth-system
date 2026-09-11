import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';

const zipPath = path.resolve('Central-auth-system-main.zip');
const outDir = path.resolve('.render-runtime');

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

// The GitHub upload may itself contain another zip. Unpack nested archives until
// the actual Central Auth application is found, while refusing path traversal.
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

  const packageExists = (() => {
    const direct = path.join(outDir, 'central-auth-v3.3.0', 'package.json');
    if (fs.existsSync(direct)) return true;
    return nested.some((z) => z.includes('central-auth-v3.3.0'));
  })();

  if (packageExists) break;
  if (!nested.length) break;

  for (const nestedZip of nested) {
    const nestedOut = path.join(path.dirname(nestedZip), `.nested-${path.basename(nestedZip, '.zip')}`);
    fs.mkdirSync(nestedOut, { recursive: true });
    await extractZip(nestedZip, nestedOut);
  }
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.isFile() && entry.name === name) return full;
  }
  return null;
}

const packagePath = findFile(outDir, 'package.json');
if (!packagePath) throw new Error('Could not find the application package.json after expanding the uploaded archive.');

let appRoot = path.dirname(packagePath);
let serverPath = path.join(appRoot, 'src', 'server.js');
if (!fs.existsSync(serverPath)) throw new Error(`Found package.json at ${appRoot}, but src/server.js is missing.`);

console.log(`Prepared application at ${appRoot}`);
