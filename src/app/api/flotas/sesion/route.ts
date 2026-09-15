import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { apiPost } from '@/lib/orionApi';
import { notificarCambio } from '../eventos/notificador';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? 'change_me_in_prod';

function extractUsername(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload  = token.slice(0, dot);
  const sig      = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
  if (expected !== sig) return null;
  const colonIdx = payload.indexOf(':');
  if (colonIdx < 0) return null;
  return payload.slice(0, colonIdx) || null;
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
