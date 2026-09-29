import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/orionApi';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const [primasRes, ajustesRes] = await Promise.all([
      apiGet('/admin/primas'),
      apiGet('/admin/ajustes'),
    ]);

    const primasRaw: { tipo_vehiculo: string; cobertura: string; ambito: string; prima: number }[] = await primasRes.json();
    const ajustesRaw: { clave: string; valor: number }[] = await ajustesRes.json();

    const primas: Record<string, number> = {};
    for (const p of primasRaw) primas[`${p.tipo_vehiculo}:${p.cobertura}:${p.ambito}`] = p.prima;

    const ajustes: Record<string, number> = {};
    for (const a of ajustesRaw) ajustes[a.clave] = a.valor;

    return NextResponse.json({ primas, ajustes }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    // Si la API no responde, el cliente usará los valores hardcodeados
    return NextResponse.json({ primas: {}, ajustes: {} });
  }
}
