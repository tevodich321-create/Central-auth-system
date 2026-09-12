import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('.render-runtime/central-auth-v3.3.0');
const configFile = path.join(appRoot, 'src', 'config.js');
const serverFile = path.join(appRoot, 'src', 'server.js');
const firebaseFile = path.join(appRoot, 'src', 'firebase-auth.js');

if (!fs.existsSync(path.join(appRoot, 'package.json')) || !fs.existsSync(serverFile)) {
  throw new Error(`Central Auth runtime was not prepared at ${appRoot}`);
}

function replaceOnce(filePath, pattern, replacement, description) {
  const before = fs.readFileSync(filePath, 'utf8');
  if (!before.includes(pattern)) throw new Error(`Expected patch anchor not found in ${filePath}: ${description}`);
  fs.writeFileSync(filePath, before.replace(pattern, replacement), 'utf8');
}

fs.writeFileSync(firebaseFile, `import crypto from 'node:crypto';

function firebaseErrorMessage(payload) {
  return payload?.error?.message || payload?.error?.errors?.[0]?.message || 'Firebase Authentication request failed.';
}

async function firebaseRequest(apiKey, action, body, locale = '') {
  if (!apiKey) { const err = new Error('Firebase API key is not configured.'); err.code = 'FIREBASE_NOT_CONFIGURED'; throw err; }
  const response = await fetch(\`https://identitytoolkit.googleapis.com/v1/accounts:\${action}?key=\${encodeURIComponent(apiKey)}\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(locale ? { 'X-Firebase-Locale': locale } : {}) },
    body: JSON.stringify(body),
    redirect: 'error',
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const err = new Error(firebaseErrorMessage(payload));
    err.code = payload?.error?.message || \`FIREBASE_HTTP_\${response.status}\`;
    err.status = response.status;
    throw err;
  }
  return payload;
}

export function firebaseShadowPassword(cfg, userId) {
  const secret = cfg.firebaseShadowSecret || cfg.encryptionKey;
  if (!secret) { const err = new Error('FIREBASE_SHADOW_SECRET is not configured.'); err.code = 'FIREBASE_SHADOW_SECRET_MISSING'; throw err; }
  return crypto.createHmac('sha256', secret).update(\`central-auth-firebase-shadow-v1:\${userId}\`).digest('base64url');
}

export async function firebaseCreateShadowUser(cfg, { email, userId }) {
  const password = firebaseShadowPassword(cfg, userId);
  try {
    return await firebaseRequest(cfg.firebaseApiKey, 'signUp', { email, password, returnSecureToken: true });
  } catch (error) {
    if (error?.code === 'EMAIL_EXISTS') {
      return firebaseRequest(cfg.firebaseApiKey, 'signInWithPassword', { email, password, returnSecureToken: true });
    }
    throw error;
  }
}

export async function firebaseSendVerification(cfg, { idToken, continueUrl, locale = '' }) {
  return firebaseRequest(cfg.firebaseApiKey, 'sendOobCode', { requestType: 'VERIFY_EMAIL', idToken, continueUrl }, locale);
}

export async function firebaseCheckVerified(cfg, { email, userId }) {
  const password = firebaseShadowPassword(cfg, userId);
  const signedIn = await firebaseRequest(cfg.firebaseApiKey, 'signInWithPassword', { email, password, returnSecureToken: true });
  const info = await firebaseRequest(cfg.firebaseApiKey, 'lookup', { idToken: signedIn.idToken });
  const record = info?.users?.[0];
  return { verified: !!record?.emailVerified, localId: record?.localId || '' };
}

export async function firebaseDeleteShadowUser(cfg, { idToken }) {
  return firebaseRequest(cfg.firebaseApiKey, 'delete', { idToken });
}
`, 'utf8');

