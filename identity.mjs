const encoder = new TextEncoder();
const SESSION_COOKIE = 'radar_sessao';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// 100 mil é o máximo de iterações de PBKDF2 que o Workers aceita
const PBKDF2_ITERATIONS = 100000;

const toHex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = size => toHex(crypto.getRandomValues(new Uint8Array(size)));
const sha256 = async value => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
// RADAR_OWNER_EMAIL aceita vários e-mails separados por vírgula
const ownerEmails = env => (env.RADAR_OWNER_EMAIL ?? '').split(',').map(normalizeEmail).filter(Boolean);

async function hashPassword(password, salt) {
 const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
 return toHex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:PBKDF2_ITERATIONS}, key, 256));
}

function sameText(a, b) {
 if (a.length !== b.length) return false;
 let difference = 0;
 for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
 return difference === 0;
}

function passwordProblem(password, confirm) {
 if (typeof password !== 'string' || password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
 if (password.length > 200) return 'A senha pode ter no máximo 200 caracteres.';
 if (password !== confirm) return 'As senhas não conferem.';
 return '';
}

function temporaryPassword() {
 const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
 return [...crypto.getRandomValues(new Uint8Array(12))].map(n => letters[n % letters.length]).join('');
}

const sessionToken = request => request.headers.get('Cookie')?.match(/(?:^|;\s*)radar_sessao=([0-9a-f]{64})(?:;|$)/)?.[1];
const sessionCookie = (token, maxAge) => SESSION_COOKIE + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;

function withCookie(response, cookie) {
 response.headers.append('Set-Cookie', cookie);
 return response;
}

async function startSession(db, userId) {
 const token = randomHex(32);
 await db.prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES (?,?,?)').bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 864e5).run();
 return sessionCookie(token, SESSION_DAYS * 86400);
}

async function validJobToken(request, env) {
 const expected = env.RADAR_JOB_TOKEN;
 const supplied = request.headers.get('Authorization');
 if (typeof expected !== 'string' || expected.length < 32 || !supplied?.startsWith('Bearer ') || supplied.length > 1024) return false;
 const digest = value => crypto.subtle.digest('SHA-256', encoder.encode(value));
 const [a, b] = (await Promise.all([digest(expected),digest(supplied.slice(7))])).map(value=>new Uint8Array(value));
 let difference = 0;
 for (let i = 0; i < a.length; i++) difference |= a[i]^b[i];
 return difference === 0;
}

async function account(request, env) {
 if (request.method === 'POST' && new URL(request.url).pathname === '/mcp' && await validJobToken(request,env)) {
  return {id:'!job',owner:true};
 }
 const token = sessionToken(request);
 if (!token) return null;
 const user = await env.DB.prepare('SELECT u.id,u.email,u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').bind(await sha256(token), Date.now()).first();
 if (!user) return null;
 return {id:user.id, email:user.email, owner:ownerEmails(env).includes(user.email), mustChange:!!user.must_change};
}

// Rotas de conta: cadastro, login, saída, troca de senha e administração de contas.
async function authRoute(request, env, url, viewer) {
 const db = env.DB, path = url.pathname, method = request.method;
 const isOwner = viewer?.owner && viewer.id !== '!job';
 if (path === '/api/admin/accounts' && method === 'GET') {
  if (!isOwner) return json({error:'Somente o administrador pode ver as contas.'}, 403);
  const rows = await db.prepare('SELECT id,email,created,must_change FROM users ORDER BY created').all();
  return json({accounts:rows.results.map(r => ({id:r.id, email:r.email, created:r.created, mustChange:!!r.must_change, owner:ownerEmails(env).includes(r.email), self:r.id === viewer.id}))});
 }
 if (method !== 'POST') return null;
 if (request.headers.get('Origin') !== url.origin) return json({error:'Abra o Radar para continuar.'}, 403);
 const body = await request.json().catch(() => ({}));
 const now = Date.now();

 if (path === '/api/auth/register') {
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json({error:'Informe um e-mail válido.'}, 400);
  const problem = passwordProblem(body.password, body.confirm);
  if (problem) return json({error:problem}, 400);
  if (await db.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return json({error:'Já existe uma conta com esse e-mail. Use Entrar.'}, 409);
  const id = 'u-' + randomHex(16), salt = randomHex(16);
  await db.prepare('INSERT INTO users(id,email,salt,hash,must_change,created) VALUES (?,?,?,?,0,?)').bind(id, email, salt, await hashPassword(body.password, salt), new Date(now).toISOString()).run();
  return withCookie(json({saved:true}), await startSession(db, id));
 }

 if (path === '/api/auth/login') {
  const email = normalizeEmail(body.email), password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const attempts = await db.prepare('SELECT failures,locked_until FROM login_attempts WHERE email=?').bind(email).first();
  if (attempts?.locked_until > now) return json({error:'Muitas tentativas erradas. Tente de novo em ' + Math.ceil((attempts.locked_until - now) / 60000) + ' minuto(s).'}, 429);
  const user = await db.prepare('SELECT id,salt,hash FROM users WHERE email=?').bind(email).first();
  // calcula o hash mesmo sem conta, para o tempo de resposta não revelar quais e-mails existem
  const hash = await hashPassword(password, user?.salt ?? 'sem-conta');
  if (!user || !sameText(hash, user.hash)) {
   const failures = (attempts && attempts.locked_until <= now && attempts.failures >= MAX_FAILURES ? 0 : attempts?.failures ?? 0) + 1;
   const lockedUntil = failures >= MAX_FAILURES ? now + LOCK_MINUTES * 60000 : 0;
   if (email) await db.prepare('INSERT INTO login_attempts(email,failures,locked_until) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until').bind(email, failures, lockedUntil).run();
   return json({error:lockedUntil ? 'Muitas tentativas erradas. Tente de novo em ' + LOCK_MINUTES + ' minutos.' : 'E-mail ou senha incorretos.'}, lockedUntil ? 429 : 401);
  }
  await db.batch([
   db.prepare('DELETE FROM login_attempts WHERE email=?').bind(email),
   db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),
  ]);
  return withCookie(json({saved:true}), await startSession(db, user.id));
 }

 if (path === '/api/auth/logout') {
  const token = sessionToken(request);
  if (token) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
  return withCookie(json({saved:true}), sessionCookie('', 0));
 }

 if (!viewer || viewer.id === '!job') return json({error:'Entre com sua conta para continuar.'}, 401);

 if (path === '/api/auth/password') {
  const user = await db.prepare('SELECT salt,hash FROM users WHERE id=?').bind(viewer.id).first();
  if (!user || !sameText(await hashPassword(typeof body.current === 'string' ? body.current.slice(0, 200) : '', user.salt), user.hash)) return json({error:'A senha atual está incorreta.'}, 400);
  const problem = passwordProblem(body.password, body.confirm);
  if (problem) return json({error:problem}, 400);
  const salt = randomHex(16);
  await db.batch([
   db.prepare('UPDATE users SET salt=?,hash=?,must_change=0 WHERE id=?').bind(salt, await hashPassword(body.password, salt), viewer.id),
   db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(viewer.id, await sha256(sessionToken(request))),
  ]);
  return json({saved:true});
 }

 if (path === '/api/admin/accounts/reset' || path === '/api/admin/accounts/delete') {
  if (!isOwner) return json({error:'Somente o administrador pode alterar contas.'}, 403);
  const target = await db.prepare('SELECT id,email FROM users WHERE id=?').bind(String(body.id ?? '')).first();
  if (!target) return json({error:'Conta não encontrada.'}, 404);
  if (path.endsWith('/reset')) {
   const password = temporaryPassword(), salt = randomHex(16);
   await db.batch([
    db.prepare('UPDATE users SET salt=?,hash=?,must_change=1 WHERE id=?').bind(salt, await hashPassword(password, salt), target.id),
    db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),
    db.prepare('DELETE FROM login_attempts WHERE email=?').bind(target.email),
   ]);
   return json({password});
  }
  if (target.id === viewer.id) return json({error:'Você não pode excluir a própria conta.'}, 400);
  await db.batch([
   db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id),
   db.prepare('DELETE FROM account_records WHERE account=?').bind(target.id),
   db.prepare('DELETE FROM login_attempts WHERE email=?').bind(target.email),
   db.prepare('DELETE FROM users WHERE id=?').bind(target.id),
  ]);
  return json({deleted:true});
 }
 return null;
}
