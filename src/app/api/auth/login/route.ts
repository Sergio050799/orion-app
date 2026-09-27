import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');

// ─── Rate limiting (in-memory, por IP) ───────────────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// ─── Token — formato: username:role:timestamp:random.hmac ────────────────────
function makeToken(username: string, role: string): string {
  const payload = `${username}:${role}:${Date.now()}:${randomBytes(8).toString('hex')}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function setCookieAndReturn(username: string, role: string) {
  const token = makeToken(username.toUpperCase(), role);
  const res = NextResponse.json({ success: true });
  res.cookies.set('orion_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos. Espera 15 minutos.' },
      { status: 429 },
    );
  }

  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Faltan credenciales' }, { status: 400 });
  }

  // Verificar contra la API Python (SQLite)
  try {
    const res = await apiPost('/auth/verify', { username, password });
    const data = await res.json() as { ok: boolean; username?: string; rol?: string; error?: string };
    if (data.ok && data.username) {
      return setCookieAndReturn(data.username, data.rol || 'usuario');
    }
  } catch (err) {
    console.error('[login] API error, usando fallback env:', err);
  }

  // Fallback de emergencia (solo si la API Python no responde)
  const usernameUpper = String(username).trim().toUpperCase();
  const fallbackPassword = process.env.ORION_ADMIN_PASSWORD;
  const ADMIN_USERS  = ['SERGIO'];
  const ALLOWED_USERS = ['TITAN', 'CARLOS', 'RAQUEL', 'SERGIO'];
  if (
    fallbackPassword &&
    ALLOWED_USERS.includes(usernameUpper) &&
    String(password) === fallbackPassword
  ) {
    const role = ADMIN_USERS.includes(usernameUpper) ? 'admin' : 'usuario';
    return setCookieAndReturn(usernameUpper, role);
  }

  return NextResponse.json(
    { success: false, error: 'Usuario o contraseña incorrectos' },
    { status: 401 },
  );
}
