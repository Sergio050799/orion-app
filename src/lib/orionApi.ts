const BASE = process.env.ORION_API_URL ?? 'http://localhost:3001';
const KEY  = process.env.ORION_API_KEY  ?? 'dev_secret_local';

const HEADERS = {
  'X-Api-Key':    KEY,
  'Content-Type': 'application/json',
};

export async function apiGet(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: HEADERS,
    cache: 'no-store',
  });
}

export async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
}
