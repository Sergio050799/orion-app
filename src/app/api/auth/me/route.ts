import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export const runtime = 'nodejs';

const SECRET = process.env.SESSION_SECRET ?? 'change_me_in_prod';

function extractUsername(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
  if (expected !== sig) return null;
  // New token format: username:timestamp:random
  const colonIdx = payload.indexOf(':');
  if (colonIdx < 0) return null; // old-format token (no username encoded)
  const username = payload.slice(0, colonIdx);
  return username || null;
}

export async function GET(req: NextRequest) {
  const tok = req.cookies.get('orion_session')?.value;
  if (!tok) return NextResponse.json({ authenticated: false }, { status: 401 });
  const username = extractUsername(tok);
  if (!username) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, username });
}
