import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex');
const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas

function extractSession(token: string): { username: string; role: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
  if (expected !== sig) return null;

  // Formato nuevo: username:role:timestamp:random  (4 partes)
  // Formato viejo: username:timestamp:random        (3 partes)
  const parts = payload.split(':');
  const username = parts[0];
  if (!username) return null;

  const isNewFormat = parts.length >= 4;
  const role    = isNewFormat ? parts[1] : 'usuario';
  const tsStr   = isNewFormat ? parts[2] : parts[1];
  const ts = parseInt(tsStr, 10);

  if (!ts || Date.now() - ts > TOKEN_MAX_AGE) return null; // expirado

  return { username, role };
}

export async function GET(req: NextRequest) {
  const tok = req.cookies.get('orion_session')?.value;
  if (!tok) return NextResponse.json({ authenticated: false }, { status: 401 });
  const session = extractSession(tok);
  if (!session) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, username: session.username, role: session.role });
}
