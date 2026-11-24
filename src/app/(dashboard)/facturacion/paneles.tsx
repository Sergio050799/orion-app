'use client';

// Paneles laterales de Facturación: datos de la flota, corrección de una línea y anular / borrar un recibo emitido.

import { useState } from 'react';
import {
  diaDe, esDe, importeDe, isoDe, MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD,
  type LineaRecibo, type TomadorFacturacion,
} from '@/core/flotas/facturacion';
import { esCifValido } from '@/core/validators/cif';
import { eur2, nf } from '@/lib/fmt';
import type { ConfigFacturacion } from './generar';

export const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual'];
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}${Math.random().toString(16).slice(2)}`);
export const pctTxt = (n: number) => `${String(n).replace('.', ',')} %`;

export interface FacturaHist {
  id: string; numero: string; serie: 'RC' | 'RW'; tomador_nombre: string; vencimiento: string; estado: string; recibos: number;
  neta: number; impuesto: number; importe: number; comision: number; liquido: number; texto_periodo: string; creado_por: string; creado_en: string;
  anulada_por?: string; anulada_en?: string; motivo_anulacion?: string;
}
export type Edicion = { quitada: true } | { neta: number; impuesto: number; importe: number };

// ─── Datos de facturación de la flota ────────────────────────────────────────

export function PanelConfig({ cfg, onGuardar, onCancelar }: { cfg: ConfigFacturacion; onGuardar: (c: ConfigFacturacion) => void | Promise<void>; onCancelar: () => void }) {
  const [c, setC] = useState<ConfigFacturacion>(() => ({ ...cfg, corredor: { ...cfg.corredor }, tomadores: cfg.tomadores.map(t => ({ ...t, alias: [...t.alias] })) }));
  const [inicio, setInicio] = useState(esDe(cfg.inicioCiclo));
  const [comision, setComision] = useState(String(cfg.corredor.comision ?? 0).replace('.', ','));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const setCor = (k: 'nombre' | 'cif' | 'domicilio', v: string) => setC(p => ({ ...p, corredor: { ...p.corredor, [k]: v } }));
  const setTom = (id: string, parche: Partial<TomadorFacturacion>) => setC(p => ({ ...p, tomadores: p.tomadores.map(t => (t.id === id ? { ...t, ...parche } : t)) }));

  const guardar = async () => {
    const d = diaDe(inicio);
    if (!d) { setError('Escribe el inicio del ciclo como dd/mm/aaaa (por ejemplo, 01/01/2026).'); return; }
    if (!MESES_PERIODICIDAD[c.periodicidad]) { setError('Elige la periodicidad de pago.'); return; }
    const pct = importeDe(comision);
    if (pct === null || pct < 0 || pct > 100) { setError('La comisión debe ser un porcentaje entre 0 y 100.'); return; }
    const tomadores = c.tomadores.map(t => ({ ...t, nombre: t.nombre.trim(), cif: t.cif.trim().toUpperCase(), alias: t.alias.map(a => a.trim()).filter(Boolean) })).filter(t => t.nombre);
    if (tomadores.length === 0) { setError('Añade al menos un tomador con su razón social.'); return; }
    const malo = tomadores.find(t => t.cif && !esCifValido(t.cif));
    if (malo) { setError(`El CIF de ${malo.nombre} no es válido.`); return; }
    setError(''); setGuardando(true);
    await onGuardar({ ...c, flota: c.flota.trim(), inicioCiclo: isoDe(d), corredor: { nombre: c.corredor.nombre.trim(), cif: c.corredor.cif.trim().toUpperCase(), domicilio: c.corredor.domicilio.trim(), comision: pct }, tomadores });
    setGuardando(false);
  };

  return (
    <>
      <div className="over">Facturación</div>
      <h3>Datos de facturación</h3>
      <p className="desc">Lo que se imprime en los recibos de esta flota. Se guarda una vez y vale para todas sus facturaciones.</p>
      <div className="form">
        <div className="fld"><label htmlFor="fc-flota">Nombre de la flota en el recibo</label><input id="fc-flota" className="inp" value={c.flota} onChange={e => setC(p => ({ ...p, flota: e.target.value }))} /><div className="hint">También se usa en los nombres de las carpetas y los archivos.</div></div>
        <div className="frow">
          <div className="fld"><label htmlFor="fc-ini">Inicio del ciclo anual <span className="req">*</span></label><input id="fc-ini" className="inp" placeholder="dd/mm/aaaa" value={inicio} onChange={e => setInicio(e.target.value)} /><div className="hint">Día en que empieza la anualidad. La renovación es un año después.</div></div>
          <div className="fld"><label htmlFor="fc-per">Periodicidad de pago <span className="req">*</span></label>
            <select id="fc-per" className="select" value={c.periodicidad} onChange={e => setC(p => ({ ...p, periodicidad: e.target.value }))}>
              <option value="">Elige…</option>
              {PERIODICIDADES.map(p => <option key={p} value={p}>{NOMBRE_PERIODICIDAD[MESES_PERIODICIDAD[p]]}</option>)}
            </select>
          </div>
        </div>

        <h4>Corredor</h4>
        <div className="fld"><label htmlFor="fc-cn">Razón social <span className="req">*</span></label><input id="fc-cn" className="inp" value={c.corredor.nombre} onChange={e => setCor('nombre', e.target.value)} /><div className="hint">Tal como debe salir en el recibo. Su inicial va en el número (R + inicial + fecha).</div></div>
        <div className="frow">
          <div className="fld"><label htmlFor="fc-cc">CIF <span className="req">*</span></label><input id="fc-cc" className="inp" value={c.corredor.cif} onChange={e => setCor('cif', e.target.value)} /></div>
          <div className="fld"><label htmlFor="fc-cp">Comisión (%)</label><input id="fc-cp" className="inp" inputMode="decimal" value={comision} onChange={e => setComision(e.target.value)} /><div className="hint">Sobre la prima neta, como en la fórmula del Excel.</div></div>
        </div>
        <div className="fld"><label htmlFor="fc-cd">Domicilio <span className="req">*</span></label><input id="fc-cd" className="inp" value={c.corredor.domicilio} onChange={e => setCor('domicilio', e.target.value)} /></div>

        <h4>{c.tomadores.length === 1 ? 'Tomador' : 'Tomadores'}</h4>
        <p className="hint" style={{ marginTop: -6 }}>Cada tomador recibe su propio recibo. En «También aparece como» van los nombres con los que sale en los Excel de la compañía, uno por línea.</p>
        {c.tomadores.map((t, i) => (
          <div className="picker" key={t.id}>
            <div className="fld"><label htmlFor={`fc-tn-${i}`}>Razón social <span className="req">*</span></label><input id={`fc-tn-${i}`} className="inp" value={t.nombre} onChange={e => setTom(t.id, { nombre: e.target.value })} /></div>
            <div className="fld" style={{ marginTop: 12 }}><label htmlFor={`fc-tc-${i}`}>CIF <span className="req">*</span></label><input id={`fc-tc-${i}`} className="inp" value={t.cif} onChange={e => setTom(t.id, { cif: e.target.value })} /></div>
            <div className="fld" style={{ marginTop: 12 }}><label htmlFor={`fc-ta-${i}`}>También aparece como</label><textarea id={`fc-ta-${i}`} className="inp" value={t.alias.join('\n')} onChange={e => setTom(t.id, { alias: e.target.value.split('\n') })} /></div>
            {c.tomadores.length > 1 && <div className="dacts"><button type="button" className="mini danger" onClick={() => setC(p => ({ ...p, tomadores: p.tomadores.filter(x => x.id !== t.id) }))}>Quitar este tomador</button></div>}
          </div>
        ))}
        <div><button type="button" className="mini" onClick={() => setC(p => ({ ...p, tomadores: [...p.tomadores, { id: uid(), nombre: '', cif: '', alias: [] }] }))}>Añadir otro tomador</button></div>

        <div className="ferr" role="alert">{error}</div>
        <div className="fact">
          <button type="button" className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn ghost" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </>
  );
}

// ─── Corregir una línea ──────────────────────────────────────────────────────

export function PanelLinea({ original, edicion, onGuardar, onQuitar, onRestaurar, onCancelar }: {
  original: LineaRecibo; edicion?: Edicion;
  onGuardar: (v: { neta: number; impuesto: number; importe: number }, motivo: string) => void;
  onQuitar: (motivo: string) => void; onRestaurar: () => void; onCancelar: () => void;
}) {
  const actual = edicion && !('quitada' in edicion) ? edicion : original;
  const txt = (n: number) => n.toFixed(2).replace('.', ',');
  const [neta, setNeta] = useState(txt(actual.neta));
  const [impuesto, setImpuesto] = useState(txt(actual.impuesto));
  const [importe, setImporte] = useState(txt(actual.importe));
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const guardar = () => {
    const n = importeDe(neta), i = importeDe(impuesto), t = importeDe(importe);
    if (n === null || i === null || t === null) { setError('Escribe los tres importes.'); return; }
    if (Math.round((n + i) * 100) !== Math.round(t * 100)) { setError('La prima neta más el impuesto tiene que dar el importe.'); return; }
    if (!motivo.trim()) { setError('Indica el motivo del cambio: queda registrado.'); return; }
    onGuardar({ neta: n, impuesto: i, importe: t }, motivo.trim());
  };

  return (
    <>
      <div className="over">Recibo {original.recibo}</div>
      <h3>Corregir línea</h3>
      <p className="desc">Póliza {original.poliza} · {original.riesgo || 'sin matrícula'} · {esDe(original.fecha) || 'sin fecha'} · {original.tipo || 'sin tipo'}{original.estado ? ` · ${original.estado}` : ''}. En el Excel: {eur2(original.neta)} + {eur2(original.impuesto)} = {eur2(original.importe)} (fila {nf(original.fila)}).</p>
      <div className="form">
        <div className="frow">
          <div className="fld"><label htmlFor="fl-n">Prima neta</label><input id="fl-n" className="inp" inputMode="decimal" value={neta} onChange={e => setNeta(e.target.value)} /></div>
          <div className="fld"><label htmlFor="fl-i">Impuesto</label><input id="fl-i" className="inp" inputMode="decimal" value={impuesto} onChange={e => setImpuesto(e.target.value)} /></div>
        </div>
        <div className="fld"><label htmlFor="fl-t">Importe</label><input id="fl-t" className="inp" inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} /></div>
        <div className="fld"><label htmlFor="fl-m">Motivo del cambio <span className="req">*</span></label><textarea id="fl-m" className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} /><div className="hint">Se guarda con tu usuario y la fecha, en la hoja «Cambios» del Excel.</div></div>
        <div className="ferr" role="alert">{error}</div>
        <div className="fact">
          <button type="button" className="btn" onClick={guardar}>Guardar corrección</button>
          <button type="button" className="btn ghost" onClick={onCancelar}>Cancelar</button>
        </div>
        <div className="dacts">
          <button type="button" className="mini danger" onClick={() => { if (!motivo.trim()) { setError('Indica el motivo para quitar la línea.'); return; } onQuitar(motivo.trim()); }}>Quitar esta línea del recibo</button>
          {edicion && <button type="button" className="mini" onClick={onRestaurar}>Dejarla como en el Excel</button>}
        </div>
      </div>
    </>
  );
}

// ─── Anular o borrar un recibo emitido ───────────────────────────────────────

export function PanelRetirar({ factura, modo, onHecho, onCancelar }: { factura: FacturaHist; modo: 'anular' | 'borrar'; onHecho: () => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const borrar = modo === 'borrar';
  const enviar = async () => {
    if (!borrar && !motivo.trim()) { setError('Indica el motivo de la anulación.'); return; }
    setEnviando(true); setError('');
    try {
      const res = await fetch(`/api/facturacion/factura/${encodeURIComponent(factura.id)}/${modo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || (borrar ? 'No se pudo borrar.' : 'No se pudo anular.'));
      onHecho();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar.'); setEnviando(false); }
  };
  return (
    <>
      <div className="over">Histórico</div>
      <h3>{borrar ? 'Borrar' : 'Anular'} {factura.numero}</h3>
      <p className="desc">
        {factura.tomador_nombre} · {nf(factura.recibos)} recibos · {eur2(factura.importe)}.{' '}
        {borrar
          ? 'Desaparece del histórico y deja de sumar en los totales. Sus recibos quedan libres para volver a facturarlos. No se puede deshacer.'
          : 'Se conserva en el histórico como anulado y deja de sumar. Sus recibos quedan libres para emitir la corrección.'}
      </p>
      <div className="form">
        {!borrar && <div className="fld"><label htmlFor="fan-m">Motivo <span className="req">*</span></label><textarea id="fan-m" className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} /></div>}
        <div className="ferr" role="alert">{error}</div>
        <div className="fact">
          <button type="button" className="btn" onClick={enviar} disabled={enviando}>{enviando ? (borrar ? 'Borrando…' : 'Anulando…') : (borrar ? 'Borrar definitivamente' : 'Anular recibo')}</button>
          <button type="button" className="btn ghost" onClick={onCancelar}>{borrar ? 'No borrar' : 'No anular'}</button>
        </div>
      </div>
    </>
  );
}
