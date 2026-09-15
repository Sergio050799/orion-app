"use client";

import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import type { Column, RenderCellProps, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { COBERTURA_OPTS, LUNAS_OPTS, AMBITO_OPTS } from '@/core/flotas';
import { calcularPrima, type CalcPrimaParams, type TipoVehiculo, type Producto } from '@/core/flotas/primas';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OfertaRow {
  _id: number;
  matricula: string;
  marca_modelo: string;
  tipo_vehiculo: string;
  uso: string;
  cv: string;
  prima_referencia: string;
  coberturas: string;
  lunas: string;
  asistencia: string;    // 'oro' | 'oro_plus' | 'no' | ''
  ambito: string;
  frq: string;
  animales: string;      // 'true' | ''
  isotermo: string;      // 'true' | ''
  perdida_total: string; // 'true' | ''
  oferta_prima_mmt: string;
  _primaOverride: string; // 'true' si usuario escribió a mano
}

export interface HojaOfertaHandle {
  getData: () => Record<string, string>[];
  setData: (data: Record<string, string>[]) => void;
}

interface OfertaFields {
  primaClienteTotal?: number;
  descuentoOferta?: number;
  descuentosCoberturas?: Record<string, number>;
}

interface Props {
  trabajoRows: Record<string, string>[];
  header?: { cif: string; tomador: string; actividad: string; formaPago: string; efecto: string };
  carpetaNombre?: string;
  primasMmt?: Record<string, number>;  // key: "TIPO||COBERTURA", value: prima media (from Informe)
  onDataChange?: (data: Record<string, string>[]) => void;
  // Campos de carpeta para descuentos y prima cliente
  primaClienteTotal?: number;
  descuentoOferta?: number;
  descuentosCoberturas?: Record<string, number>;
  onOfertaFieldsChange?: (fields: OfertaFields) => void;
}

// ─── Mapeos para calcularPrima ──────────────────────────────────────────────

const TIPO_MAP: Record<string, TipoVehiculo> = {
  'turismo': 'turismo',
  'furgoneta': 'furgoneta',
  'cabeza tractora': 'cabeza_tractora',
  'camión rígido': 'camion_rigido',
  'camion rigido': 'camion_rigido',
  'semirremolque': 'semirremolque',
  'industrial matriculado': 'industrial_matriculado',
  'industrial no matriculado': 'industrial_no_matriculado',
};

const PRODUCTO_MAP: Record<string, Producto> = {
  'terceros': 'terceros',
  'terceros ampliado': 'terceros_ampliado',
  'todo riesgo con franquicia': 'todo_riesgo',
};

const USO_MAP: Record<string, CalcPrimaParams['uso']> = {
  'particular': 'particular',
  'servicio público': 'servicio_publico',
  'servicio publico': 'servicio_publico',
  'transportes propios': 'transportes_propios',
};

const AMBITO_MAP: Record<string, CalcPrimaParams['ambito']> = {
  'nacional': 'nacional',
  'internacional': 'internacional',
};

// Tipos que aplican a cada checkbox
const NO_LUNAS_TIPOS = new Set(['semirremolque', 'industrial no matriculado']);
const ANIMALES_TIPOS = new Set(['turismo', 'furgoneta']);
const ISOTERMO_TIPOS = new Set(['camion_rigido', 'semirremolque']);
const PERDIDA_TOTAL_TIPOS = new Set(['cabeza_tractora', 'camion_rigido', 'semirremolque']);

function getTipoKey(tv: string): TipoVehiculo | null {
  return TIPO_MAP[tv.toLowerCase()] ?? null;
}

// ─── rowToPrimaParams ───────────────────────────────────────────────────────

function rowToPrimaParams(row: OfertaRow): CalcPrimaParams | null {
  const tipoVehiculo = getTipoKey(row.tipo_vehiculo);
  if (!tipoVehiculo) return null;

  // Determinar producto
  const cobLower = row.coberturas.toLowerCase();
  let producto = PRODUCTO_MAP[cobLower];
  if (!producto) return null;

  // Terceros + Lunas Sí → terceros_con_luna
  const lunasActive = ['sí', 'si', 'true', 's', 'oro'].includes((row.lunas ?? '').toLowerCase());
  if (producto === 'terceros' && lunasActive) {
    producto = 'terceros_con_luna';
  }

  const uso = USO_MAP[row.uso.toLowerCase()];
  const ambito = AMBITO_MAP[row.ambito.toLowerCase()];
  const franquicia = producto === 'todo_riesgo' ? (parseFloat(row.frq) || undefined) : undefined;

  // Asistencia: 'oro' | 'oro_plus' | 'no'
  const asistVal = (row.asistencia ?? '').toLowerCase();
  const asistencia: 'no' | 'oro' | 'oro_plus' =
    asistVal === 'oro_plus' ? 'oro_plus' :
    ['oro', 'sí', 'si', 'true', 's'].includes(asistVal) ? 'oro' : 'no';

  return {
    tipoVehiculo,
    producto,
    uso,
    ambito,
    franquicia,
    asistencia,
    animales: row.animales === 'true',
    isotermo: row.isotermo === 'true',
    perdidaTotal: row.perdida_total === 'true',
  };
}

// ─── Calcula prima para una fila ────────────────────────────────────────────

function calcPrimaForRow(row: OfertaRow): string {
  const params = rowToPrimaParams(row);
  if (!params) return '';
  const result = calcularPrima(params);
  if (result === null) return '';
  return String(result);
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

const BASE_GARANTIAS_OFERTA = [
  'Responsabilidad civil obligatoria',
  'Responsabilidad civil voluntaria (hasta 50 millones)',
  'Defensa jurídica y reclamación de daños',
  'Seguro del Conductor (22.550 €)',
];

function buildOfertaPdfHtml(data: {
  rows: OfertaRow[];
  header?: Props['header'];
  carpetaNombre?: string;
  cobAnexo: { titulo: string; garantias: string[] }[];
  primaTotal: number;
}): string {
  const { rows, header, carpetaNombre, cobAnexo, primaTotal } = data;
  const fmtE = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const today = new Date().toLocaleDateString('es-ES');

  const vehiculosHtml = rows.filter(r => r.matricula.trim()).map((r, i) => {
    const [marca, ...mp] = r.marca_modelo.split(' ');
    const stripe = i % 2 === 1 ? '#f7f8fa' : '#ffffff';
    return `<tr style="background:${stripe};border-bottom:1px solid #e8eaed">
      <td>${(header?.tomador ?? '').toUpperCase()}</td>
      <td>${r.tipo_vehiculo.toUpperCase()}</td>
      <td style="font-weight:800;color:#002F82;letter-spacing:.04em">${r.matricula}</td>
      <td>${(marca ?? '').toUpperCase()}</td>
      <td>${mp.join(' ').toUpperCase()}</td>
      <td style="font-weight:700">${r.coberturas.toUpperCase()}</td>
      <td>${(header?.formaPago ?? 'ANUAL').toUpperCase()}</td>
      <td style="font-weight:700;color:#002F82;text-align:right;font-family:monospace">${r.oferta_prima_mmt ? fmtE(parseFloat(r.oferta_prima_mmt)||0) : '—'}</td>
    </tr>`;
  }).join('');

  const anexoHtml = cobAnexo.length > 0 ? `
  <div style="page-break-before:always;padding-top:14mm">
    <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#002F82;border-bottom:2px solid #002F82;padding-bottom:4px;margin-bottom:10px">
      Anexo — Detalle de coberturas incluidas
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${cobAnexo.map(({ titulo, garantias }) => `
      <div style="border:1px solid #d4dff5;border-radius:7px;overflow:hidden">
        <div style="background:#002F82;color:#fff;padding:7px 13px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em">${titulo}</div>
        <div style="padding:8px 13px">
          ${garantias.map(g => `<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid #eaeffb;font-size:11px;color:#1e2a4a">
            <span style="width:5px;height:5px;border-radius:50%;background:#002F82;flex-shrink:0;display:inline-block"></span>${g}
          </div>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    <div style="margin-top:12px;padding-top:6px;border-top:1px solid #d4dff5;display:flex;justify-content:space-between;font-size:10px;color:#8ea3c8">
      <span>MMT Seguros — Documento confidencial</span><span>Generado: ${today}</span>
    </div>
  </div>` : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Oferta ${(carpetaNombre ?? '').toUpperCase()}</title>
<style>
  @page{size:A4 landscape;margin:10mm 13mm}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Calibri,Arial,sans-serif;font-size:12px;color:#1e2a4a;background:#fff;line-height:1.3}
  table{width:100%;border-collapse:collapse}
  th{background:#002F82;color:#fff;padding:10px 8px;font-size:11px;font-weight:800;text-transform:uppercase;text-align:center;white-space:nowrap;letter-spacing:.04em}
  td{padding:9px 8px;text-align:center;font-size:12px}
  .tfoot td{background:#eef3ff;font-weight:900;font-size:13px;border-top:3px solid #002F82}
</style></head><body>
<div style="background:#002F82;padding:22px 30px;display:flex;align-items:center;justify-content:center;position:relative;margin-bottom:0">
  <img src="/LOGOMMT.jpg" alt="Logo MMT" style="position:absolute;left:28px;top:50%;transform:translateY(-50%);height:60px;object-fit:contain" onerror="this.style.display='none'">
  <div style="color:#fff;font-size:22px;font-weight:900;text-align:center;letter-spacing:.03em">
    OFERTA PARA LA FLOTA ${(carpetaNombre ?? 'FLOTA').toUpperCase()}
  </div>
</div>
<div style="padding:10px 30px;text-align:center;border-bottom:2px solid #e5e7eb;background:#fafbfc;font-size:14px;font-weight:700;margin-bottom:8px">
  ${(header?.tomador ?? '').toUpperCase()}${header?.cif ? ` — ${header.cif.toUpperCase()}` : ''}
</div>
<table>
  <thead><tr>
    <th>Tomador</th><th>Tipología</th><th>Matrícula</th><th>Marca</th><th>Modelo</th>
    <th>Coberturas</th><th>Forma Pago</th><th>Vencimiento</th><th>Prima Ofertada MMT</th>
  </tr></thead>
  <tbody>${vehiculosHtml}</tbody>
  <tfoot><tr class="tfoot">
    <td colspan="8" style="text-align:right;font-weight:900">TOTALES</td>
    <td style="text-align:right;font-family:monospace;color:#002F82">${fmtE(primaTotal)}</td>
  </tr></tfoot>
</table>
<div style="display:flex;gap:28px;padding:12px 30px;border-top:2px solid #e5e7eb;background:#fafbfc;flex-wrap:wrap;margin-top:8px">
  <div><div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Vehículos</div>
    <div style="font-size:20px;font-weight:900;color:#002F82;font-family:monospace">${rows.filter(r=>r.matricula.trim()).length}</div></div>
  <div><div style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Prima Ofertada MMT</div>
    <div style="font-size:20px;font-weight:900;color:#002F82;font-family:monospace">${fmtE(primaTotal)}</div></div>
</div>
<div style="text-align:center;padding:8px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb">MMT Seguros · ${today}</div>
${anexoHtml}
<script>window.onload=()=>{window.print()}</script>
</body></html>`;
}

// ─── DropdownEditor ────────────────────────────────────────────────────────────

function DropdownEditor({ options, row, column, onRowChange, onClose }: RenderEditCellProps<OfertaRow> & { options: string[] }) {
  return (
    <select
      autoFocus
      value={String((row as unknown as Record<string, string>)[column.key] ?? '')}
      onChange={e => {
        onRowChange({ ...row, [column.key]: e.target.value });
        onClose(true);
      }}
      style={{ width: '100%', height: '100%', border: 'none', outline: 'none', fontSize: 12, padding: '0 8px', background: '#fff', cursor: 'pointer' }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── CheckboxCell ───────────────────────────────────────────────────────────

function CheckboxCell({ row, columnKey, enabled, onToggle }: {
  row: OfertaRow; columnKey: string; enabled: boolean;
  onToggle: (row: OfertaRow, key: string) => void;
}) {
  const checked = (row as unknown as Record<string, string>)[columnKey] === 'true';
  if (!enabled) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      onClick={() => onToggle(row, columnKey)}>
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        border: checked ? '2px solid #1240CC' : '2px solid #d1d5db',
        background: checked ? '#1240CC' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFecha(raw: unknown): string {
  if (!raw) return '';
  const s = String(raw);
  if (!s || s === 'undefined' || s === 'null') return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const n = Number(s);
  if (!isNaN(n) && Number.isInteger(n) && n > 40000 && n < 70000) {
    const d = new Date((n - 25569) * 86400 * 1000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  return s;
}

function trabajoToOferta(rows: Record<string, string>[]): OfertaRow[] {
  return rows
    .filter(r => r['matricula']?.trim())
    .map((r, i) => ({
      _id: i,
      matricula:       (r['matricula'] ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
      marca_modelo:    `${r['marca'] ?? ''} ${r['modelo'] ?? ''}`.trim(),
      tipo_vehiculo:   r['tipo_vehiculo']          ?? '',
      uso:             r['uso']                    ?? '',
      cv:              r['cv']                     ?? '',
      prima_referencia: r['prima_referencia']       ?? '',
      coberturas:      r['coberturas_solicitadas'] ?? '',
      lunas:           NO_LUNAS_TIPOS.has((r['tipo_vehiculo'] ?? '').toLowerCase()) ? 'No' : (r['lunas'] ?? ''),
      asistencia:      r['asistencia']             ?? '',
      ambito:          r['ambito']                 ?? '',
      frq:             r['frq']                    ?? '',
      animales:        '',
      isotermo:        '',
      perdida_total:   '',
      oferta_prima_mmt: '',
      _primaOverride:  '',
    }));
}

function rowToRecord(row: OfertaRow): Record<string, string> {
  const { _id, _primaOverride, ...rest } = row;
  void _id;
  void _primaOverride;
  return rest;
}

// ─── HojaOferta ───────────────────────────────────────────────────────────────

const HojaOferta = forwardRef<HojaOfertaHandle, Props>(function HojaOferta(
  { trabajoRows, header, carpetaNombre, primasMmt, onDataChange, primaClienteTotal, descuentoOferta, descuentosCoberturas, onOfertaFieldsChange },
  ref,
) {
  const [rows, setRows] = useState<OfertaRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  // Saved user edits from carpeta (keyed by matrícula)
  const savedEditsRef = useRef<Map<string, Partial<OfertaRow>>>(new Map());
  const [editsVersion, setEditsVersion] = useState(0);

  // ─── Ajustes de oferta ────────────────────────────────────────────────────
  const [showAjustes, setShowAjustes] = useState(false);
  const [localPrimaCliente, setLocalPrimaCliente] = useState('');
  const [localDescuento, setLocalDescuento] = useState('');
  const [localDescCob, setLocalDescCob] = useState<Record<string, string>>({});
  const onOfertaFieldsRef = useRef(onOfertaFieldsChange);
  onOfertaFieldsRef.current = onOfertaFieldsChange;

  // Sync props → local state cuando cambia la carpeta
  useEffect(() => {
    setLocalPrimaCliente(primaClienteTotal != null ? String(primaClienteTotal) : '');
    setLocalDescuento(descuentoOferta != null ? String(descuentoOferta) : '');
    const cobMap: Record<string, string> = {};
    if (descuentosCoberturas) {
      for (const [k, v] of Object.entries(descuentosCoberturas)) cobMap[k] = String(v);
    }
    setLocalDescCob(cobMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaClienteTotal, descuentoOferta, descuentosCoberturas]);

  const emitAjustes = useCallback((fields: OfertaFields) => {
    onOfertaFieldsRef.current?.(fields);
  }, []);

  // Coberturas únicas presentes en la oferta
  const coberturasList = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.coberturas) seen.add(r.coberturas);
    return [...seen].sort();
  }, [rows]);

  // Always rebuild oferta from trabajo + merge user edits
  useEffect(() => {
    if (trabajoRows.length === 0) return;

    const fromTrabajo = trabajoToOferta(trabajoRows);
    const savedEdits = savedEditsRef.current;

    // On first seed or always: rebuild from trabajo, merging user edits
    const existingByMat = new Map(rows.map(r => [r.matricula, r]));

    const rebuilt = fromTrabajo.map((src, i) => {
      // Check if we have user edits from saved oferta data
      const saved = savedEdits.get(src.matricula);
      // Check if we have existing row with user edits made in this session
      const existing = existingByMat.get(src.matricula);

      const row: OfertaRow = {
        ...src,
        _id: i,
        // Prefer trabajo data for identification fields (always fresh)
        matricula: src.matricula,
        marca_modelo: src.marca_modelo,
        tipo_vehiculo: src.tipo_vehiculo,
        uso: src.uso,
        cv: src.cv,
        // For cotización fields: existing session edit > saved edit > trabajo data
        coberturas: existing?.coberturas || saved?.coberturas || src.coberturas,
        lunas: existing?.lunas || saved?.lunas || src.lunas,
        asistencia: existing?.asistencia || saved?.asistencia || src.asistencia,
        ambito: existing?.ambito || saved?.ambito || src.ambito,
        frq: existing?.frq || saved?.frq || src.frq,
        // Checkboxes + prima: only from existing/saved (not in trabajo)
        animales: existing?.animales || saved?.animales || '',
        isotermo: existing?.isotermo || saved?.isotermo || '',
        perdida_total: existing?.perdida_total || saved?.perdida_total || '',
        oferta_prima_mmt: existing?.oferta_prima_mmt || saved?.oferta_prima_mmt || '',
        _primaOverride: existing?._primaOverride || saved?._primaOverride || '',
      };

      // Force lunas='No' for types that can't have lunas
      if (NO_LUNAS_TIPOS.has(row.tipo_vehiculo.toLowerCase())) row.lunas = 'No';

      // Prima priority: manual override (keep) > tarifa auto-calc > grupo MMT del Informe > empty
      if (!row._primaOverride) {
        const auto = calcPrimaForRow(row);
        if (auto) {
          row.oferta_prima_mmt = auto;
        } else {
          // Tarifa no cubre este vehículo → usar prima de grupo del Informe si existe
          const tipoKey = (row.tipo_vehiculo || '').toUpperCase().trim() || 'SIN TIPO';
          const tNorm = tipoKey === 'DERIVADO DE TURISMO' ? 'TURISMO' : tipoKey;
          const informePrima = primasMmt?.[`${tNorm}||${row.coberturas || 'Sin cobertura'}`];
          row.oferta_prima_mmt = informePrima ? String(informePrima) : '';
        }
      }

      return row;
    });

    setRows(rebuilt);
    if (!seeded) setSeeded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabajoRows, editsVersion, primasMmt]);

  // Notify parent of changes
  useEffect(() => {
    if (!seeded) return;
    const timer = setTimeout(() => {
      onDataChangeRef.current?.(rows.map(rowToRecord));
    }, 300);
    return () => clearTimeout(timer);
  }, [rows, seeded]);

  useImperativeHandle(ref, () => ({
    getData: () => rows.map(rowToRecord),
    setData: (data) => {
      // Store saved user edits keyed by matrícula — the useEffect will merge them
      const edits = new Map<string, Partial<OfertaRow>>();
      for (const r of data) {
        const mat = (r['matricula'] ?? '').trim();
        if (!mat) continue;
        edits.set(mat, {
          coberturas:       r['coberturas']        ?? '',
          lunas:            r['lunas']             ?? '',
          asistencia:       r['asistencia']        ?? '',
          ambito:           r['ambito']            ?? '',
          frq:              r['frq']               ?? '',
          animales:         r['animales']          ?? '',
          isotermo:         r['isotermo']          ?? '',
          perdida_total:    r['perdida_total']     ?? '',
          oferta_prima_mmt: r['oferta_prima_mmt']  ?? '',
          _primaOverride:   r['_primaOverride']    ?? '',
        });
      }
      savedEditsRef.current = edits;
      // Bump version to trigger useEffect rebuild with these edits merged
      setEditsVersion(v => v + 1);
    },
  }));

  // Recalculate prima when relevant fields change (via handleRowsChange)
  const handleRowsChange = useCallback((newRows: OfertaRow[]) => {
    const recalculated = newRows.map((row, i) => {
      const prev = rows[i];
      if (!prev) return row;

      // Detect if user manually edited oferta_prima_mmt
      const primaChanged = row.oferta_prima_mmt !== prev.oferta_prima_mmt;
      const primaFieldsChanged =
        row.coberturas !== prev.coberturas ||
        row.lunas !== prev.lunas ||
        row.ambito !== prev.ambito ||
        row.frq !== prev.frq ||
        row.animales !== prev.animales ||
        row.isotermo !== prev.isotermo ||
        row.perdida_total !== prev.perdida_total;

      if (primaChanged && !primaFieldsChanged) {
        // User typed in the prima field manually
        if (row.oferta_prima_mmt.trim() === '') {
          // User cleared → back to auto
          const auto = calcPrimaForRow(row);
          return { ...row, oferta_prima_mmt: auto, _primaOverride: '' };
        }
        return { ...row, _primaOverride: 'true' };
      }

      if (primaFieldsChanged && row._primaOverride !== 'true') {
        // Auto-recalc
        const auto = calcPrimaForRow(row);
        return { ...row, oferta_prima_mmt: auto };
      }

      return row;
    });
    setRows(recalculated);
  }, [rows]);

  // Toggle checkbox handler
  const handleCheckboxToggle = useCallback((row: OfertaRow, key: string) => {
    const current = (row as unknown as Record<string, string>)[key] === 'true';
    const updated = { ...row, [key]: current ? '' : 'true' };
    // Recalc prima if not overridden
    if (updated._primaOverride !== 'true') {
      updated.oferta_prima_mmt = calcPrimaForRow(updated);
    }
    setRows(prev => prev.map(r => r._id === row._id ? updated : r));
  }, []);

  // Prima total
  const primaTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const v = parseFloat(r.oferta_prima_mmt);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [rows]);

  // Prima neta con descuentos aplicados
  const primaNetaTotal = useMemo(() => {
    const descG = parseFloat(localDescuento) || 0;
    return rows.reduce((sum, r) => {
      const v = parseFloat(r.oferta_prima_mmt);
      if (isNaN(v)) return sum;
      const descCob = parseFloat(localDescCob[r.coberturas] ?? '') || 0;
      const desc = descCob > 0 ? descCob : descG;
      return sum + v * (1 - desc / 100);
    }, 0);
  }, [rows, localDescuento, localDescCob]);

  // ── Coberturas para el anexo ──────────────────────────────────────────────
  const cobAnexo = useMemo(() => {
    const TIPOS_REMOLQUE = new Set(['semirremolque', 'remolque']);
    const cobMap = new Map<string, boolean>();
    rows.forEach(r => {
      if (!r.coberturas) return;
      const isRemolque = TIPOS_REMOLQUE.has(r.tipo_vehiculo.toLowerCase());
      if (!cobMap.has(r.coberturas)) cobMap.set(r.coberturas, false);
      if (!isRemolque) cobMap.set(r.coberturas, true);
    });
    const result: { titulo: string; garantias: string[] }[] = [];
    const seen = new Set<string>();
    cobMap.forEach((hasNonRemolque, rawCob) => {
      const v = rawCob.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let key = '';
      if (v.includes('todo') || v.includes('franquicia') || v.includes('riesgo')) key = 'tr';
      else if (v.includes('amplia')) key = 'ta';
      else if (v.includes('tercero')) key = 't';
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (key === 't') result.push({ titulo: 'Terceros', garantias: [...BASE_GARANTIAS_OFERTA] });
      else if (key === 'ta') result.push({ titulo: 'Terceros Ampliado', garantias: [...BASE_GARANTIAS_OFERTA, ...(hasNonRemolque ? ['Lunas (excepto remolques)'] : []), 'Robo', 'Incendio'] });
      else if (key === 'tr') result.push({ titulo: 'Todo Riesgo con Franquicia 1.800 €', garantias: [...BASE_GARANTIAS_OFERTA, ...(hasNonRemolque ? ['Lunas (excepto remolques)'] : []), 'Robo', 'Incendio', 'Daños propios con franquicia de 1.800 €'] });
    });
    return result.sort((a, b) => { const o: Record<string,number>={'Terceros':0,'Terceros Ampliado':1,'Todo Riesgo con Franquicia 1.800 €':2}; return (o[a.titulo]??9)-(o[b.titulo]??9); });
  }, [rows]);

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    const html = buildOfertaPdfHtml({ rows, header, carpetaNombre, cobAnexo, primaTotal });
    const w = window.open('', '_blank', 'width=960,height=720');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }, [rows, header, carpetaNombre, cobAnexo, primaTotal, primaNetaTotal, localPrimaCliente, localDescuento]);

  // ─── Generar Oferta Excel (via endpoint con formato MMT) ───────────────────
  const [exporting, setExporting] = useState(false);

  const handleExportOferta = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const vehiculos = rows.map(r => {
        const marcaModelo = r.marca_modelo ?? '';
        const [marca, ...modeloParts] = marcaModelo.split(' ');
        return {
          tomador: (header?.tomador ?? '').toUpperCase(),
          tipologia: (r.tipo_vehiculo ?? '').toUpperCase(),
          matricula: (r.matricula ?? '').toUpperCase(),
          marca: (marca ?? '').toUpperCase(),
          modelo: modeloParts.join(' ').toUpperCase(),
          coberturas: (r.coberturas ?? '').toUpperCase(),
          forma_pago: (header?.formaPago ?? 'ANUAL').toUpperCase(),
          fecha_vencimiento: parseFecha(header?.efecto),
          prima_ofertada: parseFloat(r.oferta_prima_mmt) || 0,
        };
      });

      const payload = {
        flota_nombre: (carpetaNombre ?? 'FLOTA').toUpperCase(),
        empresa_nombre: (header?.tomador ?? '').toUpperCase(),
        empresa_cif: (header?.cif ?? '').toUpperCase(),
        vehiculos,
        cobAnexo,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch('/api/flotas/oferta/excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          errMsg = err.error || err.message || errMsg;
        } catch {
          try { errMsg += ': ' + (await res.text()).slice(0, 200); } catch { /* noop */ }
        }
        alert(`Error generando oferta: ${errMsg}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OFERTA_${(carpetaNombre ?? 'FLOTA').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().toUpperCase()}.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Oferta Excel]', err);
      alert(`Error generando la oferta: ${msg}`);
    } finally {
      setExporting(false);
    }
  }, [rows, header, carpetaNombre, exporting]);

  const columns = useMemo((): Column<OfertaRow>[] => [
    {
      key: '_idx', name: '#', width: 44, frozen: true, resizable: false,
      renderCell: ({ rowIdx }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 700 }}>
          {rowIdx + 1}
        </div>
      ),
    },
    {
      key: 'matricula', name: 'MATRÍCULA', width: 100, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'marca_modelo', name: 'MARCA / MODELO', width: 160, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'tipo_vehiculo', name: 'TIPO VEHÍCULO', width: 155, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'cv', name: 'CV', width: 55, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'coberturas', name: 'COBERTURAS', width: 200,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={COBERTURA_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.coberturas ? '#000000' : '#9ca3af', fontStyle: row.coberturas ? 'normal' : 'italic' }}>
          {row.coberturas || '—'}
        </div>
      ),
    },
    {
      key: 'lunas', name: 'LUNAS', width: 70,
      editable: true,
      renderEditCell: (props) => NO_LUNAS_TIPOS.has(props.row.tipo_vehiculo.toLowerCase()) ? <div /> : <DropdownEditor {...props} options={LUNAS_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        if (NO_LUNAS_TIPOS.has(row.tipo_vehiculo.toLowerCase())) {
          return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
              <span style={{ color: '#d1d5db', fontSize: 10 }}>N/A</span>
            </div>
          );
        }
        return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.lunas ? '#000000' : '#9ca3af' }}>
            {row.lunas || '—'}
          </div>
        );
      },
    },
    {
      key: 'ambito', name: 'ÁMBITO', width: 110,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={AMBITO_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.ambito ? '#000000' : '#9ca3af' }}>
          {row.ambito || '—'}
        </div>
      ),
    },
    {
      key: 'frq', name: 'FRQ', width: 70,
      editable: true,
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const disabled = row.coberturas !== 'Todo Riesgo con Franquicia';
        return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: disabled ? '#9ca3af' : '#000000', fontStyle: disabled ? 'italic' : 'normal' }}>
            {row.frq || ''}
          </div>
        );
      },
    },
    {
      key: 'animales', name: 'ANIM', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="animales" enabled={!!tipo && ANIMALES_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'isotermo', name: 'ISOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="isotermo" enabled={!!tipo && ISOTERMO_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'perdida_total', name: 'P.TOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="perdida_total" enabled={!!tipo && PERDIDA_TOTAL_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'oferta_prima_mmt', name: 'PRIMA MMT', width: 130,
      editable: true,
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const isOverride = row._primaOverride === 'true';
        const hasValue = !!row.oferta_prima_mmt;
        return (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12,
            fontWeight: hasValue ? 700 : 400,
            color: hasValue ? '#000000' : '#9ca3af',
            fontFamily: hasValue ? 'monospace' : 'inherit',
            borderLeft: isOverride ? '3px solid #f59e0b' : 'none',
            background: isOverride ? 'rgba(245,158,11,0.05)' : undefined,
          }}
            title={isOverride ? 'Override manual — borra para volver al cálculo automático' : undefined}>
            {row.oferta_prima_mmt ? `${row.oferta_prima_mmt} €` : '—'}
          </div>
        );
      },
    },
  ], [handleCheckboxToggle]);

  const filledRows = rows.filter(r => r.matricula.trim()).length;

  // ─── Preview mode toggle ───────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(true);

  const fmtEUR = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  // Handle inline prima edit in preview
  const handlePreviewPrimaChange = useCallback((id: number, value: string) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r;
      if (value.trim() === '') {
        const auto = calcPrimaForRow(r);
        return { ...r, oferta_prima_mmt: auto, _primaOverride: '' };
      }
      return { ...r, oferta_prima_mmt: value, _primaOverride: 'true' };
    }));
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: showAjustes ? 'none' : '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span style={{ color: '#002F82', fontWeight: 900 }}>{filledRows}</span> vehículos seleccionados
          </span>
          {primaTotal > 0 && (
            <span style={{ fontSize: 12, fontWeight: 900, color: '#111827', fontFamily: 'monospace', background: 'rgba(178,198,245,0.28)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(178,198,245,0.5)' }}>
              TOTAL: {fmtEUR(primaTotal)}
            </span>
          )}
          {primaNetaTotal > 0 && primaNetaTotal !== primaTotal && (
            <span style={{ fontSize: 12, fontWeight: 900, color: '#16a34a', fontFamily: 'monospace', background: 'rgba(22,163,74,0.08)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(22,163,74,0.2)' }}>
              NETO: {fmtEUR(primaNetaTotal)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Ajustes toggle */}
          <button
            onClick={() => setShowAjustes(!showAjustes)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: showAjustes ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.04)', color: showAjustes ? '#b45309' : '#6b7280', border: '1px solid ' + (showAjustes ? 'rgba(245,158,11,0.35)' : '#e5e7eb'), cursor: 'pointer' }}>
            Ajustes
          </button>
          {/* Toggle preview/grid */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: showPreview ? 'rgba(0,48,132,0.1)' : 'rgba(0,0,0,0.04)', color: showPreview ? '#002F82' : '#6b7280', border: '1px solid ' + (showPreview ? 'rgba(0,48,132,0.25)' : '#e5e7eb'), cursor: 'pointer' }}>
            {showPreview ? 'Vista previa' : 'Editar datos'}
          </button>
          {rows.length > 0 && (
            <>
              <button onClick={handleExportOferta}
                disabled={exporting}
                style={{ fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 6, background: exporting ? 'rgba(22,163,74,0.05)' : 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.25)', cursor: exporting ? 'wait' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: exporting ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {exporting ? 'Generando...' : 'Excel'}
              </button>
              <button onClick={handleExportPdf}
                style={{ fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.25)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                PDF
              </button>
            </>
          )}
          {rows.length === 0 && trabajoRows.length === 0 && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>Completa TRABAJO para generar la oferta.</span>
          )}
        </div>
      </div>

      {/* Ajustes panel */}
      {showAjustes && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fffbf0', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', flexShrink: 0 }}>
          {/* Prima cliente */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Prima cliente actual</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={localPrimaCliente}
                onChange={e => setLocalPrimaCliente(e.target.value)}
                onBlur={() => emitAjustes({ primaClienteTotal: localPrimaCliente ? parseFloat(localPrimaCliente) : undefined, descuentoOferta: localDescuento ? parseFloat(localDescuento) : undefined, descuentosCoberturas: Object.fromEntries(Object.entries(localDescCob).filter(([,v]) => v).map(([k,v]) => [k, parseFloat(v)])) })}
                style={{ width: 110, padding: '4px 8px', borderRadius: 6, border: '1px solid #d97706', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
              />
              <span style={{ fontSize: 11, color: '#6b7280' }}>€</span>
              {localPrimaCliente && filledRows > 0 && (
                <span style={{ fontSize: 10, color: '#92400e', fontFamily: 'monospace', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  {fmtEUR(parseFloat(localPrimaCliente) / filledRows)} / veh.
                </span>
              )}
            </div>
          </div>

          {/* Descuento global */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Descuento global</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" min="0" max="100" step="0.1" placeholder="0"
                value={localDescuento}
                onChange={e => setLocalDescuento(e.target.value)}
                onBlur={() => emitAjustes({ primaClienteTotal: localPrimaCliente ? parseFloat(localPrimaCliente) : undefined, descuentoOferta: localDescuento ? parseFloat(localDescuento) : undefined, descuentosCoberturas: Object.fromEntries(Object.entries(localDescCob).filter(([,v]) => v).map(([k,v]) => [k, parseFloat(v)])) })}
                style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid #d97706', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
              />
              <span style={{ fontSize: 11, color: '#6b7280' }}>%</span>
              {localDescuento && primaTotal > 0 && (
                <span style={{ fontSize: 10, color: '#16a34a', fontFamily: 'monospace', background: 'rgba(22,163,74,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  = {fmtEUR(primaTotal * (1 - (parseFloat(localDescuento)||0) / 100))}
                </span>
              )}
            </div>
          </div>

          {/* Descuentos por cobertura */}
          {coberturasList.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Desc. por cobertura</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {coberturasList.map(cob => (
                  <div key={cob} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: '#374151', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cob}>{cob}</span>
                    <input
                      type="number" min="0" max="100" step="0.1" placeholder="0"
                      value={localDescCob[cob] ?? ''}
                      onChange={e => setLocalDescCob(prev => ({ ...prev, [cob]: e.target.value }))}
                      onBlur={() => emitAjustes({ primaClienteTotal: localPrimaCliente ? parseFloat(localPrimaCliente) : undefined, descuentoOferta: localDescuento ? parseFloat(localDescuento) : undefined, descuentosCoberturas: Object.fromEntries(Object.entries({ ...localDescCob }).filter(([,v]) => v).map(([k,v]) => [k, parseFloat(v)])) })}
                      style={{ width: 50, padding: '2px 6px', borderRadius: 4, border: '1px solid #d97706', fontSize: 11, fontFamily: 'monospace', outline: 'none' }}
                    />
                    <span style={{ fontSize: 10, color: '#6b7280' }}>%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showPreview ? (
        /* ─── Excel Preview ─────────────────────────────────────────────────── */
        <div className="flex-1 min-h-0" style={{ overflow: 'auto', padding: '24px 32px', background: '#eef1f6' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>

            {/* Header azul */}
            <div style={{ background: '#002F82', padding: '36px 40px', position: 'relative', minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/LOGOMMT.jpg"
                alt="Logo MMT"
                style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', height: 60, objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span style={{ color: '#fff', fontSize: 26, fontWeight: 800, textAlign: 'center', letterSpacing: '0.03em', fontFamily: "'Space Grotesk', Calibri, sans-serif" }}>
                OFERTA PARA LA FLOTA {(carpetaNombre ?? 'FLOTA').toUpperCase()}
              </span>
            </div>

            {/* Subtítulo empresa */}
            <div style={{ padding: '14px 40px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', background: '#fafbfc' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#000', letterSpacing: '0.02em' }}>
                {(header?.tomador ?? '').toUpperCase()}
                {header?.cif ? ` — ${header.cif.toUpperCase()}` : ''}
              </span>
            </div>

            {/* Tabla de vehículos */}
            <div style={{ overflowX: 'auto', padding: '0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#00B050' }}>
                    {['Tomador', 'Tipología', 'Matrícula', 'Marca', 'Modelo', 'Coberturas', 'Total Actual', 'Forma Pago', 'F.Vencimiento', 'Prima Ofertada MMT'].map(h => (
                      <th key={h} style={{ padding: '14px 12px', color: '#fff', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', textAlign: 'center', borderBottom: '3px solid #009040', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.matricula.trim()).map((r, idx) => {
                    const [marca, ...modeloParts] = r.marca_modelo.split(' ');
                    const isOverride = r._primaOverride === 'true';
                    const stripe = idx % 2 === 1 ? '#f7f8fa' : '#fff';
                    return (
                      <tr key={r._id} style={{ borderBottom: '1px solid #e8eaed', background: stripe, transition: 'background 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#eef3ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = stripe; }}>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{(header?.tomador ?? '').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{r.tipo_vehiculo.toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: '#002F82', fontSize: 14, letterSpacing: '0.04em' }}>{r.matricula.toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{(marca ?? '').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{modeloParts.join(' ').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{r.coberturas.toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#000', fontWeight: 700, fontSize: 14 }}>{r.prima_referencia ? `${r.prima_referencia} €` : '—'}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13 }}>{(header?.formaPago ?? 'ANUAL').toUpperCase()}</td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', color: '#000', fontSize: 13, fontWeight: 600 }}>{parseFecha(header?.efecto)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <input
                            type="text"
                            value={r.oferta_prima_mmt}
                            onChange={e => handlePreviewPrimaChange(r._id, e.target.value)}
                            style={{
                              width: 110, textAlign: 'right', fontSize: 14, fontWeight: 800, fontFamily: 'monospace',
                              padding: '6px 10px', borderRadius: 6, color: '#000',
                              border: isOverride ? '2px solid #f59e0b' : '2px solid #d1d5db',
                              background: isOverride ? 'rgba(245,158,11,0.06)' : '#fff',
                              outline: 'none', transition: 'border-color 0.15s',
                            }}
                            onFocus={e => { e.target.style.borderColor = '#002F82'; e.target.style.boxShadow = '0 0 0 3px rgba(0,48,132,0.12)'; }}
                            onBlur={e => { e.target.style.borderColor = isOverride ? '#f59e0b' : '#d1d5db'; e.target.style.boxShadow = 'none'; }}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr style={{ background: '#f0f2f5', borderTop: '3px solid #002F82' }}>
                    <td colSpan={6} style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, fontSize: 15, color: '#000', letterSpacing: '0.03em' }}>TOTALES</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace', fontSize: 15, color: '#000' }}>
                      {(() => { const t = rows.reduce((s, r) => s + (parseFloat(r.prima_referencia) || 0), 0); return t > 0 ? fmtEUR(t) : '—'; })()}
                    </td>
                    <td colSpan={2}></td>
                    <td style={{ padding: '16px 12px', textAlign: 'center', fontWeight: 900, fontFamily: 'monospace', fontSize: 16, color: '#002F82' }}>
                      {fmtEUR(primaTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Resumen inferior */}
            <div style={{ padding: '20px 40px', borderTop: '2px solid #e5e7eb', background: '#fafbfc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vehículos</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#002F82', fontFamily: 'monospace' }}>{filledRows}</div>
                </div>
                {localPrimaCliente && parseFloat(localPrimaCliente) > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prima Cliente Actual</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#b45309', fontFamily: 'monospace' }}>{fmtEUR(parseFloat(localPrimaCliente))}</div>
                    {filledRows > 0 && <div style={{ fontSize: 10, color: '#92400e', fontFamily: 'monospace' }}>{fmtEUR(parseFloat(localPrimaCliente)/filledRows)} / veh.</div>}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prima Ofertada MMT</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#002F82', fontFamily: 'monospace' }}>{fmtEUR(primaTotal)}</div>
                </div>
                {primaNetaTotal > 0 && primaNetaTotal !== primaTotal && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Prima Neta ({localDescuento}% dto.)
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', fontFamily: 'monospace' }}>{fmtEUR(primaNetaTotal)}</div>
                  </div>
                )}
                {(() => {
                  const base = localPrimaCliente && parseFloat(localPrimaCliente) > 0 ? parseFloat(localPrimaCliente) : rows.reduce((s, r) => s + (parseFloat(r.prima_referencia) || 0), 0);
                  const comparar = primaNetaTotal > 0 && primaNetaTotal !== primaTotal ? primaNetaTotal : primaTotal;
                  if (base <= 0 || comparar <= 0) return null;
                  const diff = comparar - base;
                  const pct = ((diff / base) * 100).toFixed(1);
                  return (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Diferencia</div>
                      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: diff <= 0 ? '#16a34a' : '#dc2626' }}>
                        {diff <= 0 ? '' : '+'}{fmtEUR(diff)} <span style={{ fontSize: 14, fontWeight: 700 }}>({pct}%)</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 40px', textAlign: 'center', borderTop: '1px solid #e5e7eb', background: '#f5f6f8' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
                MMT Seguros · {new Date().toLocaleDateString('es-ES')}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* ─── DataGrid Editor ────────────────────────────────────────────────── */
        <div className="flex-1 min-h-0">
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={handleRowsChange}
            rowKeyGetter={(row: OfertaRow) => row._id}
            style={{ height: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12 }}
            className="rdg-light"
            defaultColumnOptions={{ resizable: true, sortable: false }}
          />
        </div>
      )}
    </div>
  );
});

function readonlyCell({ row, column }: RenderCellProps<OfertaRow>) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: '#000000', background: '#f9fafb' }}>
      {String((row as unknown as Record<string, string>)[column.key] ?? '')}
    </div>
  );
}

export default HojaOferta;
