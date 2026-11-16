let keyCache;
const encoder = new TextEncoder();

function decodeJwtPart(part) {
 const binary = atob(part.replaceAll('-', '+').replaceAll('_', '/'));
 return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function accessIdentity(request, env) {
 const team = env.RADAR_ACCESS_TEAM_DOMAIN;
 const audience = env.RADAR_ACCESS_AUD;
 const token = request.headers.get('Cf-Access-Jwt-Assertion');
 if (!team || !audience || !token || token.length > 16384 || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return null;
 try {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const decoder = new TextDecoder();
  const header = JSON.parse(decoder.decode(decodeJwtPart(parts[0])));
  const claims = JSON.parse(decoder.decode(decodeJwtPart(parts[1])));
  const issuer = 'https://' + team;
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
      claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
      typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') return null;
  if (keyCache?.issuer !== issuer || keyCache.expires <= now || !keyCache.keys.some(key => key.kid === header.kid)) {
   const response = await fetch(issuer + '/cdn-cgi/access/certs', { redirect: 'error' });
   if (!response.ok) return null;
   const {keys} = await response.json();
   if (!Array.isArray(keys)) return null;
   keyCache = {issuer, keys, expires: now + 300};
  }
  const jwk = keyCache.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
  const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeJwtPart(parts[2]), encoder.encode(parts[0]+'.'+parts[1]));
  return verified ? {id: claims.sub, email: claims.email} : null;
 } catch {
  return null;
 }
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
 if (env.RADAR_IDENTITY_MODE === 'cloudflare-access' && request.method === 'POST' && new URL(request.url).pathname === '/mcp' && await validJobToken(request,env)) {
  return {id:'!job',owner:true};
 }
 const identity = env.RADAR_IDENTITY_MODE === 'cloudflare-access' ? await accessIdentity(request,env) :
  env.RADAR_IDENTITY_MODE === 'chatgpt-sites' ? {id:request.headers.get('oai-authenticated-user-id'),email:request.headers.get('oai-authenticated-user-email')} : null;
 if (!identity?.id) return null;
 const ownerEmail = env.RADAR_OWNER_EMAIL?.trim().toLowerCase();
 return {id:identity.id, owner:!!ownerEmail && identity.email?.trim().toLowerCase() === ownerEmail};
}
