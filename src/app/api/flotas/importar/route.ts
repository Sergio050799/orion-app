import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { apiGet, apiPost } from '@/lib/orionApi';
import { notificarCambio } from '../eventos/notificador';

export const runtime = 'nodejs';

interface ImportRow {
  nombre?: string;
  cif?: string;
  tomador?: string;
  actividad?: string;
  corredor?: string;
  comision?: string | number;
  forma_pago?: string;
  periodicidad?: string;
  fecha_inicio?: string;
  fecha_vencimiento?: string;
  poliza_actual?: string;
  cia_actual?: string;
  observaciones?: string;
  estado?: string;
  [key: string]: unknown;
}

function normalizeKey(k: string): string {
  return k.toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9_]/g, '_');
}

function parseExcel(buffer: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map(row => {
    const normalized: ImportRow = {};
    for (const [k, v] of Object.entries(row)) {
      normalized[normalizeKey(k)] = v;
    }
    return normalized;
  });
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const rows = parseExcel(buffer);
    if (rows.length === 0) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });

    // Fetch corredores for matching by name
    const corredoresRes = await apiGet('/corredores');
    const corredores: { id: string; nombre: string }[] = corredoresRes.ok ? await corredoresRes.json() : [];
    const corredorByNombre = new Map<string, string>();
    corredores.forEach(c => corredorByNombre.set(c.nombre.toLowerCase().trim(), c.id));

    // Fetch existing carpetas to detect duplicates (by nombre+cif)
    const carpetasRes = await apiGet('/carpetas');
    const existentes: { id: string; nombre: string; header?: { cif?: string } }[] = carpetasRes.ok ? await carpetasRes.json() : [];
    const existenteKey = new Map<string, string>(); // "nombre||cif" → id
    existentes.forEach(c => {
      const key = `${c.nombre.toLowerCase()}||${(c.header?.cif ?? '').toLowerCase()}`;
      existenteKey.set(key, c.id);
    });

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nombre = str(r.nombre);
      if (!nombre) { errors.push(`Fila ${i + 2}: sin nombre`); continue; }

      const cif    = str(r.cif);
      const estado = (['EN ESTUDIO', 'OFERTADA', 'CONTRATADA', 'RECHAZADA'].includes(str(r.estado).toUpperCase())
        ? str(r.estado).toUpperCase()
        : 'CONTRATADA') as 'EN ESTUDIO' | 'OFERTADA' | 'CONTRATADA' | 'RECHAZADA';

      // Match corredor by name (case-insensitive)
      const corrNombre = str(r.corredor).toLowerCase();
      const corredor_id = corrNombre ? (corredorByNombre.get(corrNombre) ?? undefined) : undefined;

      const existingKey = `${nombre.toLowerCase()}||${cif.toLowerCase()}`;
      const existingId  = existenteKey.get(existingKey);
      const now = new Date().toISOString();

      const carpeta = {
        id: existingId ?? `carpeta_${Date.now()}_${i}`,
        nombre,
        creadaEn: now,
        actualizadaEn: now,
        estado,
        corredor_id,
        porcentajeComision: parseFloat(str(r.comision)) || 0,
        historico: existingId ? undefined : [{ fecha: now, accion: 'Importación Excel', estadoNuevo: estado }],
        header: {
          cif,
          tomador: str(r.tomador) || nombre,
          actividad: str(r.actividad),
          formaPago: str(r.forma_pago),
          periodicidad: str(r.periodicidad) || 'anual',
          efecto: str(r.fecha_inicio),
          fechaInicio: str(r.fecha_inicio),
          fechaVencimiento: str(r.fecha_vencimiento),
          polizaActual: str(r.poliza_actual),
          ciaActual: str(r.cia_actual),
        },
        observaciones: str(r.observaciones),
        original: [],
        trabajo: [],
        sincoResultados: [],
        oferta: [],
      };

      try {
        const res = await apiPost('/carpetas', { action: 'upsert', carpeta });
        if (res.ok) {
          if (existingId) updated++; else created++;
        } else {
          errors.push(`Fila ${i + 2} (${nombre}): error del servidor`);
        }
      } catch {
        errors.push(`Fila ${i + 2} (${nombre}): error de red`);
      }
    }

    notificarCambio();
    return NextResponse.json({ created, updated, errors });
  } catch (err) {
    console.error('[importar POST]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
