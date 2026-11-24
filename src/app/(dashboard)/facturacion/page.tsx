'use client';

// ─── FACTURACIÓN DE FLOTAS ───────────────────────────────────────────────────
// Portada: las flotas contratadas con sus KPIs, gráficos y filtros (como la zona Flotas). Al abrir una flota se
// factura esa flota: emisión o regularización, cada una con su informe de MMT. Las reglas viven en
// core/flotas/facturacion.ts; el histórico y el control de doble facturación, en orion-api.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cargarCarpetasDelServidor, cargarCorredoresDelServidor, leerCarpetasDeSessionStorage, leerCorredoresDeSessionStorage,
  type Corredor, type FlotaCarpeta,
} from '@/core/flotas';
import { MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD } from '@/core/flotas/facturacion';
import { eur, eur2, nf } from '@/lib/fmt';
import FlotaFacturacion from './FlotaFacturacion';
import { PERIODICIDADES } from './paneles';

interface DocResumen { id: string; serie: 'RC' | 'RW'; numero: string; recibos: number; importe: number; comision: number; liquido: number; texto_periodo: string; creado_en: string }
interface ResumenFlota { config: { inicioCiclo: string; periodicidad: string; comision: number; completa: boolean } | null; documentos: DocResumen[] }
type Situacion = 'sin_datos' | 'pendiente' | 'facturada';

const SUC: Record<string, string> = { TITAN: 'Titán', MEDIACION: 'Mediación' };
const SITUACION: Record<Situacion, { nombre: string; color: string }> = {
  sin_datos: { nombre: 'Faltan datos', color: 'var(--warn)' },
  pendiente: { nombre: 'Sin facturar', color: 'var(--blue)' },
  facturada: { nombre: 'Facturada', color: 'var(--ok)' },
};
const fechaCorta = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

interface Fila {
  c: FlotaCarpeta; corredor: Corredor | null; sucursal: string; periodicidad: string; situacion: Situacion;
  docs: DocResumen[]; importe: number; comision: number; ultimo: DocResumen | null;
}

