const site = () => process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';

export function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

export function methodNotAllowed(allowed) {
  return { statusCode: 405, headers: { Allow: allowed.join(', '), 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
}

export function readBody(event) {
  try { return JSON.parse(event.body || '{}'); }
  catch { throw Object.assign(new Error('Neplatné JSON telo požiadavky.'), { statusCode: 400 }); }
}

export async function getUser(event) {
  const token = event.headers?.authorization?.replace(/^Bearer\s+/i, '');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !key) throw Object.assign(new Error('Prihlásenie alebo Supabase nie je nakonfigurované.'), { statusCode: 401 });
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } });
  if (!response.ok) throw Object.assign(new Error('Prihlásenie vypršalo. Prihlás sa znova.'), { statusCode: 401 });
  return response.json();
}

export async function db(path, { method = 'GET', body, prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error('Serverová databáza nie je nakonfigurovaná.'), { statusCode: 503 });
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(new Error(`Databázová požiadavka zlyhala (${response.status}).`), { statusCode: 502, detail: text.slice(0, 500) });
  return text ? JSON.parse(text) : null;
}

export function userError(error) {
  console.error(error);
  return json(error.statusCode || 500, { error: error.statusCode ? error.message : 'Požiadavku sa nepodarilo spracovať.' });
}

export const siteUrl = site;