replaceOnce(
  configFile,
  "  resendApiKey: process.env.RESEND_API_KEY || '',\n  resendEndpoint: process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails',\n  brevoApiKey: process.env.BREVO_API_KEY || '',\n  brevoEndpoint: process.env.BREVO_ENDPOINT || 'https://api.brevo.com/v3/smtp/email',\n  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),",
  "  resendApiKey: process.env.RESEND_API_KEY || '',\n  resendEndpoint: process.env.RESEND_ENDPOINT || 'https://api.resend.com/emails',\n  brevoApiKey: process.env.BREVO_API_KEY || '',\n  brevoEndpoint: process.env.BREVO_ENDPOINT || 'https://api.brevo.com/v3/smtp/email',\n  firebaseApiKey: process.env.FIREBASE_API_KEY || '',\n  firebaseShadowSecret: process.env.FIREBASE_SHADOW_SECRET || process.env.ENCRYPTION_KEY || '',\n  firebaseContinueBaseUrl: (process.env.FIREBASE_CONTINUE_BASE_URL || baseUrl).replace(/\\/$/, ''),\n  emailProvider: (process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase(),",
  'Firebase config variables'
);
replaceOnce(
  configFile,
  "if (config.isProd && config.requireEmailDelivery && !config.smtpHost && !config.resendApiKey && !config.brevoApiKey) throw new Error('SMTP_HOST, RESEND_API_KEY, or BREVO_API_KEY is required when email delivery is required in production.');",
  "if (config.isProd && config.requireEmailDelivery && !config.smtpHost && !config.resendApiKey && !config.brevoApiKey && !config.firebaseApiKey) throw new Error('SMTP_HOST, RESEND_API_KEY, BREVO_API_KEY, or FIREBASE_API_KEY is required when email delivery is required in production.');",
  'Firebase required email validation'
);

replaceOnce(
  serverFile,
  "import { EmailService } from './email.js';",
  "import { EmailService } from './email.js';\nimport { firebaseCheckVerified, firebaseCreateShadowUser, firebaseDeleteShadowUser, firebaseSendVerification } from './firebase-auth.js';",
  'Firebase helper import'
);

replaceOnce(
  serverFile,
  "  async function sendVerificationEmail(user) {\n    const token=db.createEmailToken(user.id,cfg.emailTokenTtl*1000);\n    const verifyUrl=`${cfg.baseUrl}/verify-email?token=${encodeURIComponent(token)}`;\n    return sendOrQueue({to:user.email,subject:'Verify your Central Auth account',text:`Verify your email: ${verifyUrl}\\n\\nThis link expires in 30 minutes.`,html:`<p>Verify your email to activate your Central Auth account.</p><p><a href=\"${escapeHtml(verifyUrl)}\">Verify email</a></p><p>This link expires in 30 minutes.</p>`});\n  }",
  "  async function sendVerificationEmail(user) {\n    const token=db.createEmailToken(user.id,cfg.emailTokenTtl*1000);\n    if(cfg.firebaseApiKey){\n      let firebase;\n      try {\n        firebase=await firebaseCreateShadowUser(cfg,{email:user.email,userId:user.id});\n        const continueUrl=`${cfg.firebaseContinueBaseUrl}/firebase-verified?token=${encodeURIComponent(token)}`;\n        try {\n          const result=await firebaseSendVerification(cfg,{idToken:firebase.idToken,continueUrl});\n          return {sent:true,queued:false,provider:'firebase',firebaseEmail:result.email||user.email};\n        } catch(error) {\n          error.firebaseIdToken=firebase.idToken;\n          throw error;\n        }\n      } catch(error) { throw error; }\n    }\n    const verifyUrl=`${cfg.baseUrl}/verify-email?token=${encodeURIComponent(token)}`;\n    return sendOrQueue({to:user.email,subject:'Verify your Central Auth account',text:`Verify your email: ${verifyUrl}\\n\\nThis link expires in 30 minutes.`,html:`<p>Verify your email to activate your Central Auth account.</p><p><a href=\"${escapeHtml(verifyUrl)}\">Verify email</a></p><p>This link expires in 30 minutes.</p>`});\n  }",
  'Firebase verification sender'
);