export default function FacturacionPage() {
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [resumen, setResumen] = useState<Record<string, ResumenFlota>>({});
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [flotaId, setFlotaId] = useState('');

  const [busca, setBusca] = useState('');
  const [fSuc, setFSuc] = useState('');
  const [fCor, setFCor] = useState('');
  const [fPer, setFPer] = useState('');
  const [fSit, setFSit] = useState<'' | Situacion>('');
  const [verFiltros, setVerFiltros] = useState(true);
  const [mostradas, setMostradas] = useState(25);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = useCallback((t: string) => { setToast(t); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(''), 3600); }, []);

  const cargarResumen = useCallback(() => {
    fetch('/api/facturacion/resumen').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.flotas) setResumen(d.flotas); }).catch(() => {});
  }, []);

  useEffect(() => {
    // Arranque instantáneo con lo último que se cargó en esta sesión; el servidor lo sustituye enseguida
    /* eslint-disable react-hooks/set-state-in-effect */
    const c = leerCarpetasDeSessionStorage(true); if (c) setCarpetas(c);
    const b = leerCorredoresDeSessionStorage(); if (b) setCorredores(b);
    /* eslint-enable react-hooks/set-state-in-effect */
    let vivo = true;
    Promise.all([cargarCarpetasDelServidor(undefined, true), cargarCorredoresDelServidor()])
      .then(([fs, cs]) => { if (vivo) { setCarpetas(fs); setCorredores(cs); } })
      .catch(() => { if (vivo) avisar('No se pudo conectar con el servidor. Los datos pueden no estar actualizados.'); })
      .finally(() => { if (vivo) setCargando(false); });
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (vivo && d?.username) setUsuario(d.username); }).catch(() => {});
    cargarResumen();
    return () => { vivo = false; };
  }, [avisar, cargarResumen]);

  const filas = useMemo((): Fila[] => {
    const porId = new Map(corredores.map(c => [c.id, c]));
    return carpetas.filter(c => c.estado === 'CONTRATADA').map(c => {
      const corredor = porId.get(c.corredor_id ?? '') ?? null;
      const r = resumen[c.id];
      const docs = r?.documentos ?? [];
      return {
        c, corredor, sucursal: corredor?.sucursal ?? '',
        periodicidad: r?.config?.periodicidad || c.header?.periodicidad || corredor?.periodicidad || '',
        situacion: (docs.length > 0 ? 'facturada' : r?.config?.completa ? 'pendiente' : 'sin_datos') as Situacion,
        docs, importe: docs.reduce((a, d) => a + d.importe, 0), comision: docs.reduce((a, d) => a + d.comision, 0), ultimo: docs[0] ?? null,
      };
    }).sort((a, b) => a.c.nombre.localeCompare(b.c.nombre));
  }, [carpetas, corredores, resumen]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return filas.filter(f =>
      (!fSuc || f.sucursal === fSuc) && (!fCor || f.corredor?.id === fCor) && (!fPer || f.periodicidad === fPer) && (!fSit || f.situacion === fSit)
      && (!q || f.c.nombre.toLowerCase().includes(q) || (f.corredor?.nombre ?? '').toLowerCase().includes(q) || (f.c.header?.cif ?? '').toLowerCase().includes(q) || f.docs.some(d => d.numero.toLowerCase().includes(q))));
  }, [filas, busca, fSuc, fCor, fPer, fSit]);

  const kpi = useMemo(() => {
    const docs = visibles.flatMap(f => f.docs);
    return {
      flotas: visibles.length, vehiculos: visibles.reduce((a, f) => a + (f.c.vehiculosCount ?? 0), 0),
      importe: docs.reduce((a, d) => a + d.importe, 0), comision: docs.reduce((a, d) => a + d.comision, 0), liquido: docs.reduce((a, d) => a + d.liquido, 0),
      recibos: docs.length, emisiones: docs.filter(d => d.serie === 'RC').length, regularizaciones: docs.filter(d => d.serie === 'RW').length,
      pendientes: visibles.filter(f => f.situacion === 'pendiente').length, sinDatos: visibles.filter(f => f.situacion === 'sin_datos').length,
      facturadas: visibles.filter(f => f.situacion === 'facturada').length,
    };
  }, [visibles]);

  // Gráficos: flotas por sucursal (con su situación) y corredores con más flotas / facturación
  const porSucursal = useMemo(() => {
    const m = new Map<string, Record<Situacion, number> & { importe: number }>();
    for (const f of visibles) {
      const k = f.sucursal || 'SIN';
      const x = m.get(k) ?? { sin_datos: 0, pendiente: 0, facturada: 0, importe: 0 };
      x[f.situacion]++; x.importe += f.importe; m.set(k, x);
    }
    return [...m.entries()].map(([k, x]) => ({ k, nombre: SUC[k] ?? 'Sin sucursal', total: x.sin_datos + x.pendiente + x.facturada, ...x })).sort((a, b) => b.total - a.total);
  }, [visibles]);
  const porCorredor = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; n: number; importe: number }>();
    for (const f of visibles) {
      const id = f.corredor?.id ?? ''; const x = m.get(id) ?? { id, nombre: f.corredor?.nombre ?? 'Sin corredor', n: 0, importe: 0 };
      x.n++; x.importe += f.importe; m.set(id, x);
    }
    return [...m.values()].sort((a, b) => b.importe - a.importe || b.n - a.n).slice(0, 6);
  }, [visibles]);
  const maxSuc = Math.max(1, ...porSucursal.map(s => s.total));
  const maxCor = Math.max(1, ...porCorredor.map(c => (kpi.importe > 0 ? c.importe : c.n)));

  const corredoresConFlota = useMemo(() => {
    const ids = new Set(filas.map(f => f.corredor?.id).filter(Boolean));
    return corredores.filter(c => ids.has(c.id) && (!fSuc || c.sucursal === fSuc)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas, corredores, fSuc]);
  const hayFiltros = !!(fSuc || fCor || fPer || fSit || busca.trim());
  const limpiar = () => { setFSuc(''); setFCor(''); setFPer(''); setFSit(''); setBusca(''); };

  const flota = useMemo(() => carpetas.find(c => c.id === flotaId) ?? null, [carpetas, flotaId]);

  return (
    <div className="pg fa">
      {!flota && (
        <section className="intro" style={{ marginTop: 0, paddingTop: 0 }}>
          <div>
            <h1>Facturación</h1>
            <p>Recibos de cobro de las flotas contratadas. Abre una flota para facturarla.</p>
          </div>
        </section>
      )}

      {flota ? (
        <FlotaFacturacion key={flota.id} flota={flota} corredor={corredores.find(c => c.id === flota.corredor_id) ?? null} usuario={usuario}
          onVolver={() => { setFlotaId(''); cargarResumen(); }} avisar={avisar} onCambio={cargarResumen} />
      ) : (
        <>
          <div className={`kpis${cargando && filas.length === 0 ? ' is-loading' : ''}`}>
            <button type="button" className="kpi" onClick={() => setFSit('')}><span className="l">Flotas contratadas</span><span className="v">{nf(kpi.flotas)}</span><span className="n">{nf(kpi.vehiculos)} vehículos{hayFiltros ? ' · con los filtros puestos' : ''}</span></button>
            <button type="button" className="kpi" onClick={() => setFSit('facturada')}><span className="l">Facturado</span><span className="v mny">{eur(kpi.importe)}</span><span className="n"><b>{nf(kpi.facturadas)}</b> {kpi.facturadas === 1 ? 'flota' : 'flotas'} · {nf(kpi.emisiones)} emisiones y {nf(kpi.regularizaciones)} regularizaciones</span></button>
            <button type="button" className="kpi" onClick={() => setFSit('facturada')}><span className="l">Comisiones</span><span className="v mny">{eur(kpi.comision)}</span><span className="n">Líquido a abonar {eur(kpi.liquido)}</span></button>
            <button type="button" className="kpi" onClick={() => setFSit('pendiente')}><span className="l">Sin facturar</span><span className="v">{nf(kpi.pendientes)}</span><span className="n">Con los datos listos y sin ningún recibo</span></button>
            <button type="button" className="kpi" onClick={() => setFSit('sin_datos')}><span className="l">Faltan datos</span><span className="v">{nf(kpi.sinDatos)}</span><span className="n">Sin ciclo, periodicidad o datos del corredor</span></button>
          </div>

          <div className="grid2">
            <section>
              <div className="shead"><h2>Flotas por sucursal</h2><p className="sub-desc">Cuántas están facturadas, pendientes o sin datos. Pulsa una barra para filtrar.</p></div>
              <div className="legend">{(Object.keys(SITUACION) as Situacion[]).map(s => <span key={s}><span className="sq" style={{ background: SITUACION[s].color }} />{SITUACION[s].nombre}</span>)}</div>
              <div className="bars">
                {porSucursal.map(s => (
                  <button type="button" className="bar" key={s.k} onClick={() => setFSuc(fSuc === s.k || s.k === 'SIN' ? '' : s.k)} aria-pressed={fSuc === s.k}>
                    <span className="bn">{s.nombre}</span>
                    <span className="bt"><span className="bk" style={{ width: `${(s.total / maxSuc) * 100}%` }}>
                      {(Object.keys(SITUACION) as Situacion[]).filter(k => s[k] > 0).map(k => <span key={k} style={{ flex: s[k], background: SITUACION[k].color }} />)}
                    </span></span>
                    <span className="bv">{nf(s.total)}</span>
                  </button>
                ))}
                {porSucursal.length === 0 && <div className="empty">Sin flotas que mostrar.</div>}
              </div>
            </section>
            <section>
              <div className="shead"><h2>Corredores</h2><p className="sub-desc">{kpi.importe > 0 ? 'Los que más facturan.' : 'Los que tienen más flotas contratadas.'} Pulsa uno para filtrar.</p></div>
              <div className="bars fa-cor">
                {porCorredor.map(c => (
                  <button type="button" className="bar" key={c.id || 'sin'} onClick={() => setFCor(fCor === c.id ? '' : c.id)} aria-pressed={!!c.id && fCor === c.id} disabled={!c.id}>
                    <span className="bn" title={c.nombre}>{c.nombre}</span>
                    <span className="bt"><span className="bk" style={{ width: `${((kpi.importe > 0 ? c.importe : c.n) / maxCor) * 100}%` }}><span style={{ flex: 1, background: 'var(--blue)' }} /></span></span>
                    <span className="bv">{kpi.importe > 0 ? eur(c.importe) : nf(c.n)}</span>
                  </button>
                ))}
                {porCorredor.length === 0 && <div className="empty">Sin corredores que mostrar.</div>}
              </div>
            </section>
          </div>

          <section className="dir">
            <div className="dirhead">
              <div><h2>Flotas contratadas</h2><p className="sub-desc">{nf(visibles.length)} de {nf(filas.length)}{hayFiltros ? ' con los filtros puestos' : ''}. Pulsa una flota para facturarla.</p></div>
              <input className="search" placeholder="Buscar por flota, corredor, CIF o número de recibo…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar flota" />
              <div className="actions">
                <button type="button" className="mini" aria-pressed={verFiltros} onClick={() => setVerFiltros(v => !v)}>{verFiltros ? 'Ocultar filtros' : 'Filtros'}</button>
                {hayFiltros && <button type="button" className="mini" onClick={limpiar}>Limpiar</button>}
              </div>
            </div>
            <div className={`fa-cols${verFiltros ? '' : ' solo'}`}>
              {verFiltros && (
                <aside className="fa-side" aria-label="Filtros">
                  <div className="fld">
                    <label id="ff-suc">Sucursal</label>
                    <div className="fa-opts" role="radiogroup" aria-labelledby="ff-suc">
                      {[['', 'Todas'], ['TITAN', 'Titán'], ['MEDIACION', 'Mediación']].map(([v, n]) => <button key={v} type="button" role="radio" aria-checked={fSuc === v} className={fSuc === v ? 'on' : ''} onClick={() => { setFSuc(v); setFCor(''); }}>{n}</button>)}
                    </div>
                  </div>
                  <div className="fld">
                    <label htmlFor="ff-cor">Corredor</label>
                    <select id="ff-cor" className="select" value={fCor} onChange={e => setFCor(e.target.value)}>
                      <option value="">Todos</option>
                      {corredoresConFlota.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div className="fld">
                    <label htmlFor="ff-per">Periodicidad</label>
                    <select id="ff-per" className="select" value={fPer} onChange={e => setFPer(e.target.value)}>
                      <option value="">Todas</option>
                      {PERIODICIDADES.map(p => <option key={p} value={p}>{NOMBRE_PERIODICIDAD[MESES_PERIODICIDAD[p]]}</option>)}
                    </select>
                  </div>
                  <div className="fld">
                    <label id="ff-sit">Situación</label>
                    <div className="fa-opts col" role="radiogroup" aria-labelledby="ff-sit">
                      <button type="button" role="radio" aria-checked={fSit === ''} className={fSit === '' ? 'on' : ''} onClick={() => setFSit('')}>Todas</button>
                      {(Object.keys(SITUACION) as Situacion[]).map(s => <button key={s} type="button" role="radio" aria-checked={fSit === s} className={fSit === s ? 'on' : ''} onClick={() => setFSit(s)}>{SITUACION[s].nombre}</button>)}
                    </div>
                  </div>
                </aside>
              )}
              <div className={`tscroll${cargando && filas.length === 0 ? ' is-loading' : ''}`}>
                <table className="tbl">
                  <thead><tr><th>Flota</th><th className="c-cor">Corredor</th><th className="c-est">Periodicidad</th><th>Situación</th><th className="c-mov">Último recibo</th><th>Facturado</th></tr></thead>
                  <tbody>
                    {visibles.slice(0, mostradas).map(f => (
                      <tr key={f.c.id} tabIndex={0} onClick={() => setFlotaId(f.c.id)} onKeyDown={e => { if (e.key === 'Enter') setFlotaId(f.c.id); }}>
                        <td><b>{f.c.nombre}</b><div className="muted">{f.c.vehiculosCount ? `${nf(f.c.vehiculosCount)} vehículos` : (f.c.header?.cif || '')}</div></td>
                        <td className="c-cor">{f.corredor?.nombre ?? <span className="dim0">Sin corredor</span>}{f.sucursal && <div className="muted">{SUC[f.sucursal] ?? f.sucursal}</div>}</td>
                        <td className="c-est">{NOMBRE_PERIODICIDAD[MESES_PERIODICIDAD[f.periodicidad]] ?? <span className="dim0">—</span>}</td>
                        <td><span className="tag" style={{ ['--c' as string]: SITUACION[f.situacion].color }}>{SITUACION[f.situacion].nombre}</span></td>
                        <td className="c-mov">{f.ultimo ? <><span className="mono">{f.ultimo.numero}</span><div className="muted">{fechaCorta(f.ultimo.creado_en)} · {f.ultimo.serie === 'RC' ? 'Emisión' : 'Regularización'}</div></> : <span className="dim0">—</span>}</td>
                        <td>{f.docs.length > 0 ? <><b>{eur2(f.importe)}</b><div className="muted">{nf(f.docs.length)} {f.docs.length === 1 ? 'recibo' : 'recibos'}</div></> : <span className="dim0">—</span>}</td>
                      </tr>
                    ))}
                    {cargando && filas.length === 0 && [0, 1, 2, 3].map(i => <tr key={i}><td>Cargando</td><td>Cargando</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>)}
                  </tbody>
                </table>
                {!cargando && visibles.length === 0 && <div className="empty">{filas.length === 0 ? 'Todavía no hay flotas contratadas.' : 'Ninguna flota coincide con la búsqueda o los filtros.'}</div>}
                {visibles.length > mostradas && <div className="more"><button type="button" onClick={() => setMostradas(m => m + 50)}>Ver más ({nf(visibles.length - mostradas)} restantes)</button></div>}
              </div>
            </div>
          </section>
        </>
      )}

      <div className={`fl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
