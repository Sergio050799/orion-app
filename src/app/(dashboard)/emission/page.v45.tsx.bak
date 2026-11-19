"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { FlotaCarpeta, Corredor, EstadoFlota, HistoricoEntry } from '@/core/flotas';
import { guardarCarpeta } from '@/core/flotas';
import { DetailDrawer, type DetailDrawerData } from '@/components/saas/DetailDrawer';
import { dec, nf, eur, pc } from '@/lib/fmt';

/* ───────────────────────────────────────────────────────────────────────────
   Flotas · registro de control de todas las flotas.
   Solo presentación: los datos salen de /api/flotas/carpetas y /corredores.
   ─────────────────────────────────────────────────────────────────────────── */

// ─── Tipos y constantes ──────────────────────────────────────────────────────

interface Cobertura { nombre: string; prima: number; }

interface FlotaView {
  id: string;
  nombre: string;
  estado: EstadoFlota;
  tomador: string; cif: string; actividad: string;
  corredor?: Corredor;
  comision: number;
  coberturas: Cobertura[];
  prima: number;
  prima_mmt?: number;
  prima_cliente?: number;
  descuento?: number;
  efecto: string; fecha_inicio: string; fecha_vencimiento: string;
  periodicidad: string; num_poliza: string; compania: string;
  vehiculos: number; categoria: string; rango: string; notas: string;
  historico: HistoricoEntry[];
  actualizadaEn: string;
  raw: FlotaCarpeta;
}

const ESTADOS: { id: EstadoFlota; key: string; plural: string; singular: string }[] = [
  { id: 'EN ESTUDIO', key: 'estudio',    plural: 'En estudio',  singular: 'En estudio' },
  { id: 'ESTUDIADA',  key: 'estudiada',  plural: 'Estudiadas',  singular: 'Estudiada' },
  { id: 'OFERTADA',   key: 'ofertada',   plural: 'Ofertadas',   singular: 'Ofertada' },
  { id: 'CONTRATADA', key: 'contratada', plural: 'Contratadas', singular: 'Contratada' },
  { id: 'RECHAZADA',  key: 'rechazada',  plural: 'Rechazadas',  singular: 'Rechazada' },
];
const estInfo = (e: EstadoFlota) => ESTADOS.find(s => s.id === e) ?? ESTADOS[0];

const SUC: Record<string, string> = { TITAN: 'Titán', MEDIACION: 'Mediación' };
const sucName = (k?: string) => (k && SUC[k]) || 'Sin asignar';
const PER: Record<string, string> = { mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RANGOS_VEH = [
  { value: '', label: 'Sin especificar' },
  { value: '<100', label: 'Menos de 100' },
  { value: '100-500', label: '100 – 500' },
  { value: '500-1000', label: '500 – 1.000' },
  { value: '+1000', label: 'Más de 1.000' },
];
const rangoLabel = (v: string) => RANGOS_VEH.find(r => r.value === v)?.label ?? v;
const PERIODOS = ['mensual', 'trimestral', 'semestral', 'anual'];
const PAGE = 20;

// ─── Utilidades ──────────────────────────────────────────────────────────────

const norm = (t: string) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fcif = (c: string) => String(c ?? '').toUpperCase().replace(/[\s.\-]/g, '');
const esCap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function parseDate(s?: string): Date | null {
  if (!s) return null;
  let d: Date;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [day, m, y] = s.split('/').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(s.includes('T') ? s : s + 'T12:00:00');
  }
  return isNaN(d.getTime()) ? null : d;
}
const fdate = (d: Date | null) => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—');
const fstr = (s?: string) => fdate(parseDate(s));
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const diasHasta = (d: Date | null) => (d ? Math.round((d.getTime() - startOfToday().getTime()) / 86400000) : null);

