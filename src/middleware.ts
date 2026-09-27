import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/logout'];
const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24 horas

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret) return false; // fail-closed: sin SESSION_SECRET nadie entra

    const dot = token.lastIndexOf('.');
    if (dot < 0) return false;
    const payload = token.slice(0, dot);
    const sigHex  = token.slice(dot + 1);

    // Verificar firma HMAC
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const buf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const expected = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected !== sigHex) return false;

    // Comprobar expiración — formato nuevo (4 partes) o viejo (3 partes)
    const parts = payload.split(':');
    const tsStr = parts.length >= 4 ? parts[2] : parts[1];
    const ts = parseInt(tsStr, 10);
    if (!ts || Date.now() - ts > TOKEN_MAX_AGE) return false;

    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const tok = req.cookies.get('orion_session')?.value;
  if (!tok || !(await verifyToken(tok))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mjs|pdf)$).*)'],
};
