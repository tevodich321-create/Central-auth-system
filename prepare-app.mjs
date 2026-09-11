import fs from 'node:fs';
import path from 'node:path';
import unzipper from 'unzipper';

const zipPath = path.resolve('Central-auth-system-main.zip');
const outDir = path.resolve('.render-runtime');

if (!fs.existsSync(zipPath)) {
  throw new Error(`Missing ${zipPath}`);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await fs.createReadStream(zipPath)
  .pipe(unzipper.Extract({ path: outDir }))
  .promise();

function findPackage(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findPackage(full);
      if (found) return found;
    } else if (entry.isFile() && entry.name === 'package.json') {
      return full;
    }
  }
  return null;
}

const packagePath = findPackage(outDir);
if (!packagePath) throw new Error('Could not find the application package.json in the archive.');

const appRoot = path.dirname(packagePath);
if (!fs.existsSync(path.join(appRoot, 'src', 'server.js'))) {
  throw new Error(`Application root ${appRoot} does not contain src/server.js.`);
}

console.log(`Prepared application at ${appRoot}`);