function toDateInput(s?: string): string {
  const d = parseDate(s);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const m = [...Array(a.length + 1)].map((_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

function extractCoberturas(oferta: Record<string, string>[]): Cobertura[] {
  const map = new Map<string, number>();
  for (const row of oferta) {
    const cob = row['coberturas']?.trim();
    const prima = parseFloat(row['oferta_prima_mmt'] ?? '') || 0;
    if (cob) map.set(cob, (map.get(cob) ?? 0) + prima);
  }
  return Array.from(map.entries()).map(([nombre, prima]) => ({ nombre, prima }));
}

function normalizarCarpeta(c: FlotaCarpeta, cor?: Corredor): FlotaView {
  const oferta = c.oferta ?? [];
  const primaMmt = oferta.reduce((s, r) => s + (parseFloat(r['oferta_prima_mmt'] ?? '') || 0), 0);
  const primaFinal = c.descuentoOferta && primaMmt > 0 ? primaMmt * (1 - c.descuentoOferta / 100) : primaMmt;
  return {
    id: c.id, nombre: c.nombre, estado: c.estado,
    tomador: c.header?.tomador ?? '', cif: c.header?.cif ?? '', actividad: c.header?.actividad ?? '',
    corredor: cor,
    comision: c.comisionBase ?? cor?.comisionBase ?? 0,
    coberturas: extractCoberturas(oferta),
    prima: primaFinal,
    prima_mmt: primaMmt > 0 ? primaMmt : undefined,
    prima_cliente: c.primaClienteTotal && c.primaClienteTotal > 0 ? c.primaClienteTotal : undefined,
    descuento: c.descuentoOferta || undefined,
    efecto: c.header?.efecto ?? '', fecha_inicio: c.header?.fechaInicio ?? '', fecha_vencimiento: c.header?.fechaVencimiento ?? '',
    periodicidad: c.header?.periodicidad ?? '', num_poliza: c.header?.polizaActual ?? '', compania: c.header?.ciaActual ?? '',
    vehiculos: (c.trabajo?.length || c.original?.length) ?? 0,
    categoria: c.header?.categoria ?? '', rango: c.header?.rangoVehiculos ?? '', notas: c.observaciones ?? '',
    historico: Array.isArray(c.historico) ? c.historico : [],
    actualizadaEn: c.actualizadaEn,
    raw: c,
  };
}

const vcto = (f: FlotaView) => parseDate(f.fecha_vencimiento);
const efectoDate = (f: FlotaView) => parseDate(f.efecto) ?? parseDate(f.fecha_inicio);
const vdias = (f: FlotaView) => (f.estado === 'CONTRATADA' ? diasHasta(vcto(f)) : null);

function lastMov(f: FlotaView): { t: string; d: Date | null } {
  const ev = [...f.historico].filter(h => parseDate(h.fecha)).sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
  if (ev[0]) return { t: ev[0].accion, d: parseDate(ev[0].fecha) };
  return { t: 'Actualizada', d: parseDate(f.actualizadaEn) };
}

/** Rechazos de una flota: cada paso a Rechazada con su motivo (el actual y los de estudios anteriores). */
function rechazos(f: FlotaView): { fecha: Date | null; motivo: string }[] {
  const r = f.historico
    .filter(h => h.estadoNuevo === 'RECHAZADA')
    .map(h => ({ fecha: parseDate(h.fecha), motivo: h.motivo?.trim() || 'Sin motivo indicado' }));
  if (!r.length && f.estado === 'RECHAZADA') r.push({ fecha: parseDate(f.actualizadaEn), motivo: 'Sin motivo indicado' });
  return r;
}

// ─── Datos ───────────────────────────────────────────────────────────────────

function usePortfolio() {
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rCarp, rCor] = await Promise.all([
        fetch('/api/flotas/carpetas?summary=true'),
        fetch('/api/flotas/corredores'),
      ]);
      const [dCarp, dCor] = await Promise.all([rCarp.json(), rCor.json()]);
      setCarpetas(Array.isArray(dCarp) ? dCarp : []);
      setCorredores(Array.isArray(dCor) ? dCor : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flotas = useMemo<FlotaView[]>(() => {
    const map = new Map<string, Corredor>();
    corredores.forEach(c => map.set(c.id, c));
    return carpetas.map(c => normalizarCarpeta(c, c.corredor_id ? map.get(c.corredor_id) : undefined));
  }, [carpetas, corredores]);

  return { flotas, corredores, loading, reload: load };
}

// ─── Ficha de la flota (contenido del panel) ─────────────────────────────────

function FichaFlota({ flota, nEstudios, corredores, onSaved }: {
  flota: FlotaView; nEstudios: number; corredores: Corredor[]; onSaved: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullCarpeta, setFullCarpeta] = useState<FlotaCarpeta | null>(null);
  const carpeta = fullCarpeta ?? flota.raw;

  const [form, setForm] = useState({
    corredor_id: carpeta?.corredor_id ?? '',
    comision: String(carpeta?.comisionBase ?? flota.comision ?? ''),
    compania: carpeta?.header?.ciaActual ?? flota.compania ?? '',
    poliza: carpeta?.header?.polizaActual ?? flota.num_poliza ?? '',
    periodicidad: carpeta?.header?.periodicidad ?? flota.periodicidad ?? '',
    categoria: carpeta?.header?.categoria ?? flota.categoria ?? '',
    fechaInicio: toDateInput(carpeta?.header?.fechaInicio ?? flota.fecha_inicio),
    fechaVcto: toDateInput(carpeta?.header?.fechaVencimiento ?? flota.fecha_vencimiento),
    rangoVehiculos: carpeta?.header?.rangoVehiculos ?? '',
  });
  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const canEdit = flota.estado === 'CONTRATADA' && !!carpeta;

  // Carga la carpeta completa antes de editar para no sobrescribir original/trabajo/sinco con la versión resumen
  const enterEditMode = async () => {
    if (!fullCarpeta && flota.raw) {
      try {
        const res = await fetch('/api/flotas/carpetas');
        if (res.ok) {
          const list: FlotaCarpeta[] = await res.json();
          const found = list.find(c => c.id === flota.id);
          if (found) setFullCarpeta(found);
        }
      } catch { /* usa la versión resumen si falla */ }
    }
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!carpeta) return;
    setSaving(true);
    try {
      const updated: FlotaCarpeta = {
        ...carpeta,
        corredor_id: form.corredor_id || undefined,
        comisionBase: parseFloat(form.comision) || undefined,
        header: {
          ...carpeta.header,
          ciaActual: form.compania,
          polizaActual: form.poliza,
          periodicidad: (form.periodicidad as FlotaCarpeta['header']['periodicidad']) || undefined,
          categoria: form.categoria,
          fechaInicio: form.fechaInicio,
          fechaVencimiento: form.fechaVcto,
          rangoVehiculos: form.rangoVehiculos,
        },
      };
      guardarCarpeta(updated);
      await new Promise(r => setTimeout(r, 300));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const info = estInfo(flota.estado);
  const rech = rechazos(flota);
  const kv = (l: string, v?: string | number | null) => (
    <div><label>{l}</label><span className={v ? '' : 'em'}>{v ? v : 'Sin dato'}</span></div>
  );
  const vehTxt = flota.vehiculos > 0 ? nf(flota.vehiculos) : (flota.rango ? rangoLabel(flota.rango) : '—');
  const hist = [...flota.historico].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
  const suma = flota.coberturas.reduce((s, c) => s + c.prima, 0);
  const ultRech = rech[rech.length - 1];

  return (
    <>
      <div className="over">Flota · {info.singular}</div>
      <h3>{flota.nombre || '(sin nombre)'}</h3>
      <p className="desc">
        {flota.cif ? `CIF ${flota.cif}` : 'Sin CIF'}{flota.actividad ? ` · ${flota.actividad}` : ''}.
      </p>
      <div className="dacts">
        <Link className="mini pri" href="/flotas">Abrir en Estudio</Link>
        {canEdit && !editMode && <button className="mini" onClick={enterEditMode}>Editar datos</button>}
      </div>

      {flota.estado === 'RECHAZADA' && (
        <div className="banner" style={{ ['--c' as string]: 'var(--st-rechazada)' }}>
          <b>Rechazada</b>
          <span>{ultRech?.motivo ?? 'Sin motivo indicado'}{ultRech?.fecha ? ` · ${fdate(ultRech.fecha)}` : ''}</span>
        </div>
      )}

      <div className="stats">
        <div><label>Estudios</label><strong>{nf(nEstudios)}</strong></div>
        <div><label>Vehículos</label><strong>{vehTxt}</strong></div>
        <div><label>Prima</label><strong>{flota.prima > 0 ? eur(flota.prima, 2) : '—'}</strong></div>
      </div>

      {editMode && canEdit ? (
        <form className="form" onSubmit={e => { e.preventDefault(); handleSave(); }} noValidate>
          <h4>Editar datos de la flota</h4>
          <div className="fld">
            <label htmlFor="ef_cor">Corredor</label>
            <select id="ef_cor" className="select" value={form.corredor_id} onChange={e => setF('corredor_id', e.target.value)}>
              <option value="">Sin corredor</option>
              {corredores.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="frow">
            <div className="fld"><label htmlFor="ef_com">Comisión base (%)</label><input id="ef_com" className="inp" type="number" step="0.1" min="0" max="100" value={form.comision} onChange={e => setF('comision', e.target.value)} /></div>
            <div className="fld"><label htmlFor="ef_cia">Compañía actual</label><input id="ef_cia" className="inp" value={form.compania} onChange={e => setF('compania', e.target.value)} /></div>
          </div>
          <div className="frow">
            <div className="fld"><label htmlFor="ef_pol">Nº de póliza</label><input id="ef_pol" className="inp" value={form.poliza} onChange={e => setF('poliza', e.target.value)} /></div>
            <div className="fld">
              <label htmlFor="ef_per">Periodicidad</label>
              <select id="ef_per" className="select" value={form.periodicidad} onChange={e => setF('periodicidad', e.target.value)}>
                <option value="">Sin especificar</option>
                {PERIODOS.map(p => <option key={p} value={p}>{esCap(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fld">
              <label htmlFor="ef_cat">Categoría</label>
              <select id="ef_cat" className="select" value={form.categoria} onChange={e => setF('categoria', e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="1ª Categoría">1ª Categoría</option>
                <option value="2ª Categoría">2ª Categoría</option>
                <option value="3ª Categoría">3ª Categoría</option>
                <option value="Mixta">Mixta</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="ef_veh">Tamaño de la flota</label>
              <select id="ef_veh" className="select" value={form.rangoVehiculos} onChange={e => setF('rangoVehiculos', e.target.value)}>
                {RANGOS_VEH.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="fld"><label htmlFor="ef_ini">Fecha de inicio</label><input id="ef_ini" className="inp" type="date" value={form.fechaInicio} onChange={e => setF('fechaInicio', e.target.value)} /></div>
            <div className="fld"><label htmlFor="ef_vto">Vencimiento</label><input id="ef_vto" className="inp" type="date" value={form.fechaVcto} onChange={e => setF('fechaVcto', e.target.value)} /></div>
          </div>
          <div className="fact">
            <button type="button" className="btn ghost" onClick={() => setEditMode(false)} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      ) : (
        <>
          <h4>Datos de la flota</h4>
          <div className="kv">
            {kv('Tomador', flota.tomador)}
            {kv('CIF', flota.cif)}
            {kv('Actividad', flota.actividad)}
            {kv('Categoría', flota.categoria)}
            {kv('Compañía actual', flota.compania)}
            {kv('Nº de póliza', flota.num_poliza)}
            {kv('Periodicidad', PER[flota.periodicidad] ?? flota.periodicidad)}
            {kv('Fecha de inicio', flota.fecha_inicio ? fstr(flota.fecha_inicio) : '')}
            {kv('Fecha de efecto', flota.efecto ? fstr(flota.efecto) : '')}
            {kv('Vencimiento', flota.fecha_vencimiento ? fstr(flota.fecha_vencimiento) : '')}
          </div>

          <h4>Corredor</h4>
          <div className="kv">
            {kv('Corredor', flota.corredor?.nombre)}
            {kv('Sucursal', flota.corredor ? sucName(flota.corredor.sucursal) : '')}
            {kv('Comercial', flota.corredor?.comercial)}
            {kv('Comisión base', flota.comision ? `${dec(flota.comision, 1)} %` : '')}
          </div>

          {(flota.prima_cliente || flota.prima_mmt || flota.prima > 0) && (
            <>
              <h4>Primas</h4>
              <div className="kv">
                {flota.prima_cliente ? kv('Prima del cliente', eur(flota.prima_cliente, 2)) : null}
                {flota.prima_mmt ? kv('Prima MMT ofertada', eur(flota.prima_mmt, 2)) : null}
                {flota.prima > 0 ? kv(flota.descuento ? `Prima neta (ajuste ${dec(flota.descuento, 1)} %)` : 'Prima total', eur(flota.prima, 2)) : null}
              </div>
            </>
          )}
        </>
      )}

      {flota.coberturas.length > 0 && (
        <>
          <h4>Coberturas</h4>
          <div className="scroll">
            <table className="dtbl">
              <thead><tr><th>Cobertura</th><th>Prima</th></tr></thead>
              <tbody>{flota.coberturas.map((c, i) => <tr key={i}><td className="nm">{c.nombre}</td><td>{eur(c.prima, 2)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}

      <h4>Historial</h4>
      {hist.length === 0 ? (
        <p className="note" style={{ marginTop: 0 }}>Esta flota todavía no tiene movimientos registrados.</p>
      ) : (
        <ul className="tl">
          {hist.map((h, i) => (
            <li key={i}>
              <span className="d">{fstr(h.fecha)}</span>
              <span className="t">
                <b>{h.accion}</b>
                {h.estadoNuevo && <span>{h.estadoAnterior ? `${estInfo(h.estadoAnterior).singular} · ${estInfo(h.estadoNuevo).singular}` : estInfo(h.estadoNuevo).singular}</span>}
                {h.motivo && <span>Motivo: {h.motivo}</span>}
                {h.observaciones && <span>{h.observaciones}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {flota.notas && (
        <>
          <h4>Notas</h4>
          <p className="note" style={{ marginTop: 0 }}>{flota.notas}</p>
        </>
      )}

      {(flota.descuento && flota.prima_mmt) || flota.coberturas.length > 1 || nEstudios > 1 ? (
        <>
          <h4>Anexo · cómo calcula ORION</h4>
          <div className="annex">
            {flota.descuento && flota.prima_mmt ? (
              <div className="fx"><b>Prima neta</b><code>{`prima MMT × (1 − ajuste ÷ 100) = ${eur(flota.prima_mmt, 2)} × (1 − ${dec(flota.descuento, 1)} ÷ 100) = ${eur(flota.prima, 2)}`}</code></div>
            ) : null}
            {flota.coberturas.length > 1 ? (
              <div className="fx"><b>Prima MMT ofertada</b><code>{`Σ prima de cada cobertura = ${eur(suma, 2)}`}</code></div>
            ) : null}
            {nEstudios > 1 ? (
              <div className="fx"><b>Estudios</b><code>{`Σ carpetas con el mismo CIF = ${nf(nEstudios)}`}</code></div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────

type SortKey = 'nombre' | 'cor' | 'estado' | 'veh' | 'prima' | 'efe' | 'vto' | 'est' | 'mov';
const COLS: [SortKey, string, string][] = [
  ['nombre', 'Flota', ''], ['cor', 'Corredor', 'c-cor'], ['estado', 'Estado', ''], ['veh', 'Veh.', 'c-s'],
  ['prima', 'Prima', 'c-s'], ['efe', 'Efecto', 'c-ef'], ['vto', 'Vencimiento', 'c-s'], ['est', 'Estudios', 'c-est'], ['mov', 'Último movimiento', 'c-mov'],
];

export default function FlotasPage() {
  const { flotas, corredores, loading, reload } = usePortfolio();

  const [fEst, setFEst] = useState('');
  const [fSuc, setFSuc] = useState('');
  const [fCor, setFCor] = useState('');
  const [fVen, setFVen] = useState('');
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('mov');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [shown, setShown] = useState(PAGE);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailDrawerData | null>(null);
  const [toast, setToast] = useState('');
  const [anim, setAnim] = useState(false);

  useEffect(() => { const t = requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true))); return () => cancelAnimationFrame(t); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Nº de estudios por empresa (mismo CIF)
  const estudiosPorCif = useMemo(() => {
    const m = new Map<string, number>();
    flotas.forEach(f => { const k = fcif(f.cif); if (k.length >= 6) m.set(k, (m.get(k) ?? 0) + 1); });
    return m;
  }, [flotas]);
  const nEst = useCallback((f: FlotaView) => { const k = fcif(f.cif); return k.length >= 6 ? (estudiosPorCif.get(k) ?? 1) : 1; }, [estudiosPorCif]);

  const corredoresOrden = useMemo(() => [...corredores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [corredores]);

  const scoped = useMemo(() => flotas.filter(f => {
    if (fEst && f.estado !== fEst) return false;
    if (fSuc) {
      const s = f.corredor?.sucursal ?? '';
      if (fSuc === '_' ? !!s : s !== fSuc) return false;
    }
    if (fCor && f.corredor?.id !== fCor) return false;
    if (fVen) { const d = vdias(f); if (!(d !== null && d >= 0 && d <= 60)) return false; }
    return true;
  }), [flotas, fEst, fSuc, fCor, fVen]);

  // ── Agregados ──
  const T = useMemo(() => {
    const cont = scoped.filter(f => f.estado === 'CONTRATADA');
    const ven = cont.filter(f => { const d = vdias(f); return d !== null && d >= 0 && d <= 60; })
      .sort((a, b) => (vdias(a) ?? 0) - (vdias(b) ?? 0));
    const rej: { f: FlotaView; fecha: Date | null; motivo: string }[] = [];
    scoped.forEach(f => rechazos(f).forEach(r => rej.push({ f, ...r })));
    const mm: Record<string, number> = {};
    rej.forEach(r => { mm[r.motivo] = (mm[r.motivo] ?? 0) + 1; });
    const motivos = Object.entries(mm).sort((a, b) => b[1] - a[1]);
    return { cont, ven, rej, motivos, prima: cont.reduce((s, f) => s + f.prima, 0) };
  }, [scoped]);

  const meses = useMemo(() => {
    const hoy = new Date();
    const out = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      return { i, lb: `${MESES[d.getMonth()]} ${d.getFullYear()}`, L: [] as FlotaView[] };
    });
    T.cont.forEach(f => {
      const v = vcto(f); if (!v) return;
      const k = (v.getFullYear() - hoy.getFullYear()) * 12 + v.getMonth() - hoy.getMonth();
      if (k >= 0 && k < 12) out[k].L.push(f);
    });
    return out;
  }, [T.cont]);

  // ── Comprobador ──
  const hits = useMemo(() => {
    const qq = q.trim();
    if (qq.length < 3) return [];
    const nq = norm(qq), cq = fcif(qq), tk = nq.split(/\s+/).filter(Boolean);
    const out: { f: FlotaView; sc: number; why: string }[] = [];
    flotas.forEach(f => {
      const names = [f.nombre, f.tomador].filter(Boolean).map(norm);
      const cifs = [f.cif].filter(Boolean).map(fcif);
      let sc = 0, why = '';
      if (cq.length >= 6 && cifs.includes(cq)) { sc = 100; why = 'Mismo CIF'; }
      else if (names.some(n => n === nq)) { sc = 95; why = 'Mismo nombre'; }
      else if (tk.length && tk.every(t => names.some(n => n.includes(t)))) { sc = 70; why = 'Coincide con el nombre'; }
      else if (nq.length >= 5 && names.some(n => lev(n.replace(/ s\.?l\.?$/, ''), nq) <= 2)) { sc = 50; why = 'Nombre muy parecido'; }
      if (sc) out.push({ f, sc, why });
    });
    return out.sort((a, b) => b.sc - a.sc || a.f.nombre.localeCompare(b.f.nombre, 'es'));
  }, [flotas, q]);

  // ── Registro ──
  const registro = useMemo(() => {
    let R = scoped;
    const qq = q.trim();
    if (qq) {
      const nq = norm(qq), cq = fcif(qq);
      R = R.filter(f => norm([f.nombre, f.tomador, f.corredor?.nombre ?? ''].join(' ')).includes(nq) || (cq.length >= 6 && fcif(f.cif) === cq));
    }
    const val = (f: FlotaView): string | number => {
      switch (sortKey) {
        case 'nombre': return norm(f.nombre);
        case 'cor': return norm(f.corredor?.nombre ?? 'zzz');
        case 'estado': return ESTADOS.findIndex(s => s.id === f.estado);
        case 'veh': return f.vehiculos;
        case 'prima': return f.prima;
        case 'efe': return efectoDate(f)?.getTime() ?? 0;
        case 'vto': return vcto(f)?.getTime() ?? 9e15;
        case 'est': return nEst(f);
        default: return lastMov(f).d?.getTime() ?? 0;
      }
    };
    return [...R].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'string' ? x.localeCompare(String(y), 'es') : (x as number) - (y as number);
      return c ? c * sortDir : a.nombre.localeCompare(b.nombre, 'es');
    });
  }, [scoped, q, sortKey, sortDir, nEst]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'veh' || k === 'prima' || k === 'est' || k === 'mov' ? -1 : 1); }
    setShown(PAGE);
  };

  const resetShown = () => setShown(PAGE);
  const ficha = fichaId ? flotas.find(f => f.id === fichaId) ?? null : null;
  const openDetail = (d: DetailDrawerData) => { setFichaId(null); setDetail(d); };
  const closeAll = () => { setFichaId(null); setDetail(null); };

  // ── Detalles de KPI y gráficos ──
  const ctx = [
    fEst ? estInfo(fEst as EstadoFlota).plural : '',
    fSuc ? (fSuc === '_' ? 'Sin sucursal' : sucName(fSuc)) : '',
    fCor ? (corredores.find(c => c.id === fCor)?.nombre ?? '') : '',
  ].filter(Boolean).join(' · ') || 'Todo el registro';
  const corN = (f: FlotaView) => f.corredor?.nombre ?? 'Sin corredor';
  const cell2 = (f: FlotaView) => `${f.nombre} · ${corN(f)}`;
  const n = scoped.length;
  const by = (s: EstadoFlota) => scoped.filter(f => f.estado === s).length;

  const detailKpi = (key: string): DetailDrawerData => {
    if (key === 'flotas') {
      return {
        over: `Resumen · ${ctx}`, title: 'Flotas registradas',
        desc: 'Cada carpeta de estudio es una entrada del registro; cuenta el estado actual.',
        stats: [['Flotas', nf(n)], ['Vehículos', nf(scoped.reduce((s, f) => s + f.vehiculos, 0))], ['Corredores', nf(new Set(scoped.map(f => f.corredor?.id).filter(Boolean)).size)]],
        head: ['Estado', 'Flotas', '% del registro'],
        rows: ESTADOS.map(s => { const c = by(s.id); return [s.plural, nf(c), n ? pc(c / n * 100) : '—']; }),
        fx: [['% del registro', `flotas del estado ÷ ${nf(n)} × 100`]],
      };
    }
    if (key === 'tasa') {
      const m: Record<string, { n: number; c: number }> = {};
      scoped.forEach(f => { const c = corN(f); (m[c] = m[c] ?? { n: 0, c: 0 }); m[c].n++; if (f.estado === 'CONTRATADA') m[c].c++; });
      const all = Object.entries(m).sort((a, b) => b[1].n - a[1].n), top = all.slice(0, 7), rest = all.slice(7);
      const rows: Array<Array<string | number>> = top.map(([c, o]) => [c, nf(o.n), nf(o.c), pc(o.c / o.n * 100, 0)]);
      if (rest.length) {
        const nn = rest.reduce((s, r) => s + r[1].n, 0), cc = rest.reduce((s, r) => s + r[1].c, 0);
        rows.push([`Otros (${rest.length})`, nf(nn), nf(cc), pc(cc / nn * 100, 0)]);
      }
      return {
        over: `Resultado · ${ctx}`, title: 'Tasa de contratación',
        desc: 'Parte de las flotas registradas que acabó en contratada.',
        stats: [['Tasa', n ? pc(T.cont.length / n * 100, 1) : '—'], ['Contratadas', nf(T.cont.length)], ['Flotas', nf(n)]],
        head: ['Corredor', 'Flotas', 'Contratadas', 'Tasa'], rows,
        fx: [['Tasa', `flotas contratadas ÷ flotas registradas × 100 = ${nf(T.cont.length)} ÷ ${nf(n)} × 100 = ${n ? pc(T.cont.length / n * 100, 1) : '—'}`]],
      };
    }
    if (key === 'vence') {
      return {
        over: `Renovaciones · ${ctx}`, title: 'Vencen en 60 días',
        desc: 'Flotas contratadas cuyo vencimiento cae en los próximos 60 días.',
        stats: [['Flotas', nf(T.ven.length)], ['Prima en juego', eur(T.ven.reduce((s, f) => s + f.prima, 0))]],
        head: ['Flota', 'Vence', 'Días', 'Prima'],
        rows: T.ven.map(f => [cell2(f), fstr(f.fecha_vencimiento), nf(vdias(f) ?? 0), f.prima ? eur(f.prima, 2) : '—']),
      };
    }
    if (key === 'rech') {
      return {
        over: `Control · ${ctx}`, title: 'Estudios rechazados',
        desc: 'Cada paso a Rechazada anotado en el historial de las flotas, con su motivo.',
        stats: [['Estudios', nf(T.rej.length)], ['Flotas', nf(new Set(T.rej.map(r => r.f.id)).size)]],
        head: ['Flota', 'Fecha', 'Motivo'],
        rows: [...T.rej].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)).map(r => [cell2(r.f), fdate(r.fecha), r.motivo]),
        note: 'El motivo es el que se anotó al cambiar el estado a Rechazada.',
      };
    }
    // prima
    const X = [...T.cont].filter(f => f.prima).sort((a, b) => b.prima - a.prima);
    const top = X.slice(0, 7), rest = X.slice(7);
    const rows: Array<Array<string | number>> = top.map(f => [cell2(f), eur(f.prima, 2)]);
    if (rest.length) rows.push([`Otras (${rest.length})`, eur(rest.reduce((s, f) => s + f.prima, 0), 2)]);
    return {
      over: `Resultado · ${ctx}`, title: 'Prima contratada',
      desc: 'Prima anual de las flotas contratadas.',
      stats: [['Prima', eur(T.prima)], ['Contratadas', nf(T.cont.length)]],
      head: ['Flota', 'Prima'], rows,
      fx: [['Prima contratada', `Σ prima anual de las flotas en estado Contratada = ${eur(T.prima, 2)}`]],
    };
  };

  const detailMes = (i: number): DetailDrawerData => {
    const M = meses[i];
    const X = [...M.L].sort((a, b) => (vdias(a) ?? 0) - (vdias(b) ?? 0));
    return {
      over: `Renovaciones · ${ctx}`, title: `Vencen en ${M.lb}`,
      desc: 'Flotas contratadas con vencimiento en ese mes.',
      stats: [['Flotas', nf(X.length)], ['Prima', eur(X.reduce((s, f) => s + f.prima, 0))]],
      head: ['Flota', 'Vence', 'Prima'],
      rows: X.map(f => [cell2(f), fstr(f.fecha_vencimiento), f.prima ? eur(f.prima, 2) : '—']),
    };
  };

  const detailMotivo = (idx: number | 'all'): DetailDrawerData => {
    const top = T.motivos.slice(0, 7);
    const X = idx === 'all'
      ? T.rej.filter(r => !top.some(m => m[0] === r.motivo))
      : T.rej.filter(r => r.motivo === T.motivos[idx][0]);
    return {
      over: `Control · ${ctx}`, title: idx === 'all' ? 'Otros motivos' : T.motivos[idx][0],
      desc: 'Estudios rechazados con este motivo.',
      stats: [['Estudios', nf(X.length)], ['Flotas', nf(new Set(X.map(r => r.f.id)).size)]],
      head: ['Flota', 'Fecha', 'Motivo'],
      rows: X.map(r => [cell2(r.f), fdate(r.fecha), r.motivo]),
    };
  };

  // ── Informe: Excel del registro filtrado ──
  const descargarInforme = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Flotas');
      ws.columns = [
        { header: 'Flota', width: 34 }, { header: 'CIF', width: 14 }, { header: 'Corredor', width: 30 }, { header: 'Sucursal', width: 12 },
        { header: 'Estado', width: 14 }, { header: 'Vehículos', width: 11 }, { header: 'Prima', width: 14 },
        { header: 'Efecto', width: 12 }, { header: 'Vencimiento', width: 13 }, { header: 'Estudios', width: 10 }, { header: 'Último movimiento', width: 32 },
      ];
      const head = ws.getRow(1);
      head.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
        c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      head.height = 24;
      registro.forEach((f, i) => {
        const mv = lastMov(f);
        const r = ws.addRow([
          f.nombre, f.cif, f.corredor?.nombre ?? '', f.corredor ? sucName(f.corredor.sucursal) : '',
          estInfo(f.estado).singular, f.vehiculos || '', f.prima ? Number(f.prima.toFixed(2)) : '',
          fdate(efectoDate(f)), fstr(f.fecha_vencimiento), nEst(f), `${mv.t} · ${fdate(mv.d)}`,
        ]);
        r.eachCell((c, col) => {
          c.font = { name: 'Calibri', size: 10 };
          c.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
          if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FC' } };
        });
        r.getCell(7).numFmt = '0.00';
      });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.headerFooter.oddFooter = '&LDocumento confidencial&RPágina &P de &N';
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'REGISTRO_DE_FLOTAS.xlsx'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      showToast('No se ha podido generar el informe.');
    }
  };

  const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date());
  const hit0 = hits[0];
  const live = !!hit0 && hit0.sc >= 70 && ['EN ESTUDIO', 'ESTUDIADA', 'OFERTADA'].includes(hit0.f.estado);
  const mxMes = Math.max(...meses.map(m => m.L.length), 1);
  const totMes = meses.reduce((s, m) => s + m.L.length, 0);
  const topMot = T.motivos.slice(0, 7), restMot = T.motivos.slice(7);
  const mxMot = Math.max(...T.motivos.map(x => x[1]), 1);
  const part = registro.slice(0, shown);
  const left = registro.length - part.length;

  const tagOf = (e: EstadoFlota) => (
    <span className="tag" style={{ ['--c' as string]: `var(--st-${estInfo(e).key})` }}>{estInfo(e).singular}</span>
  );

  const bar = (label: string, val: number, max: number, onClick: () => void, agg = false) => (
    <button key={label} className={`bar${agg ? ' agg' : ''}`} onClick={onClick}>
      <span className="bn">{label}</span>
      <span className="bt"><span className="bk" style={{ width: anim ? `${max ? val / max * 100 : 0}%` : 0 }}>{val > 0 && <span style={{ background: 'var(--blue)', flex: 1 }} />}</span></span>
      <span className="bv">{nf(val)}</span>
    </button>
  );

  return (
    <>
      <div className="pg fl">
        {/* Intro */}
        <section className="intro">
          <div>
            <h1>Flotas</h1>
            <p>Control de todas las flotas · {today.charAt(0).toUpperCase() + today.slice(1)}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={descargarInforme} disabled={loading || registro.length === 0}>Descargar informe</button>
          </div>
        </section>

        {/* Comprobar flota */}
        <section className="chkzone" aria-labelledby="chkT">
          <h2 id="chkT">Comprobar flota</h2>
          <p className="sub-desc" style={{ marginBottom: 14 }}>Escribe el nombre, el CIF o el tomador para saber si ya hemos hecho algo con esa flota.</p>
          <input className="search wide" type="search" aria-label="Comprobar flota" placeholder="Nombre de la flota, CIF o tomador"
            value={q} onChange={e => { setQ(e.target.value); resetShown(); }} autoComplete="off" />
          {q.trim().length >= 3 && (
            <div id="chk">
              {!hit0 ? (
                <div className="chkbox" style={{ ['--c' as string]: 'var(--quiet)' }}>
                  <h3>No hay ninguna flota con «{q.trim()}»</h3>
                  <p>No consta en el registro ni por nombre, ni por CIF, ni por tomador. Si te la piden, créala desde Estudio.</p>
                </div>
              ) : (
                <div className="chkbox" style={{ ['--c' as string]: `var(--st-${estInfo(hit0.f.estado).key})` }}>
                  <h3>{hit0.sc >= 70 ? (live ? 'Ya hay un estudio en curso de esta flota' : 'Ya tenemos esta flota en el registro') : 'Hay flotas con un nombre parecido'}</h3>
                  <p>{hit0.sc >= 70 ? (live ? 'Antes de crear otra carpeta, abre la que existe: ahí está todo lo hecho.' : 'Revisa su historial antes de volver a estudiarla.') : 'Comprueba que no sea la misma antes de crear una nueva.'}</p>
                  {hits.slice(0, 4).map(h => {
                    const mv = lastMov(h.f), rj = rechazos(h.f);
                    return (
                      <div className="hit" key={h.f.id}>
                        <div className="nm">{h.f.nombre} {tagOf(h.f.estado)}<span className="why">{h.why}</span></div>
                        <div className="ln">
                          <b>Último movimiento:</b> {mv.t} · {fdate(mv.d)}{h.f.estado === 'RECHAZADA' && rj.length ? <> · <b>Motivo:</b> {rj[rj.length - 1].motivo}</> : null}
                          <br />{corN(h.f)} · {nf(nEst(h.f))} estudio{nEst(h.f) > 1 ? 's' : ''}{h.f.vehiculos ? ` · ${nf(h.f.vehiculos)} vehículos` : ''}
                        </div>
                        <button className="mini" onClick={() => setFichaId(h.f.id)}>Ver ficha</button>
                      </div>
                    );
                  })}
                  {hits.length > 4 && <p style={{ marginTop: 10 }}>Y {nf(hits.length - 4)} coincidencias más en el registro de abajo.</p>}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Filtros */}
        <section className="filterbar" aria-label="Filtros de la zona">
          <select className="select" value={fEst} onChange={e => { setFEst(e.target.value); resetShown(); }} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.plural}</option>)}
          </select>
          <select className="select" value={fSuc} onChange={e => { setFSuc(e.target.value); resetShown(); }} aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales</option>
            {Object.entries(SUC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            {corredores.some(c => !c.sucursal) && <option value="_">Sin asignar</option>}
          </select>
          <select className="select" value={fCor} onChange={e => { setFCor(e.target.value); resetShown(); }} aria-label="Filtrar por corredor">
            <option value="">Todos los corredores</option>
            {corredoresOrden.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="select" value={fVen} onChange={e => { setFVen(e.target.value); resetShown(); }} aria-label="Filtrar por vencimiento">
            <option value="">Cualquier vencimiento</option>
            <option value="prox">Vencen en 60 días</option>
          </select>
        </section>

        {/* KPIs */}
        <section className="kpis" aria-label="Indicadores principales">
          <button className="kpi" onClick={() => openDetail(detailKpi('flotas'))}>
            <div className="l">Flotas registradas</div>
            <div className="v">{nf(n)}</div>
            <div className="n"><b>{nf(by('CONTRATADA'))}</b> contratadas · {nf(by('EN ESTUDIO'))} en estudio · {nf(by('ESTUDIADA'))} estudiadas · {nf(by('OFERTADA'))} ofertadas</div>
          </button>
          <button className="kpi" onClick={() => openDetail(detailKpi('tasa'))}>
            <div className="l">Tasa de contratación</div>
            <div className="v">{n ? pc(T.cont.length / n * 100, Number.isInteger(T.cont.length / n * 100) ? 0 : 1) : '—'}</div>
            <div className="n"><b>{nf(T.cont.length)}</b> contratadas de {nf(n)}</div>
          </button>
          <button className="kpi" onClick={() => openDetail(detailKpi('vence'))}>
            <div className="l">Vencen en 60 días</div>
            <div className="v">{nf(T.ven.length)}</div>
            <div className="n">{T.ven.length ? <>La primera: <b>{T.ven[0].nombre}</b></> : 'Ninguna contratada vence pronto'}</div>
          </button>
          <button className="kpi" onClick={() => openDetail(detailKpi('rech'))}>
            <div className="l">Estudios rechazados</div>
            <div className="v">{nf(T.rej.length)}</div>
            <div className="n">{T.motivos[0] ? <>Motivo principal: <b>{T.motivos[0][0]}</b></> : 'Sin rechazos'}</div>
          </button>
          <button className="kpi" onClick={() => openDetail(detailKpi('prima'))}>
            <div className="l">Prima contratada</div>
            <div className="v">{eur(T.prima)}</div>
            <div className="n">Suma de las flotas contratadas</div>
          </button>
        </section>

        {/* Gráficos */}
        <div className="grid2">
          <section>
            <div className="shead">
              <h2>Vencimientos de las contratadas</h2>
              <p className="sub-desc">{nf(totMes)} contratadas vencen en los próximos 12 meses</p>
            </div>
            <div className="bars">
              {meses.map(m => bar(m.lb, m.L.length, mxMes, () => openDetail(detailMes(m.i))))}
            </div>
          </section>
          <section>
            <div className="shead">
              <h2>Por qué se rechazan</h2>
              <p className="sub-desc">{nf(T.rej.length)} {T.rej.length === 1 ? 'estudio rechazado' : 'estudios rechazados'} · {nf(new Set(T.rej.map(r => r.f.id)).size)} {new Set(T.rej.map(r => r.f.id)).size === 1 ? 'flota' : 'flotas'}</p>
            </div>
            <div className="bars">
              {T.motivos.length === 0
                ? <div className="empty">No hay rechazos en este ámbito.</div>
                : <>
                  {topMot.map((x, i) => bar(x[0], x[1], mxMot, () => openDetail(detailMotivo(i))))}
                  {restMot.length > 0 && bar(`Otros (${restMot.length})`, restMot.reduce((s, x) => s + x[1], 0), mxMot, () => openDetail(detailMotivo('all')), true)}
                </>}
            </div>
          </section>
        </div>

        {/* Registro */}
        <section className="dir" aria-labelledby="dirT">
          <div className="dirhead">
            <div>
              <h2 id="dirT">Registro de flotas</h2>
              <p className="sub-desc">
                {registro.length < scoped.length ? `${nf(registro.length)} de ${nf(scoped.length)}` : nf(scoped.length)} flotas · ordenadas por {COLS.find(c => c[0] === sortKey)?.[1].toLowerCase()}{sortDir < 0 ? ', de mayor a menor' : ', de menor a mayor'}
              </p>
            </div>
          </div>
          <div className="tscroll">
            {loading ? (
              <div className="empty">Cargando el registro…</div>
            ) : registro.length === 0 ? (
              <div className="empty">Ninguna flota coincide con la búsqueda y los filtros.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    {COLS.map(([k, label, cls]) => (
                      <th key={k} className={cls}>
                        <button className={`th${sortKey === k ? ' on' : ''}`} onClick={() => handleSort(k)}>{label}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {part.map(f => {
                    const mv = lastMov(f), dv = vdias(f), v = vcto(f);
                    return (
                      <tr key={f.id} tabIndex={0} onClick={() => setFichaId(f.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFichaId(f.id); } }}>
                        <td style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{f.nombre || '(sin nombre)'}</div>
                          <div className="muted">{f.cif || '—'}{f.tomador && norm(f.tomador) !== norm(f.nombre) ? ` · ${f.tomador}` : ''}</div>
                        </td>
                        <td className="c-cor">{f.corredor?.nombre ?? <span className="dim0">—</span>}</td>
                        <td>{tagOf(f.estado)}</td>
                        <td className="c-s">{f.vehiculos ? nf(f.vehiculos) : (f.rango ? rangoLabel(f.rango) : '—')}</td>
                        <td className="c-s">{f.prima ? eur(f.prima, 2) : '—'}</td>
                        <td className="c-ef">{fdate(efectoDate(f))}</td>
                        <td className="c-s">
                          {v ? <>
                            <span className={dv !== null && dv <= 60 ? 'venclr' : ''}>{fdate(v)}</span>
                            {dv !== null && dv <= 90 && <div className="muted">{dv < 0 ? `vencida hace ${nf(Math.abs(dv))} días` : `en ${nf(dv)} días`}</div>}
                          </> : '—'}
                        </td>
                        <td className="c-est">{nf(nEst(f))}</td>
                        <td className="c-mov">{mv.t}<div className="muted">{fdate(mv.d)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {left > 0 && (
            <div className="more">
              <button onClick={() => setShown(s => s + PAGE)}>Mostrar {nf(Math.min(PAGE, left))} más · quedan {nf(left)}</button>
            </div>
          )}
        </section>

        <div className="footer">
          <span>ORION · Datos en tiempo real</span>
          <span>Flotas · {fdate(new Date())}</span>
        </div>
      </div>

      <DetailDrawer isOpen={!!ficha || !!detail} onClose={closeAll} data={ficha ? null : detail}>
        {ficha && (
          <FichaFlota key={ficha.id} flota={ficha} nEstudios={nEst(ficha)} corredores={corredores}
            onSaved={() => { closeAll(); reload(); }} />
        )}
      </DetailDrawer>

      <div className={`fl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
