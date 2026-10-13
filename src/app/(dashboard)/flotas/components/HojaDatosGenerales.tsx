"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listarCorredores, cargarCorredoresDelServidor, guardarCarpeta, normalizeTipoVehiculo, type FlotaCarpeta, type Corredor, type TarifaEntry, TIPO_VEHICULO_OPTS, COBERTURA_OPTS } from '@/core/flotas';
import type { FlotaHeader } from './types';

// ─── Hook historial previo ─────────────────────────────────────────────────────

interface HistorialItem {
  id: string; nombre: string; estado: string;
  tomador: string; cif: string; corredor_nombre: string; notas: string;
}

const ESTADO_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  CONTRATADA:    { bg: 'rgba(16,185,129,0.15)',  color: '#10b981', border: 'rgba(16,185,129,0.35)' },
  RECHAZADA:     { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', border: 'rgba(239,68,68,0.3)'   },
  'EN ESTUDIO':  { bg: 'rgba(245,158,11,0.12)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)'  },
  COTIZADA:      { bg: 'rgba(139,92,246,0.12)',  color: '#8b5cf6', border: 'rgba(139,92,246,0.3)'  },
};

function useHistorial(cif: string, tomador: string) {
  const [results, setResults] = useState<HistorialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cifClean    = cif.trim().toUpperCase();
    const tomadorClean = tomador.trim();
    if (!cifClean && tomadorClean.length < 3) { setResults([]); return; }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = cifClean
          ? `cif=${encodeURIComponent(cifClean)}`
          : `q=${encodeURIComponent(tomadorClean)}`;
        const res = await fetch(`/api/flotas/historicas?${params}`);
        if (res.ok) setResults(await res.json());
      } catch { /* silent */ }
      finally { setLoading(false); }
    }, 600);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [cif, tomador]);

  return { results, loading };
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function parseFechaHoja(s?: string): Date | null {
  if (!s) return null;
  // ISO YYYY-MM-DD — parse local to avoid TZ shift
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Legacy DD/MM or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const year = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    const d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Convert any stored date string to YYYY-MM-DD for <input type="date"> */
function toIsoDate(s?: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return ''; // incomplete old format → let user re-enter
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function proximaRenovacion(fechaStr?: string): boolean {
  if (!fechaStr) return false;
  const fecha = parseFechaHoja(fechaStr);
  if (!fecha) return false;
  const hoy = new Date();
  const diff = (fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

// ─── Helpers para normalizar cobertura ─────────────────────────────────────
function normalizeCobertura(raw: string): string {
  const c = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (c.includes('todo riesgo')) return 'Todo Riesgo con Franquicia';
  if (c.includes('terceros ampliado') || c.includes('terceros amp')) return 'Terceros Ampliado';
  if (c.includes('terceros')) return 'Terceros';
  return raw.trim();
}

// ─── Estilos base ─────────────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = {
  display: 'block',
  textTransform: 'uppercase',
  fontSize: 11,
  fontWeight: 720,
  letterSpacing: '0.045em',
  color: 'var(--t-muted)',
  marginBottom: 8,
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  height: 44,
  border: '1px solid var(--t-line)',
  background: 'var(--t-surface)',
  color: 'var(--t-text)',
  borderRadius: 6,
  padding: '0 13px',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const sectionStyle: React.CSSProperties = {
  paddingBottom: 28,
  marginBottom: 27,
  borderBottom: '1px solid var(--t-line)',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  columnGap: 16,
  rowGap: 19,
};

// ─── HojaDatosGenerales ───────────────────────────────────────────────────────

interface Props {
  carpetaActiva: FlotaCarpeta;
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  onCarpetaChange: (c: FlotaCarpeta) => void;
}

export default function HojaDatosGenerales({ carpetaActiva, header, onHeaderChange, onCarpetaChange }: Props) {
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [tarifaToast, setTarifaToast] = useState('');
  const tarifaFileRef = useRef<HTMLInputElement>(null);
  const datosFileRef  = useRef<HTMLInputElement>(null);
  const [datosToast, setDatosToast] = useState('');

  useEffect(() => {
    setCorredores(listarCorredores());
    cargarCorredoresDelServidor()
      .then(data => setCorredores(data))
      .catch(() => {});
  }, []);

  // ─── Importar tarifa desde Excel (función conservada, no expuesta en UI) ──
  const handleImportTarifa = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const entries: TarifaEntry[] = [];

      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        const hasColumns = keys.some(k => {
          const kn = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          return kn.includes('tipo') || kn.includes('cobertura') || kn.includes('precio');
        });

        if (hasColumns) {
          for (const r of rows) {
            const get = (...aliases: string[]) => {
              for (const a of aliases) {
                for (const rk of Object.keys(r)) {
                  if (rk.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() === a) {
                    const v = String(r[rk] ?? '').trim();
                    if (v) return v;
                  }
                }
              }
              return '';
            };
            const tipo = get('tipo', 'tipo vehiculo', 'tipo_vehiculo');
            const cobertura = get('cobertura', 'coberturas', 'coberturas solicitadas');
            const precioStr = get('precio', 'importe', 'prima', 'valor');
            if (tipo && precioStr) {
              entries.push({
                tipo: normalizeTipoVehiculo(tipo),
                cobertura: cobertura ? normalizeCobertura(cobertura) : '',
                precio: parseFloat(precioStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0,
              });
            }
          }
        } else {
          for (const r of rows) {
            const vals = Object.values(r).map(v => String(v).trim());
            for (let i = 0; i < vals.length; i++) {
              if (vals[i].includes('/')) {
                const [tipoPart, cobPart] = vals[i].split('/').map(s => s.trim());
                for (let j = 0; j < vals.length; j++) {
                  if (j === i) continue;
                  const num = parseFloat(vals[j].replace(',', '.').replace(/[^0-9.]/g, ''));
                  if (num > 0) {
                    entries.push({
                      tipo: normalizeTipoVehiculo(tipoPart),
                      cobertura: cobPart ? normalizeCobertura(cobPart) : '',
                      precio: num,
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (entries.length === 0) {
        setTarifaToast('No se encontraron tarifas en el archivo');
        setTimeout(() => setTarifaToast(''), 3000);
        return;
      }

      const updated = { ...carpetaActiva, tarifaFlota: entries };
      guardarCarpeta(updated);
      onCarpetaChange(updated);
      setTarifaToast(`${entries.length} tarifa${entries.length > 1 ? 's' : ''} importada${entries.length > 1 ? 's' : ''}`);
      setTimeout(() => setTarifaToast(''), 3000);
    } catch {
      setTarifaToast('Error al leer el archivo');
      setTimeout(() => setTarifaToast(''), 3000);
    }
  }, [carpetaActiva, onCarpetaChange]);

  // ─── Importar datos generales desde Excel (función conservada, no expuesta en UI) ──
  const handleImportDatos = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) { setDatosToast('Excel vacio'); setTimeout(() => setDatosToast(''), 2000); return; }

      const find = (...aliases: string[]): string => {
        for (const r of rows) {
          const vals = Object.values(r).map(v => String(v).trim());
          const keys = Object.keys(r);
          for (const a of aliases) {
            for (const k of keys) {
              const kn = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
              if (kn === a || kn.includes(a)) {
                const v = String(r[k] ?? '').trim();
                if (v) return v;
              }
            }
          }
          if (vals.length >= 2) {
            const campo = vals[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
            for (const a of aliases) {
              if (campo === a || campo.includes(a)) return vals[1];
            }
          }
        }
        return '';
      };

      const newHeader = { ...header };
      const cif = find('cif', 'cif empresa', 'nif');
      const tomador = find('tomador', 'razon social', 'empresa', 'nombre');
      const actividad = find('actividad', 'actividad empresa', 'sector');
      const formaPago = find('forma de pago', 'forma pago', 'pago');
      const efecto = find('efecto', 'fecha efecto');
      const poliza = find('poliza actual', 'poliza', 'n poliza');
      const cia = find('cia actual', 'cia', 'compania', 'aseguradora');
      const fechaInicio = find('fecha inicio', 'inicio');
      const fechaVcto = find('fecha vencimiento', 'vencimiento');
      const cifTomador = find('cif tomador');
      const periodicidad = find('periodicidad', 'frecuencia');

      let count = 0;
      if (cif) { newHeader.cif = cif; count++; }
      if (tomador) { newHeader.tomador = tomador; count++; }
      if (actividad) { newHeader.actividad = actividad; count++; }
      if (formaPago) { newHeader.formaPago = formaPago; count++; }
      if (efecto) { newHeader.efecto = efecto; count++; }
      if (poliza) { newHeader.polizaActual = poliza; count++; }
      if (cia) { newHeader.ciaActual = cia; count++; }
      if (fechaInicio) { newHeader.fechaInicio = fechaInicio; count++; }
      if (fechaVcto) { newHeader.fechaVencimiento = fechaVcto; count++; }
      if (cifTomador) { newHeader.cifTomador = cifTomador; count++; }
      if (periodicidad) {
        const p = periodicidad.toLowerCase();
        if (p.includes('mensual')) newHeader.periodicidad = 'mensual';
        else if (p.includes('trimestral')) newHeader.periodicidad = 'trimestral';
        else if (p.includes('semestral')) newHeader.periodicidad = 'semestral';
        else if (p.includes('anual')) newHeader.periodicidad = 'anual';
        count++;
      }

      const nombreFlota = find('nombre flota', 'nombre', 'flota');
      if (nombreFlota && nombreFlota !== tomador) {
        const updNombre = { ...carpetaActiva, nombre: nombreFlota };
        guardarCarpeta(updNombre);
        onCarpetaChange(updNombre);
        count++;
      }

      if (count === 0) {
        setDatosToast('No se encontraron datos reconocidos');
        setTimeout(() => setDatosToast(''), 3000);
        return;
      }

      onHeaderChange(newHeader);
      setDatosToast(`${count} campo${count > 1 ? 's' : ''} importado${count > 1 ? 's' : ''}`);
      setTimeout(() => setDatosToast(''), 3000);
    } catch {
      setDatosToast('Error al leer el archivo');
      setTimeout(() => setDatosToast(''), 3000);
    }
  }, [header, onHeaderChange, carpetaActiva, onCarpetaChange]);

  const set = (key: keyof FlotaHeader, value: string) => {
    onHeaderChange({ ...header, [key]: value });
  };

  const handleCorredorChange = (corredor_id: string) => {
    const corredor = corredores.find(c => c.id === corredor_id);
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      corredor_id: corredor_id || undefined,
      porcentajeComision: carpetaActiva.porcentajeComision ?? corredor?.porcentajeComision,
    };
    guardarCarpeta(updated);
    onCarpetaChange(updated);
  };

  const handleComisionChange = (val: string) => {
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      porcentajeComision: parseFloat(val) || 0,
    };
    guardarCarpeta(updated);
    onCarpetaChange(updated);
  };

  const venceProximo = proximaRenovacion(header.fechaVencimiento);
  const { results: historial, loading: histLoading } = useHistorial(header.cif ?? '', header.tomador ?? '');

  // Silence unused-variable lint for preserved state
  void tarifaToast; void datosToast;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      {/* Hidden file inputs — logic preserved, not exposed in UI per T02 */}
      <input ref={datosFileRef}  type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportDatos} />
      <input ref={tarifaFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportTarifa} />

      <div style={{ maxWidth: 1060, margin: '0 auto' }}>

        {/* ── 01 / Identificación ────────────────────────────────────────────── */}
        <section style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, margin: 0, letterSpacing: '-0.01em', color: 'var(--t-text)', fontWeight: 700 }}>Identificación</h3>
            <p style={{ fontSize: 12, color: 'var(--t-muted)', margin: '0 0 0 auto' }}>Información de la empresa y del tomador</p>
          </div>
          <div style={gridStyle}>
            {/* Nombre de la flota — wide */}
            <div style={{ gridColumn: 'span 12' }}>
              <label style={fieldLabel}>Nombre de la flota</label>
              <input
                style={fieldInput}
                value={carpetaActiva.nombre}
                onChange={e => {
                  const updated = { ...carpetaActiva, nombre: e.target.value };
                  guardarCarpeta(updated);
                  onCarpetaChange(updated);
                }}
                placeholder="Nombre de la flota"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
            {/* CIF empresa */}
            <div style={{ gridColumn: 'span 4' }}>
              <label style={fieldLabel}>CIF empresa</label>
              <input
                style={fieldInput}
                value={header.cif ?? ''}
                onChange={e => set('cif', e.target.value)}
                placeholder="Ej. A12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
            {/* Tomador */}
            <div style={{ gridColumn: 'span 4' }}>
              <label style={fieldLabel}>Tomador</label>
              <input
                style={fieldInput}
                value={header.tomador ?? ''}
                onChange={e => set('tomador', e.target.value)}
                placeholder="Nombre o razón social"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
            {/* CIF tomador */}
            <div style={{ gridColumn: 'span 4' }}>
              <label style={fieldLabel}>CIF tomador</label>
              <input
                style={fieldInput}
                value={header.cifTomador ?? ''}
                onChange={e => set('cifTomador', e.target.value)}
                placeholder="Ej. B12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
            {/* Actividad — wide */}
            <div style={{ gridColumn: 'span 12' }}>
              <label style={fieldLabel}>Actividad</label>
              <input
                style={fieldInput}
                value={header.actividad ?? ''}
                onChange={e => set('actividad', e.target.value)}
                placeholder="Ej. Transporte de mercancías"
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
          </div>
        </section>

        {/* ── Historial previo (condicional) ─────────────────────────────────── */}
        {(histLoading || historial.length > 0) && (
          <section style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'rgba(245,158,11,0.7)', fontWeight: 700 }}>
                {histLoading ? 'Buscando en historial…' : `Historial previo · ${historial.length} resultado${historial.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            {!histLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {historial.map(h => {
                  const cfg = ESTADO_COLOR[h.estado] ?? ESTADO_COLOR['EN ESTUDIO'];
                  return (
                    <div key={h.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8,
                      background: 'var(--t-surface)', border: `1px solid ${cfg.border}`,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 4,
                        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                        textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0,
                      }}>
                        {h.estado}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--t-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                          {h.cif && <span style={{ fontFamily: 'monospace' }}>{h.cif}</span>}
                          {h.corredor_nombre && <span>Corredor: {h.corredor_nombre}</span>}
                        </div>
                      </div>
                      <a href="/emission" target="_blank" style={{
                        fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 5,
                        background: 'transparent', color: 'var(--t-blue)',
                        border: '1px solid var(--t-line)', textDecoration: 'none', flexShrink: 0,
                      }}>
                        Ver ficha
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── 02 / Corredor vinculado ────────────────────────────────────────── */}
        <section style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, margin: 0, letterSpacing: '-0.01em', color: 'var(--t-text)', fontWeight: 700 }}>Corredor vinculado</h3>
            <p style={{ fontSize: 12, color: 'var(--t-muted)', margin: '0 0 0 auto' }}>Datos de mediación del expediente</p>
          </div>
          <div style={gridStyle}>
            {/* Corredor — two-thirds (8/12) */}
            <div style={{ gridColumn: 'span 8' }}>
              <label style={fieldLabel}>Corredor</label>
              <select
                style={{ ...fieldInput, cursor: 'pointer' }}
                value={carpetaActiva.corredor_id ?? ''}
                onChange={e => handleCorredorChange(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              >
                <option value="">Sin corredor</option>
                {corredores.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} · {c.porcentajeComision}%</option>
                ))}
              </select>
              <small style={{ display: 'block', color: 'var(--t-muted)', fontSize: 11, marginTop: 7, lineHeight: 1.4 }}>
                El listado procede del catálogo real de corredores.
              </small>
            </div>
            {/* % Comisión — third (4/12) */}
            <div style={{ gridColumn: 'span 4' }}>
              <label style={fieldLabel}>
                % Comisión flota
                {(() => {
                  const corredor = corredores.find(c => c.id === carpetaActiva.corredor_id);
                  if (corredor && carpetaActiva.porcentajeComision != null && carpetaActiva.porcentajeComision !== corredor.porcentajeComision) {
                    return <span style={{ marginLeft: 6, fontSize: 9, color: '#F59E0B', fontWeight: 600 }}>diferente al corredor ({corredor.porcentajeComision}%)</span>;
                  }
                  return null;
                })()}
              </label>
              <input
                inputMode="decimal"
                style={fieldInput}
                value={carpetaActiva.porcentajeComision ?? ''}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) handleComisionChange(v); }}
                placeholder={(() => {
                  const c = corredores.find(x => x.id === carpetaActiva.corredor_id);
                  return c ? `${c.porcentajeComision}% (corredor)` : '0';
                })()}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
              />
            </div>
            {/* Datos de contacto del corredor seleccionado */}
            {carpetaActiva.corredor_id && (() => {
              const c = corredores.find(x => x.id === carpetaActiva.corredor_id);
              if (!c) return null;
              return (
                <div style={{ gridColumn: 'span 12' }}>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--t-muted)' }}>
                    {c.email && <span>{c.email}</span>}
                    {c.email && c.telefono && <span> · </span>}
                    {c.telefono && <span>{c.telefono}</span>}
                  </p>
                </div>
              );
            })()}
          </div>
        </section>

        {/* ── 03 / Vencimiento de la flota ───────────────────────────────────── */}
        <section style={{ ...sectionStyle, borderBottom: 'none', marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, margin: 0, letterSpacing: '-0.01em', color: 'var(--t-text)', fontWeight: 700 }}>Vencimiento de la flota</h3>
            <p style={{ fontSize: 12, color: 'var(--t-muted)', margin: '0 0 0 auto' }}>Fecha común para todos los vehículos</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
            <div style={{ width: 320 }}>
              <label style={{ ...fieldLabel, display: 'flex', alignItems: 'center', gap: 8 }}>
                Fecha de vencimiento
                {venceProximo && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#f0b94d', textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>Próxima renovación</span>
                )}
              </label>
              <input
                type="date"
                style={{ ...fieldInput, borderColor: venceProximo ? 'rgba(234,179,8,0.4)' : 'var(--t-line)' }}
                value={toIsoDate(header.fechaVencimiento)}
                onChange={e => set('fechaVencimiento', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = venceProximo ? 'rgba(234,179,8,0.4)' : 'var(--t-line)')}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--t-muted)', maxWidth: 390, lineHeight: 1.55, marginBottom: 7 }}>
              Esta fecha es la fuente canónica para Dashboard, Flotas contratadas e Informe.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
