import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost, apiPut } from '@/lib/orionApi';

export const runtime = 'nodejs';

// Facturación de flotas (recibos RC / RW): pasarela a orion-api. El usuario sale de la sesión, no del navegador.
//   GET  /api/facturacion/<carpeta>                    datos de facturación + histórico
//   PUT  /api/facturacion/<carpeta>/config
//   POST /api/facturacion/<carpeta>/comprobar | emitir
//   GET  /api/facturacion/factura/<id>                 · POST …/anular

function usuarioDe(req: NextRequest): string {
  const tok = req.cookies.get('orion_session')?.value ?? '';
  const dot = tok.lastIndexOf('.');
  if (dot < 0) return '';
  return tok.slice(0, dot).split(':')[0] ?? '';
}

type Ctx = { params: Promise<{ ruta: string[] }> };
const destino = async (ctx: Ctx) => '/facturacion/' + (await ctx.params).ruta.map(encodeURIComponent).join('/');
const caido = () => NextResponse.json({ error: 'El servicio de facturación no responde. Inténtalo de nuevo.' }, { status: 503 });

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const res = await apiGet(await destino(ctx));
    return NextResponse.json(await res.json(), { status: res.status });
  } catch { return caido(); }
}

async function conCuerpo(req: NextRequest, ctx: Ctx, enviar: typeof apiPost) {
  try {
    const body = await req.json().catch(() => ({}));
    body.usuario = usuarioDe(req);
    const res = await enviar(await destino(ctx), body);
    return NextResponse.json(await res.json(), { status: res.status });
  } catch { return caido(); }
}

export async function POST(req: NextRequest, ctx: Ctx) { return conCuerpo(req, ctx, apiPost); }
export async function PUT(req: NextRequest, ctx: Ctx) { return conCuerpo(req, ctx, apiPut); }
