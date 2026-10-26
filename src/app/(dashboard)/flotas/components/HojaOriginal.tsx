"use client";

import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { parseExcelTemplate, generarPlantillaExcel, listarCorredores } from '@/core/flotas';
import type { FlotaGridHandle } from './types';
import { DetailDrawer } from '@/components/saas/DetailDrawer';

async function descargarPlantillaRellena() {
  const blob = await generarPlantillaExcel(undefined, listarCorredores().map(c => c.nombre));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Flotas.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

const ORIG_COLS: { key: string; label: string; n?: boolean }[] = [
  { key: 'matricula',              label: 'Matrícula' },
  { key: 'cif_nif',                label: 'CIF/NIF' },
  { key: 'tomador',                label: 'Tomador' },
  { key: 'cia_actual',             label: 'Cía actual' },
  { key: 'num_poliza_actual',      label: 'Nº póliza actual' },
  { key: 'fecha_vencimiento',      label: 'Vencimiento' },
  { key: 'marca',                  label: 'Marca' },
  { key: 'modelo',                 label: 'Modelo' },
  { key: 'tipo_vehiculo',          label: 'Tipo vehículo' },
  { key: 'uso',                    label: 'Uso' },
  { key: 'kw',                     label: 'kW', n: true },
  { key: 'ambito',                 label: 'Ámbito' },
  { key: 'coberturas_solicitadas', label: 'Coberturas solicitadas' },
  { key: 'frq',                    label: 'Franq.', n: true },
  { key: 'prima_referencia',       label: 'Prima ref.', n: true },
];

interface Props {
  onDataChange?: (data: Record<string, string>[]) => void;
  carpetaOriginalEmpty?: boolean;
  initialData?: Record<string, string>[];
}

const HojaOriginal = forwardRef<FlotaGridHandle, Props>(function HojaOriginal(
  { onDataChange, initialData },
  ref,
) {
  const [rows, setRowsState] = useState<Record<string, string>[]>(() => initialData ?? []);
  const [parseError, setParseError] = useState<string | null>(null);
  const [unmapped, setUnmapped]     = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileRef  = useRef<HTMLInputElement>(null);
  const rowsRef  = useRef(rows);
  rowsRef.current = rows;

  const setRows = (d: Record<string, string>[]) => {
    setRowsState(d);
    onDataChange?.(d);
  };

  useImperativeHandle(ref, () => ({
    getData:    () => rowsRef.current,
    setData:    (d) => setRowsState(d),
    toRows:     () => rowsRef.current,
    getColDefs: () => [],
  }), []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParseError(null);
    try {
      const result = await parseExcelTemplate(file);
      setUnmapped(result.unmapped);
      setRows(result.rows);
      setDrawerOpen(false);
    } catch {
      setParseError('No se pudo leer el archivo. Asegúrate de que es un Excel válido (.xlsx / .xls).');
    }
  };

  const visibleRows = rows.filter(r => (r['matricula'] ?? '').trim());

  return (
    <div className="flex flex-col h-full min-h-0" style={{ overflow: 'hidden' }}>

      {/* ── Cabecera ── */}
      {visibleRows.length > 0 && (
        <div className="sh" style={{ flexShrink: 0, padding: '20px 32px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <h2><b>03</b>ORIGINAL</h2>
            <p>Los datos tal como llegaron desde la plantilla. Solo lectura.</p>
          </div>
          <div className="acts">
            <button className="mini pri" onClick={() => descargarPlantillaRellena()}>
              Descargar plantilla rellena
            </button>
            <button className="mini" onClick={() => setDrawerOpen(true)}>
              Subir plantilla modificada
            </button>
          </div>
        </div>
      )}

      {/* ── Avisos ── */}
      {unmapped.length > 0 && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(234,179,8,0.07)', borderBottom: '1px solid rgba(234,179,8,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
            {unmapped.length} columna{unmapped.length > 1 ? 's' : ''} no reconocida{unmapped.length > 1 ? 's' : ''}:
          </span>
          <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.8)' }}>{unmapped.join(', ')}</span>
          <button onClick={() => setUnmapped([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#fbbf24', fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
      )}
      {parseError && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(239,68,68,0.07)', borderBottom: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171' }}>{parseError}</span>
          <button onClick={() => setParseError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: 15 }}>×</button>
        </div>
      )}

      {/* ── Contenido principal ── */}
      {visibleRows.length > 0 ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 32px' }}>
          <div className="lock">
            <b>Solo lectura</b>
            <span>Aquí está el dato tal como llegó. Para cambiar algo, descarga la plantilla rellena, edítala y súbela otra vez: es la única forma de modificar Original.</span>
          </div>
          <div className="xwrap">
            <table className="xg">
              <thead>
                <tr>
                  {ORIG_COLS.map(c => (
                    <th key={c.key} className={c.n ? 'n' : ''}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr key={i}>
                    {ORIG_COLS.map(c => (
                      <td key={c.key} className={c.n ? 'n' : ''}>
                        {row[c.key] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="xnote">
            <span>{visibleRows.length} filas · Los datos se conservan tal como llegaron.</span>
            <span>Mostrando {visibleRows.length}</span>
          </div>
        </div>
      ) : (
        /* ── Estado vacío ── */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--soft)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.01em' }}>
              Original vacío
            </p>
            <p style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 28, lineHeight: 1.5 }}>
              Descarga la plantilla, rellénala con los vehículos de la flota y súbela aquí.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Subir Excel
              </button>
              <button
                onClick={() => descargarPlantillaRellena()}
                style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                Descargar plantilla vacía
              </button>
            </div>
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} />

      {/* ── Drawer: subir plantilla modificada ── */}
      <DetailDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--blue-2)', marginBottom: 8 }}>
              ORIGINAL · MODIFICAR
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.03em' }}>
              Subir plantilla modificada
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)', lineHeight: 1.65 }}>
              Sustituye el contenido de Original. Es la única forma de cambiarlo.
            </p>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--quiet)' }}>
              Qué se recalcula
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Original', 'Trabajo', 'SINCO', 'Informe', 'Oferta', 'Pre-emisión'].map(step => (
                <span key={step} style={{ padding: '4px 10px', borderRadius: 5, background: 'rgba(73,137,255,0.1)', border: '1px solid rgba(73,137,255,0.25)', fontSize: 12, color: 'var(--blue-2)', fontWeight: 600 }}>
                  {step}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--quiet)' }}>
              Qué se conserva
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {([
                ['Prima solicitada y tipología del paso 02', `${visibleRows.length} vehículos`],
                ['Ajustes de la oferta', 'por cobertura y global'],
                ['Primas MMT y texto editados en el informe', 'se mantienen'],
                ['IDs de catálogo ya asignados', 'si la matrícula no cambia'],
              ] as [string, string][]).map(([label, detail], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 6, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.14)', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--sub)' }}>
                    <span style={{ color: '#10b981', fontWeight: 800, flexShrink: 0 }}>✓</span>
                    {label}
                  </div>
                  <b style={{ fontSize: 12, color: 'var(--text)', flexShrink: 0, whiteSpace: 'nowrap' }}>{detail}</b>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            style={{ padding: '13px 0', borderRadius: 8, background: 'linear-gradient(135deg,#1240CC,#3366FF)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Seleccionar archivo Excel
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--quiet)', lineHeight: 1.5 }}>
            Si cambian las matrículas, repite la consulta SINCO.
          </p>
        </div>
      </DetailDrawer>
    </div>
  );
});

export default HojaOriginal;
