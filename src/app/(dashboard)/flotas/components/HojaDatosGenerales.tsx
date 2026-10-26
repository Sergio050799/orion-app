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
      porcentajeComision: carpetaActiva.porcentajeComision ?? corredor?.comisionBase,
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
  const corrActual = corredores.find(c => c.id === carpetaActiva.corredor_id) ?? null;

  // Comision base vs corredor
  const cmBaseOrig = corrActual?.comisionBase ?? 0;
  const cmBase = carpetaActiva.porcentajeComision;
  const cmBaseWarn = cmBase != null && cmBase !== cmBaseOrig
    ? `Distinta a la del corredor (base ${cmBaseOrig} %)` : '';
  const cmExtra = carpetaActiva.comisionExtra;

  // Próxima renovación y vencimiento ORION
  const efDate = parseFechaHoja(header.fechaVencimiento);
  const renovDias = efDate ? Math.round((efDate.getTime() - Date.now()) / 86400000) : null;
  const renovTxt = renovDias == null ? '—'
    : renovDias < 0 ? 'Vencida'
    : renovDias === 0 ? 'Hoy'
    : renovDias === 1 ? 'En 1 día'
    : `En ${renovDias} días`;
  const vencOrion = efDate
    ? new Date(efDate.getFullYear() + 1, efDate.getMonth(), efDate.getDate()).toLocaleDateString('es-ES')
    : '—';

  // Silence unused-variable lint for preserved state
  void tarifaToast; void datosToast;

  const fldNum = (v: number | undefined, onChange: (n: number) => void, placeholder: string) => (
    <input
      inputMode="decimal"
      className="dg-inp"
      value={v ?? ''}
      onChange={e => { const n = parseFloat(e.target.value); onChange(isNaN(n) ? 0 : n); }}
      placeholder={placeholder}
    />
  );

  return (
    <div className="dg-scroll">
      {/* Hidden file inputs — logic preserved, not exposed in UI */}
      <input ref={datosFileRef}  type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportDatos} />
      <input ref={tarifaFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportTarifa} />

      <div className="twocol">

        {/* ══ Columna izquierda ══════════════════════════════════════════════ */}
        <section>

          {/* Identificación */}
          <p className="dg-h3">Identificación</p>
          <p className="dg-sub">Información de la empresa y condiciones de la flota.</p>

          <div className="formgrid">
            <div className="dg-fld full">
              <label>Nombre de la flota <span className="req">*</span></label>
              <input className="dg-inp" value={carpetaActiva.nombre}
                onChange={e => { const u = { ...carpetaActiva, nombre: e.target.value }; guardarCarpeta(u); onCarpetaChange(u); }}
                placeholder="Nombre de la empresa, ej. FRILESA S.L." />
            </div>
            <div className="dg-fld">
              <label>CIF empresa</label>
              <input className="dg-inp" value={header.cif ?? ''} onChange={e => set('cif', e.target.value)} placeholder="Ej. A12345678" />
            </div>
            <div className="dg-fld">
              <label>Compañía actual</label>
              <input className="dg-inp" value={header.ciaActual ?? ''} onChange={e => set('ciaActual', e.target.value)} placeholder="Aseguradora actual" />
            </div>
            <div className="dg-fld full">
              <label>Actividad</label>
              <input className="dg-inp" value={header.actividad ?? ''} onChange={e => set('actividad', e.target.value)} placeholder="Ej. Transporte de mercancías" />
            </div>
            <div className="dg-fld">
              <label>Periodicidad</label>
              <select className="dg-sel" value={header.periodicidad ?? ''} onChange={e => set('periodicidad', e.target.value)}>
                <option value="">Sin periodicidad</option>
                <option value="mensual">Mensual</option>
                <option value="bimestral">Bimestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div className="dg-fld">
              <label>Forma de pago</label>
              <select className="dg-sel" value={header.formaPago ?? ''} onChange={e => set('formaPago', e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="Interna">Interna</option>
                <option value="Externa">Externa</option>
              </select>
              {header.formaPago === 'Externa' && (
                <span className="hint">Externa: el corredor cobra al cliente y nos paga a nosotros.</span>
              )}
              {header.formaPago === 'Interna' && (
                <span className="hint">Interna: cobramos nosotros directamente al cliente.</span>
              )}
            </div>
          </div>

          {/* Tomadores */}
          <p className="dg-h3" style={{ marginTop: 26 }}>Tomadores</p>
          <p className="dg-sub">El principal aparece en el informe y en la oferta.</p>
          <div className="formgrid">
            <div className="dg-fld">
              <label>Tomador principal</label>
              <input className="dg-inp" value={header.tomador ?? ''} onChange={e => set('tomador', e.target.value)} placeholder="Nombre o razón social" />
            </div>
            <div className="dg-fld">
              <label>CIF tomador</label>
              <input className="dg-inp" value={header.cifTomador ?? ''} onChange={e => set('cifTomador', e.target.value)} placeholder="Ej. B12345678" />
            </div>
          </div>

        </section>

        {/* ══ Columna derecha ════════════════════════════════════════════════ */}
        <section>

          {/* Corredor vinculado */}
          <p className="dg-h3">Corredor vinculado</p>
          <p className="dg-sub">Datos de mediación del expediente.</p>

          <div className="dg-fld">
            <label>Corredor</label>
            <select className="dg-sel" value={carpetaActiva.corredor_id ?? ''} onChange={e => handleCorredorChange(e.target.value)}>
              <option value="">Sin corredor</option>
              {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          {corrActual && (
            <div className="dg-kv">
              <div className="krow"><label>Sucursal</label>     <span className={`val${corrActual.sucursal ? '' : ' em'}`}>{corrActual.sucursal ?? 'Sin sucursal'}</span></div>
              <div className="krow"><label>Comercial</label>    <span className={`val${corrActual.comercial ? '' : ' em'}`}>{corrActual.comercial ?? 'Sin comercial'}</span></div>
              <div className="krow"><label>Comisión base</label><span className="val">{corrActual.comisionBase} %{corrActual.comisionExtra ? ` + ${corrActual.comisionExtra} % extra` : ''}</span></div>
              <div className="krow"><label>Periodicidad</label> <span className={`val${corrActual.periodicidad ? '' : ' em'}`}>{corrActual.periodicidad ?? '—'}</span></div>
            </div>
          )}

          <div className="pct2">
            <div className="dg-fld">
              <label>Comisión base %</label>
              {fldNum(cmBase, n => { const u = { ...carpetaActiva, porcentajeComision: n }; guardarCarpeta(u); onCarpetaChange(u); }, `${cmBaseOrig} (corredor)`)}
              {cmBaseWarn && <span className="warn">{cmBaseWarn}</span>}
            </div>
            <div className="dg-fld">
              <label>Comisión extra %</label>
              {fldNum(cmExtra, n => { const u = { ...carpetaActiva, comisionExtra: n }; guardarCarpeta(u); onCarpetaChange(u); }, corrActual?.comisionExtra != null ? String(corrActual.comisionExtra) : '0')}
              <span className="hint">La extra se cobra si el corredor alcanza los objetivos.</span>
            </div>
          </div>

          {/* Fecha de efecto */}
          <p className="dg-h3" style={{ marginTop: 26 }}>Fecha de efecto</p>
          <p className="dg-sub">El vencimiento de la póliza actual, que es también el efecto de la nueva.</p>

          <div className="dg-fld" style={{ maxWidth: 260 }}>
            <label>
              Fecha de efecto
              {venceProximo && <span className="tag" style={{ marginLeft: 8, '--c': 'var(--warn)' } as React.CSSProperties}>Próxima</span>}
            </label>
            <input type="date" className="dg-inp"
              style={venceProximo ? { borderColor: 'var(--warn)' } : undefined}
              value={toIsoDate(header.fechaVencimiento)}
              onChange={e => set('fechaVencimiento', e.target.value)} />
          </div>

          <div className="dg-kv" style={{ marginTop: 10 }}>
            <div className="krow">
              <label>Próxima renovación</label>
              <span className="val" style={renovDias != null && renovDias <= 15 && renovDias >= 0 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{renovTxt}</span>
            </div>
            <div className="krow">
              <label>Vencimiento ORION</label>
              <span className="val">{vencOrion}</span>
            </div>
          </div>

          <p className="dg-note">Los informes muestran esta fecha como vencimiento. Dashboard y Flotas parten de ella para calcular el vencimiento interno de ORION, un año después.</p>

        </section>
      </div>
    </div>
  );
}
