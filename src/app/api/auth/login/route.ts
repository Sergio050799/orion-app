import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { apiPost } from '@/lib/orionApi';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? 'change_me_in_prod';

function makeToken(username: string): string {
  const payload = `${username}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function setCookieAndReturn(username: string) {
  const token = makeToken(username.toUpperCase());
  const res = NextResponse.json({ success: true });
  res.cookies.set('orion_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ success: false, error: 'Faltan credenciales' }, { status: 400 });
  }

  // Verificar contra la API Python (SQLite)
  try {
    const res = await apiPost('/auth/verify', { username, password });
    const data = await res.json() as { ok: boolean; username?: string; error?: string };
    if (data.ok && data.username) {
      return setCookieAndReturn(data.username);
    }
  } catch (err) {
    console.error('[login] API error, usando fallback env:', err);
  }

  // Fallback: credenciales de entorno por si la API no está disponible
  const usernameUpper = String(username).trim().toUpperCase();
  const ALLOWED_USERS = ['MMT', 'TITAN', 'CARLOS', 'RAQUEL', 'SERGIO', 'CARLOSMMT', 'SERGIOMMT'];
  if (
    ALLOWED_USERS.includes(usernameUpper) &&
    String(password) === (process.env.ORION_ADMIN_PASSWORD ?? 'MMT2026')
  ) {
    return setCookieAndReturn(usernameUpper);
  }

  return NextResponse.json(
    { success: false, error: 'Usuario o contraseña incorrectos' },
    { status: 401 },
  );
}
