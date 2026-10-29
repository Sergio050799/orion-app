'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  listarCorredores, crearCorredor, guardarCorredor, eliminarCorredor,
  cargarCorredoresDelServidor, type Corredor, type Periodicidad, type Sucursal,
} from '@/core/flotas';
import {
  listarCarpetas, guardarCarpeta, cargarCarpetasDelServidor, type FlotaCarpeta,
} from '@/core/flotas';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATES = [
  { id: 'estudio',    name: 'En estudio'  },
  { id: 'estudiada',  name: 'Estudiadas'  },
  { id: 'ofertada',   name: 'Ofertadas'   },
  { id: 'contratada', name: 'Contratadas' },
  { id: 'rechazada',  name: 'Rechazadas'  },
] as const;
type StateId = typeof STATES[number]['id'];
const SN = Object.fromEntries(STATES.map(s => [s.id, s.name])) as Record<StateId, string>;

const SUC: Record<string, string> = { TITAN: 'Titán', MEDIACION: 'Mediación' };
const SUCK = ['TITAN', 'MEDIACION'] as const;
const PER: Record<string, string> = {
  mensual: 'Mensual', bimestral: 'Bimestral', trimestral: 'Trimestral',
  semestral: 'Semestral', anual: 'Anual',
};
const TOPB = 7;
const PAGE_SIZE = 20;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CorredorRow extends Corredor {
  n: number; nT: number; cT: number;
  ss: Record<StateId, number>;
  veh: number; prima: number; tasa: number; ext: number;
}

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'kpi'; key: string }
  | { mode: 'broker'; id: string; lq: string; lshown: number; pick: boolean; pq: string; pshown: number; delAsk: boolean; unlinkConfirm: string | null }
  | { mode: 'form'; brokerId: string | null }
  | { mode: 'comerciales' };

// ─── Helpers de formato ───────────────────────────────────────────────────────

const dec = (n: number, d = 1): string => {
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
};
const nf  = (n: number) => dec(Math.round(n), 0);
const eur = (n: number) => nf(n) + ' €';
const pc  = (n: number, d = 1) => dec(n, d) + ' %';
const pcs = (n: number) => dec(n, Number.isInteger(n) ? 0 : 1) + ' %';
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => a.length ? sum(a) / a.length : 0;
const wmean = (R: CorredorRow[]) => { const t = sum(R.map(b => b.n)); return t ? sum(R.map(b => b.comisionBase * b.n)) / t : 0; };
const norm = (t: string) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const sucName = (k: string) => SUC[k] ?? 'Sin asignar';

// ─── Helpers de datos ─────────────────────────────────────────────────────────

function normalizeEstado(estado: string | undefined): StateId {
  if (!estado) return 'estudio';
  const e = estado.toLowerCase().trim().replace(/\s+/g, '');
  if (e === 'enestudio' || e === 'estudio') return 'estudio';
  if (e === 'estudiada') return 'estudiada';
  if (e === 'ofertada')  return 'ofertada';
  if (e === 'contratada') return 'contratada';
  if (e === 'rechazada')  return 'rechazada';
  return 'estudio';
}

function getVehicleCount(carpeta: FlotaCarpeta): number {
  const rows = (carpeta.trabajo?.length > 0 ? carpeta.trabajo : carpeta.original) ?? [];
  return rows.filter((r: Record<string, string>) => r?.['matricula']?.trim()).length;
}

function enrichCorredor(c: Corredor, allCarpetas: FlotaCarpeta[], scope: string): CorredorRow {
  const mias = allCarpetas.filter(f => f.corredor_id === c.id);
  const inScope = (st: StateId) => scope === 'all' || scope === st;
  const flotas = mias.filter(f => inScope(normalizeEstado(f.estado)));
  const ss = Object.fromEntries(STATES.map(s => [s.id, 0])) as Record<StateId, number>;
  for (const f of flotas) { const st = normalizeEstado(f.estado); ss[st] = (ss[st] || 0) + 1; }
  const cT = mias.filter(f => normalizeEstado(f.estado) === 'contratada').length;
  const nT = mias.length;
  return {
    ...c,
    n: flotas.length,
    nT,
    cT,
    ss,
    veh: flotas.reduce((s, f) => s + getVehicleCount(f), 0),
    prima: flotas.reduce((s, f) => s + (Number((f.header as Record<string, unknown>)?.['primaOfertadaMMT']) || 0), 0),
    tasa: nT > 0 ? cT / nT * 100 : 0,
    ext: (c as unknown as Record<string, number>)['comisionExtra'] ?? 0,
  };
}

// ─── Componentes menores ──────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 24, zIndex: 60,
      transform: msg ? 'translate(-50%,0)' : 'translate(-50%,16px)',
      opacity: msg ? 1 : 0, pointerEvents: 'none', transition: 'opacity .2s,transform .2s',
      background: 'var(--t-text)', color: 'var(--t-bg)', padding: '12px 18px',
      borderRadius: 6, fontSize: 14, fontWeight: 500, maxWidth: 'calc(100vw - 32px)',
      whiteSpace: 'nowrap',
    }}>{msg}</div>
  );
}

// ─── CSS embebido (tokens del sistema de diseño referencia) ──────────────────


// ─── Componentes del drawer ───────────────────────────────────────────────────

