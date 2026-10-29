import { NextRequest, NextResponse } from 'next/server';
import { apiGet, apiPost } from '@/lib/orionApi';
import { notificarCambio } from '../eventos/notificador';
import { getCarpetasCache, setCarpetasCache, invalidateCarpetasCache } from '@/lib/carpetasCache';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const isSummary = new URL(req.url).searchParams.get('summary') === 'true';

    const cached = getCarpetasCache(isSummary);
    if (cached) return NextResponse.json(cached);

    const res = await apiGet('/carpetas');
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    // ?summary=true — devuelve solo metadatos (sin original/trabajo/sinco)
    // Reduce el payload de ~5MB a ~200KB para la vista portfolio
    if (isSummary && Array.isArray(data)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stripped = data.map((c: any) => ({
        id: c.id, nombre: c.nombre, estado: c.estado,
        creadaEn: c.creadaEn, actualizadaEn: c.actualizadaEn,
        corredor_id: c.corredor_id, comisionBase: c.comisionBase ?? c.porcentajeComision,
        primaClienteTotal: c.primaClienteTotal, descuentoOferta: c.descuentoOferta,
        header: c.header, historico: c.historico, observaciones: c.observaciones,
        tarifaFlota: c.tarifaFlota,
        // oferta solo con los campos que necesita el portfolio (prima calc)
        oferta: Array.isArray(c.oferta)
          ? c.oferta.map((r: any) => ({
              matricula: r.matricula,
              coberturas: r.coberturas ?? r.coberturas_solicitadas,
              oferta_prima_mmt: r.oferta_prima_mmt,
            }))
          : [],
      }));
      setCarpetasCache(true, stripped);
      return NextResponse.json(stripped);
    }

    setCarpetasCache(false, data);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas GET]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res  = await apiPost('/carpetas', body);
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    invalidateCarpetasCache();
    notificarCambio();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[carpetas POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
