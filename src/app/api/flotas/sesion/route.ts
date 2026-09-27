import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { apiPost } from '@/lib/orionApi';
import { notificarCambio } from '../eventos/notificador';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');
const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas

function extractUsername(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload  = token.slice(0, dot);
  const sig      = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
  if (expected !== sig) return null;

  // Formato nuevo: username:role:timestamp:random — Formato viejo: username:timestamp:random
  const parts = payload.split(':');
  const username = parts[0];
  if (!username) return null;

  const tsStr = parts.length >= 4 ? parts[2] : parts[1];
  const ts = parseInt(tsStr, 10);
  if (!ts || Date.now() - ts > TOKEN_MAX_AGE) return null; // expirado

  return username;
}

// POST { action: 'join'|'leave'|'heartbeat', carpeta_id }
export async function POST(req: NextRequest) {
  const tok      = req.cookies.get('orion_session')?.value;
  const username = tok ? extractUsername(tok) : null;
  if (!username) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { action, carpeta_id } = await req.json() as { action: string; carpeta_id: string };
  if (!carpeta_id) return NextResponse.json({ error: 'carpeta_id requerido' }, { status: 400 });

  try {
    const res  = await apiPost('/sesion', { action, carpeta_id, username });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    if (action === 'join' || action === 'leave') notificarCambio();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[sesion]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
