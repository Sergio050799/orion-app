import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';
import { tablaAConfig, type TablaTarifa } from '@/core/flotas/tarifa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tarifa que usa el motor de primas (Oferta e Informe).
// Fuente ÚNICA: las tablas primas_base + primas_suplementos de orion-api, que se editan en
// orion-admin («Tarifa»). Orion no tiene precios en el código: si esta ruta no puede leer la
// tarifa devuelve 503 y la pantalla avisa, en lugar de calcular con valores inventados.

export async function GET() {
  let tabla: TablaTarifa | null = null;
  try {
    const res = await apiGet('/primas/tabla');
    if (res.ok) tabla = await res.json() as TablaTarifa;
  } catch { /* se trata abajo */ }

  if (!tabla || !Array.isArray(tabla.base) || tabla.base.length === 0) {
    return NextResponse.json(
      { error: 'No se ha podido leer la tarifa de primas (orion-api no responde o la tarifa está vacía).', primas: {}, ajustes: {} },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { config, sinUsar } = tablaAConfig(tabla);
  if (sinUsar.length > 0) console.warn('[primas/config] filas de la tarifa que el motor no usa:', sinUsar.join(' | '));
  return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
}
