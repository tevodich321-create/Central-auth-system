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

function replaceOnce(filePath, pattern, replacement, description) {
  const before = fs.readFileSync(filePath, 'utf8');
  if (!before.includes(pattern)) throw new Error(`Expected patch anchor not found in ${filePath}: ${description}`);
  const after = before.replace(pattern, replacement);
  fs.writeFileSync(filePath, after, 'utf8');
}

// Add Brevo HTTP API support at build time without requiring a binary rewrite of the uploaded archive.
const emailFile = path.join(appRoot, 'src', 'email.js');
const configFile = path.join(appRoot, 'src', 'config.js');

replaceOnce(
  emailFile,
  "if(this.config.emailProvider==='resend') return !!this.config.resendApiKey;\n    if(this.config.emailProvider==='smtp') return !!this.config.smtpHost;\n    return !!this.config.smtpHost || !!this.config.resendApiKey;",
  "if(this.config.emailProvider==='resend') return !!this.config.resendApiKey;\n    if(this.config.emailProvider==='brevo') return !!this.config.brevoApiKey;\n    if(this.config.emailProvider==='smtp') return !!this.config.smtpHost;\n    return !!this.config.smtpHost || !!this.config.resendApiKey || !!this.config.brevoApiKey;",
  'EmailService.isConfigured providers'
);

replaceOnce(
  emailFile,
  "const provider=this.config.emailProvider==='auto' ? (this.config.resendApiKey?'resend':(this.config.smtpHost?'smtp':'')) : this.config.emailProvider;",
  "const provider=this.config.emailProvider==='auto' ? (this.config.brevoApiKey?'brevo':(this.config.resendApiKey?'resend':(this.config.smtpHost?'smtp':''))) : this.config.emailProvider;",
  'automatic provider selection'
);

replaceOnce(
  emailFile,
  "    if (!this.config.smtpHost) {",
  "    if(provider==='brevo') {\n" +
  "      if(!this.config.brevoApiKey){const err=new Error('Brevo API key is not configured. Email delivery is BLOCKED.');err.code='BREVO_NOT_CONFIGURED';throw err;}\n" +
  "      if(this.config.nodeEnv==='production' && !String(this.config.brevoEndpoint).startsWith('https://')){const err=new Error('Brevo endpoint must use HTTPS in production.');err.code='BREVO_INSECURE_ENDPOINT';throw err;}\n" +
  "      const controller=new AbortController();\n" +
  "      const timeout=setTimeout(()=>controller.abort(),10000);\n" +
  "      const fromMatch=String(this.config.emailFrom).match(/<([^>]+)>/);\n" +
  "      const fromEmail=(fromMatch?.[1]||String(this.config.emailFrom)).trim();\n" +
  "      const fromName=fromMatch ? String(this.config.emailFrom).replace(/\\s*<[^>]+>\\s*$/,'').trim() : 'Central Auth';\n" +
  "      let response;\n" +
  "      try {\n" +
  "        response=await fetch(this.config.brevoEndpoint,{\n" +
  "          method:'POST',\n" +
  "          headers:{'api-key':this.config.brevoApiKey,'Content-Type':'application/json','Accept':'application/json'},\n" +
  "          body:JSON.stringify({sender:{name:fromName,email:fromEmail},to:[{email:to}],subject,textContent:text,htmlContent:html}),\n" +
  "          signal:controller.signal,\n" +
  "          redirect:'error',\n" +
  "        });\n" +
  "      } catch(error){\n" +
  "        const message=error?.name==='AbortError'?'Brevo request timed out.':('Brevo request failed: '+(error?.message||'network error'));\n" +
  "        const err=new Error(message);\n" +
  "        err.code=error?.name==='AbortError'?'BREVO_TIMEOUT':'BREVO_NETWORK_ERROR';\n" +
  "        throw err;\n" +
  "      } finally { clearTimeout(timeout); }\n" +
  "      if(!response.ok){\n" +
  "        const body=await response.text().catch(()=> '');\n" +
  "        const err=new Error('Brevo request failed ('+response.status+'): '+body.slice(0,500));\n" +
  "        err.code='BREVO_HTTP_ERROR';\n" +
  "        throw err;\n" +
  "      }\n" +
  "      return;\n" +
  "    }\n" +
  "    if (!this.config.smtpHost) {",
  'Brevo HTTP API sender'
);

replaceOnce(
  configFile,
  "  resendApiKey: process.env.RESEND_API_KEY || '',\n  resendEndpoint: process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails',\n  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),",
  "  resendApiKey: process.env.RESEND_API_KEY || '',\n  resendEndpoint: process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails',\n  brevoApiKey: process.env.BREVO_API_KEY || '',\n  brevoEndpoint: process.env.BREVO_ENDPOINT || 'https://api.brevo.com/v3/smtp/email',\n  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),",
  'Brevo config variables'
);

replaceOnce(
  configFile,
  "if (!['smtp','resend','auto'].includes(config.emailProvider)) throw new Error('EMAIL_PROVIDER must be smtp, resend, or auto.');",
  "if (!['smtp','resend','brevo','auto'].includes(config.emailProvider)) throw new Error('EMAIL_PROVIDER must be smtp, resend, brevo, or auto.');",
  'Brevo provider allow-list'
);

replaceOnce(
  configFile,
  "if (config.isProd && config.requireEmailDelivery && !config.smtpHost && !config.resendApiKey) throw new Error('SMTP_HOST or RESEND_API_KEY is required when email delivery is required in production.');",
  "if (config.isProd && config.requireEmailDelivery && !config.smtpHost && !config.resendApiKey && !config.brevoApiKey) throw new Error('SMTP_HOST, RESEND_API_KEY, or BREVO_API_KEY is required when email delivery is required in production.');",
  'required provider validation'
);

replaceOnce(
  configFile,
  "if (config.isProd && config.emailProvider === 'resend' && !config.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend in production.');",
  "if (config.isProd && config.emailProvider === 'resend' && !config.resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend in production.');\nif (config.isProd && config.emailProvider === 'brevo' && !config.brevoApiKey) throw new Error('BREVO_API_KEY is required when EMAIL_PROVIDER=brevo in production.');",
  'Brevo provider validation'
);

replaceOnce(
  configFile,
  "if (config.isProd && config.resendApiKey && !config.resendEndpoint.startsWith('https://')) throw new Error('RESEND_ENDPOINT must use https:// in production.');",
  "if (config.isProd && config.resendApiKey && !config.resendEndpoint.startsWith('https://')) throw new Error('RESEND_ENDPOINT must use https:// in production.');\nif (config.isProd && config.brevoApiKey && !config.brevoEndpoint.startsWith('https://')) throw new Error('BREVO_ENDPOINT must use https:// in production.');",
  'Brevo HTTPS validation'
);

console.log(`Prepared application at ${appRoot}`);
console.log('Brevo HTTP API support enabled; set BREVO_API_KEY and EMAIL_FROM in the deployment environment.');