replaceOnce(
  serverFile,
  "      let user;try{user=db.createUser(emailValue,password,displayName);}catch{html(res,500,page('Registration failed','<section class=\"card narrow\"><div class=\"message error\">The account could not be created.</div></section>'));return;}\n      const delivery=await sendVerificationEmail(user);",
  "      let user;try{user=db.createUser(emailValue,password,displayName);}catch{html(res,500,page('Registration failed','<section class=\"card narrow\"><div class=\"message error\">The account could not be created.</div></section>'));return;}\n      let delivery;try{delivery=await sendVerificationEmail(user);}catch(error){try{if(cfg.firebaseApiKey && error?.firebaseIdToken) await firebaseDeleteShadowUser(cfg,{idToken:error.firebaseIdToken});}catch{} try{db.deleteUser(user.id);}catch{} audit(req,'system',null,'registration_email_provider_failed',{code:error?.code||'EMAIL_ERROR'}); html(res,503,page('Registration temporarily unavailable','<section class=\"card narrow\"><div class=\"message error\">We could not send the verification email. Please try again later.</div></section>'));return;}\n      ",
  'Firebase registration failure handling'
);

replaceOnce(
  serverFile,
  "    if(pathname==='/verify-email'&&method==='GET'){",
  "    if(pathname==='/firebase-verified'&&method==='GET'){\n      const token=url.searchParams.get('token')||'',row=db.getEmailToken(token);\n      if(!cfg.firebaseApiKey){redirect(res,`/verify-email?token=${encodeURIComponent(token)}`);return;}\n      if(!row){html(res,400,page('Verification failed','<section class=\"card narrow\"><div class=\"message error\">This verification link is invalid, already used, or expired.</div><a href=\"/resend-verification\">Request another verification email</a></section>'));return;}\n      const user=db.getUserById(row.user_id);\n      if(!user){html(res,400,page('Verification failed','<section class=\"card narrow\"><div class=\"message error\">This verification link is invalid, already used, or expired.</div></section>'));return;}\n      try {\n        const result=await firebaseCheckVerified(cfg,{email:user.email,userId:user.id});\n        if(!result.verified){html(res,200,page('Email verification pending','<section class=\"card narrow\"><div class=\"message warn\">Firebase has not marked this email as verified yet. Please open the verification email first.</div><a href=\"/resend-verification\">Resend verification</a></section>'));return;}\n        const verifiedUser=db.consumeEmailToken(token);\n        if(!verifiedUser){html(res,400,page('Verification failed','<section class=\"card narrow\"><div class=\"message error\">This verification link is invalid, already used, or expired.</div></section>'));return;}\n        db.setEmailVerified(verifiedUser.id);audit(req,'user',verifiedUser.id,'email_verified',{provider:'firebase'});\n        html(res,200,page('Email verified','<section class=\"card narrow\"><div class=\"message success\">Your email is verified. You can now sign in.</div><a href=\"/login\">Sign in</a></section>'));return;\n      } catch(error){\n        audit(req,'system',user.id,'firebase_verification_check_failed',{code:error?.code||'FIREBASE_ERROR'});\n        html(res,503,page('Verification temporarily unavailable','<section class=\"card narrow\"><div class=\"message warn\">We could not check Firebase verification right now. Please try again in a few moments.</div></section>'));return;\n      }\n    }\n\n    if(pathname==='/verify-email'&&method==='GET'){",
  'Firebase callback route'
);

replaceOnce(
  serverFile,
  "      const user=db.getUserByEmail(normalizeEmail(body.get('email')));if(user&&!user.email_verified&&!user.disabled){const delivery=await sendVerificationEmail(user);audit(req,'user',user.id,delivery.sent?'verification_email_sent':'verification_email_queued',{jobId:delivery.jobId||null});}",
  "      const user=db.getUserByEmail(normalizeEmail(body.get('email')));if(user&&!user.email_verified&&!user.disabled){try{const delivery=await sendVerificationEmail(user);audit(req,'user',user.id,delivery.sent?'verification_email_sent':'verification_email_queued',{jobId:delivery.jobId||null,provider:delivery.provider||cfg.emailProvider});}catch(error){audit(req,'system',user.id,'verification_email_failed',{code:error?.code||'EMAIL_ERROR'});}}",
  'Firebase resend verification'
);

console.log('Firebase email-verification integration patched successfully.');