function DrawerKpi({ kpiKey, rows, n, totalFlotasN }: {
  kpiKey: string; rows: CorredorRow[]; n: number; totalFlotasN: number;
}) {
  const R = rows;
  const S = [...R].sort((x, y) => y.n - x.n || x.nombre.localeCompare(y.nombre, 'es'));

  if (kpiKey === 'corredores' || kpiKey === 'flotas') {
    const total = sum(R.map(b => b.n));
    return (
      <>
        <div className="over">{kpiKey === 'flotas' ? 'Resumen' : 'Resumen'}</div>
        <h3>{kpiKey === 'flotas' ? 'Flotas asignadas' : 'Corredores'}</h3>
        <p className="desc">Corredores registrados en ORION y su peso en la cartera.</p>
        <div className="stats">
          <div><label>Corredores</label><strong>{nf(R.length)}</strong></div>
          <div><label>Flotas</label><strong>{nf(total)}</strong></div>
        </div>
        <h4>Desglose</h4>
        <table className="dtbl">
          <thead><tr><th>Corredor</th><th>Flotas</th><th>% del ámbito</th></tr></thead>
          <tbody>
            {S.slice(0, 20).map(b => (
              <tr key={b.id}>
                <td className="nm">{b.nombre}</td>
                <td>{nf(b.n)}</td>
                <td>{total ? pc(b.n / total * 100) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Anexo · cómo calcula ORION</h4>
        <div className="annex">
          <div className="fx"><b>Corredores</b><code>recuento de corredores del ámbito = {nf(R.length)}</code></div>
          <div className="fx"><b>Flotas asignadas</b><code>Σ flotas de cada corredor en el ámbito = {nf(total)}</code></div>
          <div className="fx"><b>Participación</b><code>flotas del corredor ÷ {nf(total)} × 100</code></div>
        </div>
      </>
    );
  }
  if (kpiKey === 'tasa') {
    const C = sum(R.map(b => b.cT)), T = sum(R.map(b => b.nT));
    return (
      <>
        <div className="over">Resultado</div>
        <h3>Tasa de contratación</h3>
        <p className="desc">Proporción de flotas contratadas sobre todas las flotas de cada corredor.</p>
        <div className="stats">
          <div><label>Contratadas</label><strong>{nf(C)}</strong></div>
          <div><label>Flotas</label><strong>{nf(T)}</strong></div>
          <div><label>Tasa</label><strong>{T ? pc(C / T * 100, 0) : '—'}</strong></div>
        </div>
        <h4>Desglose</h4>
        <table className="dtbl">
          <thead><tr><th>Corredor</th><th>Contratadas</th><th>Flotas</th><th>Tasa</th></tr></thead>
          <tbody>
            {[...R].sort((x, y) => y.tasa - x.tasa || y.nT - x.nT).slice(0, 20).map(b => (
              <tr key={b.id}>
                <td className="nm">{b.nombre}</td>
                <td>{nf(b.cT)}</td>
                <td>{nf(b.nT)}</td>
                <td>{b.nT ? pc(b.tasa, 1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Anexo · cómo calcula ORION</h4>
        <div className="annex">
          <div className="fx"><b>Tasa del corredor</b><code>flotas contratadas ÷ flotas totales del corredor × 100</code></div>
          <div className="fx"><b>Tasa del conjunto</b><code>Σ contratadas ÷ Σ flotas × 100 = {nf(C)} ÷ {nf(T)} × 100 = {T ? pc(C / T * 100, 1) : '—'}</code></div>
        </div>
      </>
    );
  }
  if (kpiKey === 'comision') {
    const mm = mean(R.map(b => b.comisionBase));
    const w = wmean(R);
    const extMedia = mean(R.map(b => b.ext || 0));
    const nFlotasTotal = sum(R.map(b => b.n));
    return (
      <>
        <div className="over">Resultado</div>
        <h3>Comisión media</h3>
        <p className="desc">Comisión base y extra por corredor. La media ponderada da más peso a quien tiene más flotas.</p>
        <div className="stats">
          <div><label>Media simple</label><strong>{R.length ? pc(mm, 2) : '—'}</strong></div>
          <div><label>Ponderada</label><strong>{nFlotasTotal ? pc(w, 2) : '—'}</strong></div>
          <div><label>Corredores</label><strong>{nf(R.length)}</strong></div>
        </div>
        <h4>Desglose</h4>
        <table className="dtbl">
          <thead><tr><th>Corredor</th><th>Base</th><th>Extra</th><th>Flotas</th></tr></thead>
          <tbody>
            {[...R].sort((x, y) => y.comisionBase - x.comisionBase).slice(0, 20).map(b => (
              <tr key={b.id}>
                <td className="nm">{b.nombre}</td>
                <td>{pcs(b.comisionBase)}</td>
                <td>{pcs(b.ext || 0)}</td>
                <td>{nf(b.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Anexo · cómo calcula ORION</h4>
        <div className="annex">
          <div className="fx"><b>Media simple</b><code>Σ % comisión ÷ nº de corredores = {dec(sum(R.map(b => b.comisionBase)), 1)} ÷ {nf(R.length)} = {R.length ? pc(mm, 2) : '—'}</code></div>
          <div className="fx"><b>Media ponderada</b><code>Σ (% comisión × flotas) ÷ Σ flotas = {dec(sum(R.map(b => b.comisionBase * b.n)), 1)} ÷ {nf(nFlotasTotal)} = {nFlotasTotal ? pc(w, 2) : '—'}</code></div>
          <div className="fx"><b>Comisión extra media</b><code>Σ extra ÷ corredores = {dec(sum(R.map(b => b.ext || 0)), 1)} ÷ {nf(R.length)} = {R.length ? pc(extMedia, 2) : '—'}</code></div>
        </div>
      </>
    );
  }
  if (kpiKey === 'prima') {
    const P = sum(R.map(b => b.prima));
    return (
      <>
        <div className="over">Resultado</div>
        <h3>Prima ofertada</h3>
        <p className="desc">Prima anual ofertada a las flotas de cada corredor en el ámbito seleccionado.</p>
        <div className="stats">
          <div><label>Prima total</label><strong>{eur(P)}</strong></div>
          <div><label>Corredores</label><strong>{nf(R.length)}</strong></div>
        </div>
        <h4>Desglose</h4>
        <table className="dtbl">
          <thead><tr><th>Corredor</th><th>Prima</th><th>% del total</th></tr></thead>
          <tbody>
            {[...R].sort((x, y) => y.prima - x.prima).slice(0, 20).map(b => (
              <tr key={b.id}><td className="nm">{b.nombre}</td><td>{eur(b.prima)}</td><td>{P ? pc(b.prima / P * 100) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <h4>Anexo · cómo calcula ORION</h4>
        <div className="annex">
          <div className="fx"><b>Prima del corredor</b><code>Σ prima ofertada de sus flotas en el ámbito</code></div>
          <div className="fx"><b>Prima total</b><code>Σ prima de cada corredor = {eur(P)}</code></div>
          <div className="fx"><b>Participación</b><code>prima del corredor ÷ {eur(P)} × 100</code></div>
        </div>
      </>
    );
  }
  if (kpiKey === 'suc') {
    const cols = [...SUCK];
    return (
      <>
        <div className="over">Sucursales</div>
        <h3>Titán y Mediación</h3>
        <p className="desc">Reparto de corredores y flotas entre las dos sucursales.</p>
        <div className="stats">
          <div><label>Corredores</label><strong>{nf(R.length)}</strong></div>
          <div><label>Flotas</label><strong>{nf(sum(R.map(b => b.n)))}</strong></div>
        </div>
        <h4>Desglose</h4>
        <table className="dtbl">
          <thead><tr><th>Sucursal</th><th>Corredores</th><th>Flotas</th><th>Com. media</th><th>Contratación</th></tr></thead>
          <tbody>
            {cols.map(k => {
              const X = rows.filter(b => (b.sucursal || '') === k);
              const nT = sum(X.map(b => b.nT)), cT = sum(X.map(b => b.cT));
              return (
                <tr key={k}>
                  <td className="nm">{sucName(k)}</td>
                  <td>{nf(X.length)}</td>
                  <td>{nf(sum(X.map(b => b.n)))}</td>
                  <td>{X.length ? pc(mean(X.map(b => b.comisionBase)), 1) : '—'}</td>
                  <td>{nT ? pc(cT / nT * 100, 0) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h4>Anexo · cómo calcula ORION</h4>
        <div className="annex">
          <div className="fx"><b>Corredores y flotas</b><code>recuento por el campo «Sucursal» de la ficha del corredor</code></div>
          <div className="fx"><b>Comisión media</b><code>Σ % comisión ÷ nº de corredores de la sucursal</code></div>
          <div className="fx"><b>Contratación</b><code>Σ flotas contratadas ÷ Σ flotas de la sucursal × 100</code></div>
        </div>
      </>
    );
  }
  return null;
}

// ─── Formulario corredor ──────────────────────────────────────────────────────

function FormCorredor({ brokerId, corredores, onSave, onCancel, showToast }: {
  brokerId: string | null;
  corredores: Corredor[];
  onSave: (c: Corredor) => void;
  onCancel: () => void;
  showToast: (m: string) => void;
}) {
  const broker = brokerId ? corredores.find(c => c.id === brokerId) ?? null : null;
  const [nombre, setNombre] = useState(broker?.nombre ?? '');
  const [suc, setSuc] = useState<string>(broker?.sucursal ?? '');
  const [com, setCom] = useState(broker?.comercial ?? '');
  const [cif, setCif] = useState(broker?.cif ?? '');
  const [pct, setPct] = useState(broker ? String(broker.comisionBase) : '');
  const [ext, setExt] = useState(broker ? String((broker as unknown as Record<string, number>)['comisionExtra'] ?? 0) : '');
  const [per, setPer] = useState<Periodicidad>(broker?.periodicidad ?? 'mensual');
  const [email, setEmail] = useState(broker?.email ?? '');
  const [tel, setTel] = useState(broker?.telefono ?? '');
  const [cod, setCod] = useState(broker?.codigo ?? '');
  const [idp, setIdp] = useState(broker?.idPerceptor ?? '');
  const [obs, setObs] = useState(broker?.observaciones ?? '');
  const [err, setErr] = useState('');
  const [ncShow, setNcShow] = useState(false);
  const [ncNombre, setNcNombre] = useState('');
  const [ncSuc, setNcSuc] = useState('');
  const [ncErr, setNcErr] = useState('');

  const comerciales = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of corredores) {
      if (c.comercial && !seen.has(c.comercial)) { seen.add(c.comercial); result.push(c.comercial); }
    }
    return result.sort((a, b) => a.localeCompare(b, 'es'));
  }, [corredores]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setErr('Escribe el nombre del corredor.'); return; }
    const pctN = parseFloat(pct.replace(',', '.')) || 0;
    const extN = parseFloat(ext.replace(',', '.')) || 0;
    if (pctN < 0 || pctN > 100) { setErr('La comisión base debe estar entre 0 y 100.'); return; }
    if (extN < 0 || extN > 100) { setErr('La comisión extra debe estar entre 0 y 100.'); return; }
    const cifU = cif.toUpperCase().replace(/\s/g, '');
    if (cifU && corredores.some(c => c.id !== brokerId && c.cif.toUpperCase() === cifU)) {
      setErr('Ya existe un corredor con ese CIF.'); return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { setErr('El email no parece válido.'); return; }
    setErr('');
    if (broker) {
      const updated: Corredor = { ...broker, nombre: nombre.trim(), cif: cifU, sucursal: suc as Sucursal || undefined, comercial: com || undefined, comisionBase: pctN, periodicidad: per, email, telefono: tel, codigo: cod || broker.codigo, idPerceptor: idp || undefined, observaciones: obs };
      (updated as unknown as Record<string, unknown>)['comisionExtra'] = extN;
      guardarCorredor(updated);
      showToast('Cambios guardados.');
      onSave(updated);
    } else {
      const nextNum = corredores.length + 1;
      const nuevo = crearCorredor({ nombre: nombre.trim(), cif: cifU, sucursal: suc as Sucursal || undefined, comercial: com || undefined, comisionBase: pctN, periodicidad: per, formaPago: '', contacto: '', email, telefono: tel, observaciones: obs, codigo: cod || `COR-${String(nextNum).padStart(3, '0')}`, idPerceptor: idp || undefined });
      (nuevo as unknown as Record<string, unknown>)['comisionExtra'] = extN;
      showToast('Corredor creado: ' + nombre.trim() + '.');
      onSave(nuevo);
    }
  }

  function addComercial() {
    if (!ncNombre.trim() || ncNombre.trim().length < 3) { setNcErr('Escribe nombre y apellidos.'); return; }
    if (!ncSuc) { setNcErr('Elige la sucursal.'); return; }
    setCom(ncNombre.trim()); setSuc(ncSuc);
    setNcShow(false); setNcNombre(''); setNcSuc(''); setNcErr('');
    showToast('Comercial añadido: ' + ncNombre.trim());
  }

  const nextCodNum = corredores.length + 1;

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="fld">
        <label htmlFor="f_nombre">Nombre <span className="req">*</span></label>
        <input className="inp" id="f_nombre" value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120} autoComplete="off" />
      </div>
      <div className="frow">
        <div className="fld">
          <label htmlFor="f_suc">Sucursal</label>
          <select className="select" id="f_suc" value={suc} onChange={e => setSuc(e.target.value)} style={{ width: '100%' }}>
            <option value="">Sin asignar</option>
            {SUCK.map(k => <option key={k} value={k}>{SUC[k]}</option>)}
          </select>
        </div>
        <div className="fld">
          <label htmlFor="f_com">Comercial</label>
          <select className="select" id="f_com" value={com} onChange={e => setCom(e.target.value)} style={{ width: '100%' }}>
            <option value="">Sin asignar</option>
            {comerciales.filter(c => !suc || corredores.some(x => x.comercial === c && (x.sucursal ?? '') === suc) || (!suc)).map(c => <option key={c} value={c}>{c}</option>)}
            {com && !comerciales.includes(com) && <option value={com}>{com}</option>}
          </select>
          <div className="hint">
            <button type="button" className="mini" onClick={() => setNcShow(v => !v)} style={{ marginTop: 6 }}>
              {ncShow ? '− Cancelar' : '+ Nuevo comercial'}
            </button>
          </div>
          {ncShow && (
            <div className="picker" style={{ marginTop: 8 }}>
              <h5>Nuevo comercial</h5>
              <input className="inp" placeholder="Nombre y apellidos" value={ncNombre} onChange={e => setNcNombre(e.target.value)} style={{ marginBottom: 8 }} />
              <select className="select" value={ncSuc} onChange={e => setNcSuc(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                <option value="">Elige sucursal</option>
                {SUCK.map(k => <option key={k} value={k}>{SUC[k]}</option>)}
              </select>
              {ncErr && <div className="ferr">{ncErr}</div>}
              <div className="fact" style={{ marginTop: 8 }}>
                <button type="button" className="mini pri" onClick={addComercial}>Añadir</button>
                <button type="button" className="mini" onClick={() => { setNcShow(false); setNcErr(''); }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="fld">
        <label htmlFor="f_cif">CIF</label>
        <input className="inp" id="f_cif" value={cif} onChange={e => setCif(e.target.value)} maxLength={12} autoComplete="off" />
      </div>
      <div className="frow">
        <div className="fld">
          <label htmlFor="f_pct">Comisión base %</label>
          <input className="inp" id="f_pct" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} placeholder="0" autoComplete="off" />
        </div>
        <div className="fld">
          <label htmlFor="f_ext">Comisión extra %</label>
          <input className="inp" id="f_ext" inputMode="decimal" value={ext} onChange={e => setExt(e.target.value)} placeholder="0" autoComplete="off" />
          <div className="hint">Se cobra si el corredor llega a los objetivos.</div>
        </div>
      </div>
      <div className="fld">
        <label htmlFor="f_per">Periodicidad de pago</label>
        <select className="select" id="f_per" value={per} onChange={e => setPer(e.target.value as Periodicidad)} style={{ width: '100%' }}>
          {Object.entries(PER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <details open={!!(broker && (broker.email || broker.telefono || broker.observaciones))}>
        <summary>Contacto y datos del perceptor</summary>
        <div className="frow">
          <div className="fld">
            <label htmlFor="f_email">Email</label>
            <input className="inp" id="f_email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="f_tel">Teléfono</label>
            <input className="inp" id="f_tel" value={tel} onChange={e => setTel(e.target.value)} />
          </div>
        </div>
        <div className="frow">
          <div className="fld">
            <label htmlFor="f_cod">Código perceptor</label>
            <input className="inp" id="f_cod" value={cod} onChange={e => setCod(e.target.value)} placeholder={`COR-${String(nextCodNum).padStart(3, '0')}`} />
            <div className="hint">Si lo dejas vacío, ORION lo genera.</div>
          </div>
          <div className="fld">
            <label htmlFor="f_idp">ID perceptor</label>
            <input className="inp" id="f_idp" value={idp} onChange={e => setIdp(e.target.value)} placeholder="Identificador externo" />
          </div>
        </div>
        <div className="fld">
          <label htmlFor="f_obs">Observaciones</label>
          <textarea className="inp" id="f_obs" value={obs} onChange={e => setObs(e.target.value)} />
        </div>
      </details>
      {err && <div className="ferr" role="alert">{err}</div>}
      <div className="fact">
        <button className="btn" type="submit">{broker ? 'Guardar cambios' : 'Crear corredor'}</button>
        <button className="btn ghost" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CorredoresPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carpetas, setCarpetas]     = useState<FlotaCarpeta[]>([]);
  const [scope, setScope]           = useState('all');
  const [fSuc, setFSuc]             = useState('');
  const [fCom, setFCom]             = useState('');
  const [query, setQuery]           = useState('');
  const [shown, setShown]           = useState(PAGE_SIZE);
  const [sortKey, setSortKey]       = useState('flotas');
  const [sortDir, setSortDir]       = useState(-1);
  const [drawer, setDrawer]         = useState<DrawerState>({ mode: 'closed' });
  const [toast, setToastMsg]        = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((m: string) => setToastMsg(m), []);

  // Cargar datos
  useEffect(() => {
    setCorredores(listarCorredores());
    setCarpetas(listarCarpetas());
    Promise.all([cargarCorredoresDelServidor(), cargarCarpetasDelServidor()]).then(([cs, fs]) => {
      setCorredores([...cs].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setCarpetas(fs);
    }).catch(() => {});
  }, []);

  // Derivar filas enriquecidas
  const allRows = useMemo<CorredorRow[]>(() =>
    corredores.map(c => enrichCorredor(c, carpetas, scope)),
    [corredores, carpetas, scope]
  );

  const matchSuc = (b: CorredorRow, x: string) => x === '' || (x === '_' ? !b.sucursal : b.sucursal === x);
  const matchCom = (b: CorredorRow, x: string) => x === '' || (x === '_' ? !b.comercial : b.comercial === x);

  // rows() = todos los corredores filtrados por sucursal y comercial
  const baseRows = useMemo(() => allRows.filter(b => matchCom(b, fCom)), [allRows, fCom]);
  const rows = useMemo(() => baseRows.filter(b => matchSuc(b, fSuc) && (scope === 'all' || b.n > 0)), [baseRows, fSuc, scope]);

  // Flotas sin corredor
  const unassigned = useMemo(() => {
    if (fSuc !== '' || fCom !== '') return [];
    const asignadas = new Set(carpetas.filter(c => c.corredor_id).map(c => c.id));
    return carpetas.filter(c => !asignadas.has(c.id) || !c.corredor_id).filter(f => {
      const st = normalizeEstado(f.estado);
      return scope === 'all' || scope === st;
    });
  }, [carpetas, fSuc, fCom, scope]);

  // Comerciales únicos
  const comerciales = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of corredores) {
      if (c.comercial && !seen.has(c.comercial)) { seen.add(c.comercial); result.push(c.comercial); }
    }
    return result.sort((a, b) => a.localeCompare(b, 'es'));
  }, [corredores]);

  // KPI values
  const kpiRows = rows;
  const kpiN = sum(kpiRows.map(b => b.n));
  const kpiC = sum(kpiRows.map(b => b.cT));
  const kpiT = sum(kpiRows.map(b => b.nT));
  const kpiPrima = sum(kpiRows.map(b => b.prima));
  const kpiMm = mean(kpiRows.map(b => b.comisionBase));
  const kpiWm = wmean(kpiRows);
  const kpiExtMedia = mean(kpiRows.map(b => b.ext || 0));
  const countSuc = (s: string) => kpiRows.filter(b => b.sucursal === s).length;
  const flotasSuc = (s: string) => sum(kpiRows.filter(b => b.sucursal === s).map(b => b.n));
  const sName = scope === 'all' ? 'Toda la cartera' : SN[scope as StateId] ?? scope;

  // Top rows para barras
  const topRows = useMemo(() => {
    const R = rows.filter(b => b.n > 0).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es'));
    if (R.length <= TOPB + 1) return R.map(b => ({ ...b, agg: false }));
    const rest = R.slice(TOPB);
    const top = R.slice(0, TOPB).map(b => ({ ...b, agg: false }));
    const aggSs = Object.fromEntries(STATES.map(s => [s.id, sum(rest.map(b => b.ss[s.id] || 0))])) as Record<StateId, number>;
    const agg = { ...rest[0], nombre: `Otros corredores (${rest.length})`, agg: true, n: sum(rest.map(b => b.n)), ss: aggSs };
    return [...top, agg];
  }, [rows]);
  const maxN = Math.max(...topRows.filter(b => !b.agg).map(b => b.n), 1);

  // Directorio
  const COLS = [
    ['nombre', 'Corredor', ''],
    ['suc', 'Sucursal', 'c-s'],
    ['com', 'Comercial', 'c-com'],
    ['cif', 'CIF', 'c-cif'],
    ['pct', 'Com. base', 'c-s'],
    ['ext', 'Com. extra', 'c-s'],
    ['per', 'Periodicidad', 'c-per'],
    ['flotas', 'Flotas', ''],
    ['tasa', 'Contratación', 'c-s'],
  ] as const;

  const sortVal = (b: CorredorRow, k: string): string | number => {
    if (k === 'nombre') return norm(b.nombre);
    if (k === 'suc') return sucName(b.sucursal ?? '');
    if (k === 'com') return norm(b.comercial ?? 'zzz');
    if (k === 'cif') return b.cif;
    if (k === 'pct') return b.comisionBase;
    if (k === 'ext') return b.ext || 0;
    if (k === 'per') return Object.keys(PER).indexOf(b.periodicidad);
    if (k === 'flotas') return b.n;
    if (k === 'tasa') return b.tasa;
    return '';
  };

  const filteredDir = useMemo(() => {
    let R = rows;
    if (query) { const q = norm(query); R = R.filter(b => norm([b.nombre, b.cif, b.comercial ?? '', b.codigo ?? '', b.idPerceptor ?? '', sucName(b.sucursal ?? '')].join(' ')).includes(q)); }
    R = [...R].sort((a, b) => {
      const x = sortVal(a, sortKey), y = sortVal(b, sortKey);
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'es') : (x as number) - (y as number);
      return (c || norm(a.nombre).localeCompare(norm(b.nombre), 'es')) * sortDir;
    });
    return R;
  }, [rows, query, sortKey, sortDir]);

  const dirPage = filteredDir.slice(0, shown);

  // Drawer broker
  const brokerDrawer = drawer.mode === 'broker' ? drawer : null;
  const brokerRow = brokerDrawer ? rows.find(b => b.id === brokerDrawer.id) ?? allRows.find(b => b.id === brokerDrawer.id) : null;
  const brokerCarpetas = brokerRow ? carpetas.filter(f => f.corredor_id === brokerRow.id) : [];

  // Acciones
  function openDrawer(d: DrawerState) {
    setDrawer(d);
    setTimeout(() => drawerRef.current?.focus({ preventScroll: true }), 50);
  }
  function closeDrawer() {
    setDrawer({ mode: 'closed' });
  }
  function handleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(k); setSortDir(['flotas', 'pct', 'ext', 'tasa'].includes(k) ? -1 : 1); }
    setShown(PAGE_SIZE);
  }
  function openBroker(id: string) {
    openDrawer({ mode: 'broker', id, lq: '', lshown: 8, pick: false, pq: '', pshown: 8, delAsk: false, unlinkConfirm: null });
  }
  function handleSaveCorredor(c: Corredor) {
    setCorredores(listarCorredores());
    if (drawer.mode === 'form' && drawer.brokerId) {
      openBroker(c.id);
    } else {
      closeDrawer();
    }
  }
  function handleDeleteBroker(mode: 'unlink' | 'all') {
    if (!brokerRow) return;
    if (mode === 'all') brokerCarpetas.forEach(f => { /* no eliminar carpetas, solo desvincular */ });
    brokerCarpetas.forEach(f => guardarCarpeta({ ...f, corredor_id: undefined }));
    eliminarCorredor(brokerRow.id);
    setCarpetas(listarCarpetas());
    setCorredores(listarCorredores());
    closeDrawer();
    showToast('Corredor eliminado.');
  }
  function handleUnlink(flotaId: string) {
    const f = carpetas.find(c => c.id === flotaId);
    if (!f) return;
    guardarCarpeta({ ...f, corredor_id: undefined });
    setCarpetas(listarCarpetas());
    showToast('Flota desvinculada: queda sin corredor.');
    if (brokerDrawer) setDrawer({ ...brokerDrawer, unlinkConfirm: null });
  }
  function handleLink(flotaId: string) {
    if (!brokerRow) return;
    const f = carpetas.find(c => c.id === flotaId);
    if (!f) return;
    guardarCarpeta({ ...f, corredor_id: brokerRow.id });
    setCarpetas(listarCarpetas());
    showToast('Flota vinculada: ' + (f.nombre || '(sin nombre)'));
    if (brokerDrawer) setDrawer({ ...brokerDrawer, pick: false, pq: '' });
  }

  const drawerOpen = drawer.mode !== 'closed';

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Render listas del drawer
  const dLq = brokerDrawer?.lq ?? '';
  const dLshown = brokerDrawer?.lshown ?? 8;
  const brokerListAll = brokerCarpetas;
  const brokerListQ = dLq ? brokerListAll.filter(f => norm(f.nombre || '').includes(norm(dLq)) || norm(SN[normalizeEstado(f.estado)] || '').includes(norm(dLq))) : brokerListAll;
  const brokerListPart = brokerListQ.slice(0, dLshown);

  const dPq = brokerDrawer?.pq ?? '';
  const dPshown = brokerDrawer?.pshown ?? 8;
  const pickAll = brokerDrawer?.pick ? carpetas.filter(f => {
    if (f.corredor_id === brokerRow?.id) return false;
    return !dPq || norm(f.nombre || '').includes(norm(dPq));
  }).sort((x, y) => (!x.corredor_id ? 0 : 1) - (!y.corredor_id ? 0 : 1) || (x.nombre || '').localeCompare(y.nombre || '', 'es')) : [];
  const pickPart = pickAll.slice(0, dPshown);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date());
  const todayStr = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <>
      

      <div className="pg">
        {/* Intro */}
        <section className="intro" style={{ marginTop: 0, paddingTop: 0 }}>
          <div>
            <h1>Corredores</h1>
            <p>Alta, edición y asignación de flotas · {todayStr}</p>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => openDrawer({ mode: 'form', brokerId: null })}>Nuevo corredor</button>
            <button className="btn ghost" onClick={() => openDrawer({ mode: 'comerciales' })}>Nuevo comercial</button>
            <button className="btn ghost" onClick={() => showToast('El informe descargable se diseña en la fase de informes.')}>Descargar informe</button>
          </div>
        </section>

        {/* Filtros */}
        <section className="filterbar" aria-label="Filtros de la zona">
          <select className="select" value={fSuc} onChange={e => { setFSuc(e.target.value); setShown(PAGE_SIZE); }} aria-label="Filtrar por sucursal">
            <option value="">Todas las sucursales</option>
            {SUCK.map(k => <option key={k} value={k}>{SUC[k]}</option>)}
            {corredores.some(c => !c.sucursal) && <option value="_">Sin asignar</option>}
          </select>
          <select className="select" value={fCom} onChange={e => { setFCom(e.target.value); setShown(PAGE_SIZE); }} aria-label="Filtrar por comercial">
            <option value="">Todos los comerciales</option>
            {comerciales.map(c => <option key={c} value={c}>{c}</option>)}
            {corredores.some(c => !c.comercial) && <option value="_">Sin asignar</option>}
          </select>
          <select className="select" value={scope} onChange={e => { setScope(e.target.value); setShown(PAGE_SIZE); }} aria-label="Filtrar por estado de las flotas">
            <option value="all">Toda la cartera</option>
            {STATES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </section>

        {/* KPIs */}
        <section className="kpis" aria-label="Indicadores principales" style={{ marginBottom: 0 }}>
          <button className="kpi" onClick={() => openDrawer({ mode: 'kpi', key: 'corredores' })}>
            <div className="l">Corredores</div>
            <div className="v">{nf(kpiRows.length)}</div>
            <div className="n"><b>Titán</b> {nf(countSuc('TITAN'))} · <b>Mediación</b> {nf(countSuc('MEDIACION'))}</div>
          </button>
          <button className="kpi" onClick={() => openDrawer({ mode: 'kpi', key: 'flotas' })}>
            <div className="l">Flotas asignadas</div>
            <div className="v">{nf(kpiN)}</div>
            <div className="n"><b>Titán</b> {nf(flotasSuc('TITAN'))} · <b>Mediación</b> {nf(flotasSuc('MEDIACION'))}{unassigned.length > 0 ? <> · <b>{nf(unassigned.length)}</b> sin corredor</> : null}</div>
          </button>
          <button className="kpi" onClick={() => openDrawer({ mode: 'kpi', key: 'tasa' })}>
            <div className="l">Tasa de contratación</div>
            <div className="v">{kpiT ? pc(kpiC / kpiT * 100, 0) : '—'}</div>
            <div className="n"><b>{nf(kpiC)}</b> contratadas de {nf(kpiT)} flotas</div>
          </button>
          <button className="kpi" onClick={() => openDrawer({ mode: 'kpi', key: 'comision' })}>
            <div className="l">Comisión base media</div>
            <div className="v">{kpiRows.length ? pc(kpiMm, 1) : '—'}</div>
            <div className="n">Base ponderada por flotas: <b>{kpiN ? pc(kpiWm, 1) : '—'}</b> · extra media: <b>{kpiRows.length ? pc(kpiExtMedia, 1) : '—'}</b></div>
          </button>
          <button className="kpi" onClick={() => openDrawer({ mode: 'kpi', key: 'prima' })}>
            <div className="l">Prima ofertada</div>
            <div className="v mny">{eur(kpiPrima)}</div>
            <div className="n">Suma de las flotas del ámbito</div>
          </button>
        </section>

        {/* Grid: Cartera | Titán y Mediación */}
        <div className="grid2" style={{ marginTop: 0 }}>
          <section>
            <div className="shead">
              <h2>Cartera por corredor</h2>
              <p className="sub-desc">{sName} · {nf(rows.length)} corredores</p>
            </div>
            <div className="legend">
              {STATES.slice(0, 4).map(s => s.id !== 'estudiada' ? (
                <span key={s.id}><span className="sq" style={{ background: `var(--st-${s.id})` }} />{s.name}</span>
              ) : null)}
              <span><span className="sq" style={{ background: 'var(--st-rechazada)' }} />Rechazadas</span>
            </div>
            <div className="bars">
              {topRows.length === 0
                ? <div className="empty">No hay flotas en este ámbito.</div>
                : topRows.map((b, i) => (
                  <button key={b.id + i} className={`bar${b.agg ? ' agg' : ''}`} onClick={() => !b.agg && openBroker(b.id)}>
                    <span className="bn">{b.nombre}</span>
                    <span className="bt">
                      {!b.agg ? (
                        <span className="bk" style={{ width: `${b.n / maxN * 100}%` }}>
                          {STATES.filter(s => (b.ss[s.id] || 0) > 0).map(s => (
                            <span key={s.id} style={{ flex: b.ss[s.id], background: `var(--st-${s.id})` }} />
                          ))}
                        </span>
                      ) : null}
                    </span>
                    <span className="bv">{nf(b.n)}</span>
                  </button>
                ))
              }
            </div>
            <p className="note">Una flota se asigna a un único corredor.</p>
          </section>

          <section>
            <div className="shead">
              <h2>Titán y Mediación</h2>
              <p className="sub-desc">{sName}{fCom ? ` · ${fCom === '_' ? 'sin comercial' : fCom}` : ''}</p>
            </div>
            <div className="tscroll">
              {(() => {
                const cols = [...SUCK];
                const colData = cols.map(k => {
                  const X = baseRows.filter(b => (b.sucursal || '') === k);
                  const nT = sum(X.map(b => b.nT)), cT = sum(X.map(b => b.cT));
                  const inScopeFlt = X.filter(b => scope === 'all' || b.n > 0);
                  return { k, c: inScopeFlt.length, n: sum(inScopeFlt.map(b => b.n)), veh: sum(inScopeFlt.map(b => b.veh)), tasa: nT ? cT / nT * 100 : null, com: X.length ? mean(X.map(b => b.comisionBase)) : null, prima: sum(inScopeFlt.map(b => b.prima)) };
                });
                const selSuc = (k: string) => fSuc === '' || fSuc === k;
                const rowDefs: [string, (d: typeof colData[0]) => string][] = [
                  ['Corredores', d => nf(d.c)],
                  ['Flotas', d => nf(d.n)],
                  ['Vehículos', d => nf(d.veh)],
                  ['Contratación', d => d.tasa == null ? '—' : pc(d.tasa, 0)],
                  ['Comisión media', d => d.com == null ? '—' : pc(d.com, 1)],
                  ['Prima ofertada', d => eur(d.prima)],
                ];
                return (
                  <table className="tbl stbl on" onClick={() => openDrawer({ mode: 'kpi', key: 'suc' })}>
                    <thead>
                      <tr>
                        <th></th>
                        {colData.map(d => <th key={d.k} className={selSuc(d.k) ? 'selcol' : ''}>{sucName(d.k)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rowDefs.map(([label, fn]) => (
                        <tr key={label} style={{ cursor: 'pointer' }}>
                          <td style={{ textAlign: 'left', fontWeight: 500, color: 'var(--t-text)' }}>{label}</td>
                          {colData.map(d => <td key={d.k} className={selSuc(d.k) ? '' : 'dim0'}>{fn(d)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
            <p className="note">Contratación y comisión media se calculan sobre todos los corredores de cada sucursal.</p>
          </section>
        </div>

        {/* Directorio */}
        <section className="dir" aria-labelledby="dirT">
          <div className="dirhead">
            <div>
              <h2 id="dirT">Directorio de corredores</h2>
              <p className="sub-desc">
                {sName} · {filteredDir.length < rows.length ? `${nf(filteredDir.length)} de ${nf(rows.length)}` : nf(rows.length)} corredores · ordenado por {COLS.find(c => c[0] === sortKey)?.[1]?.toLowerCase() ?? sortKey}{sortDir < 0 ? ', de mayor a menor' : ', de menor a mayor'}
              </p>
            </div>
            <input
              className="search"
              type="search"
              aria-label="Buscar corredor, CIF, comercial o código"
              placeholder="Buscar por nombre, CIF, comercial o código"
              value={query}
              onChange={e => { setQuery(e.target.value); setShown(PAGE_SIZE); }}
              autoComplete="off"
            />
          </div>
          <div className="tscroll">
            {filteredDir.length === 0 ? (
              <div className="empty">Ningún corredor coincide con la búsqueda y los filtros.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    {COLS.map(([k, label, cls]) => (
                      <th key={k} className={cls}>
                        <button className={`th${sortKey === k ? ' on' : ''}`} onClick={() => handleSort(k)}>
                          {label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dirPage.map(b => (
                    <tr key={b.id} tabIndex={0} onClick={() => openBroker(b.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && openBroker(b.id)}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{b.nombre}</div>
                        <div className="muted">{b.codigo}</div>
                      </td>
                      <td className="c-s">{sucName(b.sucursal ?? '')}</td>
                      <td className="c-com">{b.comercial ?? <span className="dim0">Sin asignar</span>}</td>
                      <td className="c-cif" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{b.cif || <span className="dim0">—</span>}</td>
                      <td className="c-s">{pcs(b.comisionBase)}</td>
                      <td className="c-s">{pcs(b.ext || 0)}</td>
                      <td className="c-per">{PER[b.periodicidad] ?? b.periodicidad}</td>
                      <td>{nf(b.n)}</td>
                      <td className="c-s">{b.nT ? pc(b.tasa, 0) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {filteredDir.length > shown && (
            <div className="more">
              <button className="mini" onClick={() => setShown(s => s + PAGE_SIZE)}>
                Mostrar {Math.min(PAGE_SIZE, filteredDir.length - shown)} más · quedan {nf(filteredDir.length - shown)}
              </button>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="footer">
          <span>ORION · Datos en tiempo real</span>
          <span>Corredores · {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date())}</span>
        </div>
      </div>

      {/* Scrim + Drawer — portalizados a body para escapar del stacking context del <main> */}
      {mounted && drawerOpen && createPortal(
        <div className="dr-scrim open" onClick={closeDrawer} />,
        document.body
      )}

      {mounted && drawerOpen && createPortal(
        <aside
          className="dr-drawer open"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dTitle"
          aria-hidden={!drawerOpen}
          tabIndex={-1}
        >
          <button className="x" onClick={closeDrawer} aria-label="Cerrar">×</button>

          {/* KPI detail */}
          {drawer.mode === 'kpi' && (
            <DrawerKpi kpiKey={drawer.key} rows={rows} n={kpiN} totalFlotasN={kpiN} />
          )}

          {/* Broker detail */}
          {drawer.mode === 'broker' && brokerRow && (() => {
            const b = brokerRow;
            return (
              <>
                <div className="over">Corredor · {b.sucursal ? sucName(b.sucursal) : 'Sin sucursal'}</div>
                <h3 id="dTitle">{b.nombre}</h3>
                <p className="desc">
                  {b.comercial ? `Comercial: ${b.comercial}. ` : 'Sin comercial asignado. '}
                  Comisión base {pcs(b.comisionBase)} + extra {pcs(b.ext || 0)} · {PER[b.periodicidad] ?? b.periodicidad}.
                </p>
                <div className="dacts">
                  <button className="mini pri" onClick={() => openDrawer({ mode: 'form', brokerId: b.id })}>Editar</button>
                  <button className="mini" onClick={() => showToast('Se abre Estudio para crear la flota con este corredor ya asignado.')}>Nueva flota</button>
                  <button className="mini" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, pick: !brokerDrawer.pick, pq: '' })}>
                    {brokerDrawer?.pick ? '− Cerrar vincular' : 'Vincular flotas'}
                  </button>
                  <button className="mini danger" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, delAsk: true })}>Eliminar</button>
                </div>

                {brokerDrawer?.delAsk && (
                  <div className="confirm">
                    <b>¿Eliminar a {b.nombre}?</b><br />
                    {brokerCarpetas.length > 0
                      ? `Tiene ${nf(brokerCarpetas.length)} flotas vinculadas. Sus flotas quedarán sin corredor.`
                      : 'No tiene flotas vinculadas.'}
                    <div className="row">
                      <button className="mini danger" onClick={() => handleDeleteBroker('unlink')}>
                        {brokerCarpetas.length > 0 ? 'Eliminar y desvincular flotas' : 'Sí, eliminar'}
                      </button>
                      <button className="mini" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, delAsk: false })}>Cancelar</button>
                    </div>
                  </div>
                )}

                <div className="stats">
                  <div><label>Flotas</label><strong>{nf(brokerCarpetas.length)}</strong></div>
                  <div><label>Vehículos</label><strong>{nf(sum(brokerCarpetas.map(getVehicleCount)))}</strong></div>
                  <div><label>Contratación</label><strong>{b.nT ? pc(b.tasa, 0) : '—'}</strong></div>
                  <div><label>Prima</label><strong>{eur(b.prima)}</strong></div>
                </div>

                <h4>Ficha</h4>
                <div className="kv">
                  {[
                    ['Código perceptor', b.codigo],
                    ['ID perceptor', b.idPerceptor],
                    ['CIF', b.cif],
                    ['Sucursal', b.sucursal ? sucName(b.sucursal) : ''],
                    ['Comercial', b.comercial],
                    ['Comisión base', pcs(b.comisionBase)],
                    ['Comisión extra (por objetivos)', pcs(b.ext || 0)],
                    ['Periodicidad', PER[b.periodicidad] ?? b.periodicidad],
                    ['Email', b.email],
                    ['Teléfono', b.telefono],
                    ['Observaciones', b.observaciones],
                  ].map(([lbl, val]) => (
                    <div key={lbl as string}>
                      <label>{lbl as string}</label>
                      <span className={val ? '' : 'em'}>{(val as string) || 'Sin dato'}</span>
                    </div>
                  ))}
                </div>

                {/* Vincular flotas */}
                {brokerDrawer?.pick && (
                  <div className="picker">
                    <h5>Vincular flotas a este corredor</h5>
                    <input className="inp" type="search" placeholder="Buscar flota por nombre" value={brokerDrawer.pq}
                      onChange={e => setDrawer({ ...brokerDrawer, pq: e.target.value, pshown: 8 })}
                      style={{ marginBottom: 8 }}
                    />
                    {pickAll.length === 0 ? (
                      <div className="empty" style={{ border: 0, paddingTop: 8 }}>No hay más flotas para vincular.</div>
                    ) : (
                      <>
                        <table className="dtbl static" style={{ marginTop: 8 }}>
                          <tbody>
                            {pickPart.map(f => {
                              const owner = f.corredor_id ? corredores.find(c => c.id === f.corredor_id) : null;
                              return (
                                <tr key={f.id}>
                                  <td className="nm">
                                    {f.nombre || '(sin nombre)'}
                                    <div className="muted">{owner ? `Ahora en ${owner.nombre}` : 'Sin corredor'}</div>
                                  </td>
                                  <td>
                                    <span className="tag" style={{ '--c': `var(--st-${normalizeEstado(f.estado)})` } as React.CSSProperties}>
                                      {SN[normalizeEstado(f.estado)]}
                                    </span>
                                  </td>
                                  <td><button className="mini pri" onClick={() => handleLink(f.id)}>Vincular</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {pickAll.length > dPshown && (
                          <div className="lmore">
                            <button className="mini" onClick={() => setDrawer({ ...brokerDrawer, pshown: dPshown + 8 })}>
                              Mostrar {Math.min(8, pickAll.length - dPshown)} más · quedan {nf(pickAll.length - dPshown)}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Flotas vinculadas */}
                <h4>Flotas vinculadas · {nf(brokerCarpetas.length)}</h4>
                <div className="ltools">
                  <input className="inp" type="search" placeholder="Buscar flota vinculada" value={brokerDrawer?.lq ?? ''}
                    onChange={e => brokerDrawer && setDrawer({ ...brokerDrawer, lq: e.target.value, lshown: 8 })}
                    style={{ flex: 1 }}
                  />
                </div>
                {brokerListQ.length === 0 ? (
                  <div className="empty">{brokerCarpetas.length ? 'Ninguna flota coincide.' : 'Este corredor aún no tiene flotas.'}</div>
                ) : (
                  <>
                    <table className="dtbl static">
                      <thead><tr><th>Flota</th><th>Estado</th><th>Veh.</th><th></th></tr></thead>
                      <tbody>
                        {brokerListPart.map(f => {
                          const st = normalizeEstado(f.estado);
                          const isConfirm = brokerDrawer?.unlinkConfirm === f.id;
                          return (
                            <tr key={f.id}>
                              <td className="nm">{f.nombre || '(sin nombre)'}</td>
                              <td><span className="tag" style={{ '--c': `var(--st-${st})` } as React.CSSProperties}>{SN[st]}</span></td>
                              <td>{nf(getVehicleCount(f))}</td>
                              <td>
                                {isConfirm ? (
                                  <>
                                    <span style={{ fontSize: 12, color: 'var(--t-text-3)', marginRight: 6 }}>¿Desvincular?</span>
                                    <button className="mini danger" onClick={() => handleUnlink(f.id)}>Sí</button>
                                    {' '}
                                    <button className="mini" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, unlinkConfirm: null })}>No</button>
                                  </>
                                ) : (
                                  <button className="mini" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, unlinkConfirm: f.id })}>Desvincular</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {brokerListQ.length > dLshown && (
                      <div className="lmore">
                        <button className="mini" onClick={() => brokerDrawer && setDrawer({ ...brokerDrawer, lshown: dLshown + 8 })}>
                          Mostrar {Math.min(8, brokerListQ.length - dLshown)} más · quedan {nf(brokerListQ.length - dLshown)}
                        </button>
                      </div>
                    )}
                  </>
                )}

                <h4>Anexo · cómo calcula ORION</h4>
                <div className="annex">
                  <div className="fx"><b>Participación en la cartera</b><code>flotas del corredor ÷ flotas asignadas del ámbito = {nf(b.n)} ÷ {nf(sum(rows.map(x => x.n)))} × 100</code></div>
                  <div className="fx"><b>Tasa de contratación</b><code>{nf(b.cT)} contratadas ÷ {nf(b.nT)} flotas × 100 = {b.nT ? pc(b.tasa, 1) : '—'}</code></div>
                  <div className="fx"><b>Prima ofertada</b><code>Σ prima de sus flotas = {eur(b.prima)}</code></div>
                  <div className="fx"><b>Vehículos</b><code>Σ vehículos de sus flotas = {nf(sum(brokerCarpetas.map(getVehicleCount)))}</code></div>
                </div>
              </>
            );
          })()}

          {/* Formulario */}
          {drawer.mode === 'form' && (() => {
            const broker = drawer.brokerId ? corredores.find(c => c.id === drawer.brokerId) : null;
            return (
              <>
                <div className="over">{broker ? 'Editar corredor' : 'Nuevo corredor'}</div>
                <h3 id="dTitle">{broker ? broker.nombre : 'Alta de corredor'}</h3>
                <p className="desc">{broker ? 'Los cambios se aplican en Estudio y Flotas al guardar.' : 'Solo el nombre es obligatorio. El resto se puede completar después.'}</p>
                <FormCorredor
                  brokerId={drawer.brokerId}
                  corredores={corredores}
                  onSave={c => { setCorredores(listarCorredores()); drawer.brokerId ? openBroker(drawer.brokerId) : closeDrawer(); }}
                  onCancel={() => drawer.brokerId ? openBroker(drawer.brokerId) : closeDrawer()}
                  showToast={showToast}
                />
              </>
            );
          })()}

          {/* Comerciales */}
          {drawer.mode === 'comerciales' && (() => {
            return (
              <>
                <div className="over">Comerciales</div>
                <h3 id="dTitle">Nuevo comercial</h3>
                <p className="desc">Un comercial trabaja en una sola sucursal. Los comerciales se crean al añadir o editar un corredor.</p>
                <h4>Comerciales existentes · {nf(comerciales.length)}</h4>
                {comerciales.length === 0 ? (
                  <div className="empty">Aún no hay comerciales. Crea uno al dar de alta un corredor.</div>
                ) : (
                  <table className="dtbl static">
                    <thead><tr><th>Comercial</th><th>Sucursal</th><th>Corredores</th></tr></thead>
                    <tbody>
                      {comerciales.map(c => {
                        const suc = corredores.find(x => x.comercial === c)?.sucursal ?? '';
                        const cnt = corredores.filter(x => x.comercial === c).length;
                        return (
                          <tr key={c}>
                            <td className="nm">{c}</td>
                            <td>{suc ? sucName(suc) : <span className="dim0">Sin asignar</span>}</td>
                            <td>{nf(cnt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                <div className="dacts" style={{ marginTop: 20 }}>
                  <button className="btn" onClick={() => openDrawer({ mode: 'form', brokerId: null })}>Nuevo corredor con comercial</button>
                </div>
              </>
            );
          })()}
        </aside>,
        document.body
      )}

      <Toast msg={toast} onDone={() => setToastMsg(null)} />
    </>
  );
}
