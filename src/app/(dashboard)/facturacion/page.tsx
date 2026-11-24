'use client';

// ─── FACTURACIÓN DE FLOTAS ───────────────────────────────────────────────────
// Portada: las flotas contratadas con sus indicadores, filtros laterales, buscador y tabla ordenable. Al abrir
// una flota se factura esa flota (FlotaFacturacion). Las reglas viven en core/flotas/facturacion.ts; el histórico
// y el control de doble facturación, en orion-api.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cargarCarpetasDelServidor, cargarCorredoresDelServidor, leerCarpetasDeSessionStorage, leerCorredoresDeSessionStorage,
  type Corredor, type FlotaCarpeta,
} from '@/core/flotas';
import { MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD } from '@/core/flotas/facturacion';
import { eur, eur2, nf } from '@/lib/fmt';
import FlotaFacturacion, { configInicial, faltaCorta } from './FlotaFacturacion';
import type { ConfigFacturacion } from './generar';

interface DocResumen { id: string; serie: 'RC' | 'RW'; numero: string; recibos: number; importe: number; comision: number; liquido: number; texto_periodo: string; creado_en: string }
interface ResumenFlota { config: ConfigFacturacion | null; documentos: DocResumen[] }
type Situacion = 'sin_datos' | 'pendiente' | 'facturada';
type Columna = 'n' | 'cor' | 'suc' | 'per' | 'sit' | 'ult' | 'rec' | 'fac';

const SUC: Record<string, string> = { TITAN: 'Titán', MEDIACION: 'Mediación' };
const SITS: Situacion[] = ['facturada', 'pendiente', 'sin_datos'];
const SITUACION: Record<Situacion, { nombre: string; color: string; orden: number }> = {
  sin_datos: { nombre: 'Faltan datos', color: 'var(--warn)', orden: 0 },
  pendiente: { nombre: 'Sin facturar', color: 'var(--blue)', orden: 1 },
  facturada: { nombre: 'Facturada', color: 'var(--ok)', orden: 2 },
};
const COLS: Array<{ k: Columna; t: string; w: number; r?: boolean }> = [
  { k: 'n', t: 'Flota', w: 26 }, { k: 'cor', t: 'Corredor', w: 20 }, { k: 'suc', t: 'Sucursal', w: 9 }, { k: 'per', t: 'Periodicidad', w: 11 },
  { k: 'sit', t: 'Situación', w: 14 }, { k: 'ult', t: 'Último recibo', w: 15 }, { k: 'rec', t: 'Recibos', w: 7, r: true }, { k: 'fac', t: 'Facturado', w: 13, r: true },
];
const PAGINA = 25;
const fechaCorta = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Fila {
  c: FlotaCarpeta; corredor: Corredor | null; sucursal: string; meses: number; situacion: Situacion; faltan: string[];
  docs: DocResumen[]; importe: number; recibos: number; ultimo: DocResumen | null;
}

export default function FacturacionPage() {
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [resumen, setResumen] = useState<Record<string, ResumenFlota>>({});
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [flotaId, setFlotaId] = useState('');
  const [hoy, setHoy] = useState<Date | null>(null);

  const [busca, setBusca] = useState('');
  const [fSuc, setFSuc] = useState('');
  const [fCor, setFCor] = useState('');
  const [fSit, setFSit] = useState<Set<Situacion>>(new Set());
  const [fPer, setFPer] = useState<Set<number>>(new Set());
  const [verFiltros, setVerFiltros] = useState(true);
  const [ocultas, setOcultas] = useState<Set<Columna>>(new Set());
  const [orden, setOrden] = useState<{ k: Columna; d: 1 | -1 }>({ k: 'sit', d: 1 });
  const [pagina, setPagina] = useState(1);
  const [menu, setMenu] = useState<'' | 'cols' | 'xls'>('');
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const avisar = useCallback((t: string) => { setToast(t); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(''), 3600); }, []);

  const cargarResumen = useCallback(() => {
    fetch('/api/facturacion/resumen').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.flotas) setResumen(d.flotas); }).catch(() => {});
  }, []);

  useEffect(() => {
    // Arranque instantáneo con lo último que se cargó en esta sesión; el servidor lo sustituye enseguida
    /* eslint-disable react-hooks/set-state-in-effect */
    const c = leerCarpetasDeSessionStorage(true); if (c) setCarpetas(c);
    const b = leerCorredoresDeSessionStorage(); if (b) setCorredores(b);
    setHoy(new Date());
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

  // «/» lleva al buscador; un clic fuera cierra los menús
  useEffect(() => {
    if (flotaId) return;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) { e.preventDefault(); buscaRef.current?.focus(); }
      if (e.key === 'Escape') setMenu('');
    };
    const clic = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.fa-pop')) setMenu(''); };
    window.addEventListener('keydown', tecla); window.addEventListener('click', clic);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('click', clic); };
  }, [flotaId]);

  const filas = useMemo((): Fila[] => {
    const porId = new Map(corredores.map(c => [c.id, c]));
    return carpetas.filter(c => c.estado === 'CONTRATADA').map(c => {
      const corredor = porId.get(c.corredor_id ?? '') ?? null;
      const r = resumen[c.id];
      const docs = r?.documentos ?? [];
      const cfg = r?.config && r.config.corredor ? r.config : configInicial(c, corredor);
      const faltan = faltaCorta(cfg);
      return {
        c, corredor, sucursal: corredor?.sucursal ?? '', meses: MESES_PERIODICIDAD[cfg.periodicidad] ?? 0, faltan,
        situacion: (faltan.length > 0 ? 'sin_datos' : docs.length > 0 ? 'facturada' : 'pendiente') as Situacion,
        docs, importe: docs.reduce((a, d) => a + d.importe, 0), recibos: docs.reduce((a, d) => a + d.recibos, 0), ultimo: docs[0] ?? null,
      };
    });
  }, [carpetas, corredores, resumen]);

  /** Todos los filtros menos el que se indique (para los contadores de cada casilla). */
  const pasa = useCallback((f: Fila, sin?: 'sit' | 'per') => {
    if (fSuc && f.sucursal !== fSuc) return false;
    if (fCor && (fCor === '__sin' ? !!f.corredor : f.corredor?.id !== fCor)) return false;
    if (sin !== 'per' && fPer.size > 0 && !fPer.has(f.meses)) return false;
    if (sin !== 'sit' && fSit.size > 0 && !fSit.has(f.situacion)) return false;
    const q = plano(busca.trim());
    if (q && !plano(`${f.c.nombre} ${f.c.header?.cif ?? ''} ${f.corredor?.nombre ?? ''} ${f.corredor?.codigo ?? ''} ${f.docs.map(d => d.numero).join(' ')}`).includes(q)) return false;
    return true;
  }, [fSuc, fCor, fPer, fSit, busca]);

  const visibles = useMemo(() => {
    const valor = (f: Fila): string | number => {
      switch (orden.k) {
        case 'n': return plano(f.c.nombre);
        case 'cor': return plano(f.corredor?.nombre ?? '');
        case 'suc': return f.sucursal;
        case 'per': return f.meses;
        case 'sit': return SITUACION[f.situacion].orden;
        case 'ult': return f.ultimo?.creado_en ?? '';
        case 'rec': return f.recibos;
        default: return f.importe;
      }
    };
    return filas.filter(f => pasa(f)).sort((a, b) => { const x = valor(a), y = valor(b); return x < y ? -orden.d : x > y ? orden.d : plano(a.c.nombre) < plano(b.c.nombre) ? -1 : 1; });
  }, [filas, pasa, orden]);

  const anio = hoy ? String(hoy.getFullYear()) : '';
  const kpi = useMemo(() => {
    const cnt: Record<Situacion, number> = { facturada: 0, pendiente: 0, sin_datos: 0 };
    let veh = 0, fact = 0, com = 0, liq = 0, rec = 0; const falta = new Map<string, number>();
    for (const f of visibles) {
      cnt[f.situacion]++; veh += f.c.vehiculosCount ?? 0;
      for (const d of f.docs) if (!anio || d.creado_en.slice(0, 4) === anio) { fact += d.importe; com += d.comision; liq += d.liquido; rec += d.recibos; }
      for (const x of f.faltan) falta.set(x, (falta.get(x) ?? 0) + 1);
    }
    const masHabitual = [...falta.entries()].sort((a, b) => b[1] - a[1])[0];
    return { n: visibles.length, cnt, veh, fact, com, liq, rec, conDatos: cnt.facturada + cnt.pendiente, masHabitual };
  }, [visibles, anio]);

  const cuentaSit = useMemo(() => { const c: Record<Situacion, number> = { facturada: 0, pendiente: 0, sin_datos: 0 }; for (const f of filas) if (pasa(f, 'sit')) c[f.situacion]++; return c; }, [filas, pasa]);
  const periodicidades = useMemo(() => {
    const hay = new Set(filas.map(f => f.meses).filter(Boolean));
    return [1, 2, 3, 4, 6, 12].filter(m => hay.has(m)).map(m => ({ m, n: filas.filter(f => f.meses === m && pasa(f, 'per')).length }));
  }, [filas, pasa]);
  const corredoresConFlota = useMemo(() => {
    const ids = new Set(filas.map(f => f.corredor?.id).filter(Boolean));
    return corredores.filter(c => ids.has(c.id) && (!fSuc || c.sucursal === fSuc)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [filas, corredores, fSuc]);

  const chips = useMemo(() => {
    const c: Array<{ k: string; t: string; quitar: () => void }> = [];
    if (fSuc) c.push({ k: 'suc', t: SUC[fSuc] ?? fSuc, quitar: () => setFSuc('') });
    if (fCor) c.push({ k: 'cor', t: fCor === '__sin' ? 'Sin corredor' : corredores.find(x => x.id === fCor)?.nombre ?? 'Corredor', quitar: () => setFCor('') });
    for (const s of fSit) c.push({ k: 's' + s, t: SITUACION[s].nombre, quitar: () => setFSit(p => { const n = new Set(p); n.delete(s); return n; }) });
    for (const m of fPer) c.push({ k: 'p' + m, t: NOMBRE_PERIODICIDAD[m], quitar: () => setFPer(p => { const n = new Set(p); n.delete(m); return n; }) });
    if (busca.trim()) c.push({ k: 'q', t: `«${busca.trim()}»`, quitar: () => setBusca('') });
    return c;
  }, [fSuc, fCor, fSit, fPer, busca, corredores]);
  const limpiar = () => { setFSuc(''); setFCor(''); setFSit(new Set()); setFPer(new Set()); setBusca(''); setPagina(1); };
  const cambiar = (fn: () => void) => { fn(); setPagina(1); };
  const alternar = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  const cols = COLS.filter(c => !ocultas.has(c.k));
  const ancho = cols.reduce((a, c) => a + c.w, 0);
  const paginas = Math.max(1, Math.ceil(visibles.length / PAGINA));
  const pag = Math.min(pagina, paginas);
  const enPagina = visibles.slice((pag - 1) * PAGINA, pag * PAGINA);
  const botonesPagina = [...new Set([1, paginas, pag, pag - 1, pag + 1, pag - 2, pag + 2])].filter(p => p >= 1 && p <= paginas).sort((a, b) => a - b);

  const exportar = async (todas: boolean) => {
    setMenu('');
    try {
      const lista = todas ? [...filas].sort((a, b) => a.c.nombre.localeCompare(b.c.nombre)) : visibles;
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Flotas');
      const cab = ws.addRow(['FLOTA', 'CIF', 'VEHÍCULOS', 'CORREDOR', 'SUCURSAL', 'PERIODICIDAD', 'SITUACIÓN', 'FALTA', 'ÚLTIMO RECIBO', 'FECHA', 'RECIBOS', 'FACTURADO']);
      cab.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } }; });
      for (const f of lista) {
        const r = ws.addRow([f.c.nombre, f.c.header?.cif ?? '', f.c.vehiculosCount ?? 0, f.corredor?.nombre ?? '', SUC[f.sucursal] ?? '', NOMBRE_PERIODICIDAD[f.meses] ?? '', SITUACION[f.situacion].nombre, f.faltan.join(', '), f.ultimo?.numero ?? '', f.ultimo ? fechaCorta(f.ultimo.creado_en) : '', f.recibos, Math.round(f.importe * 100) / 100]);
        r.getCell(12).numFmt = '#,##0.00';
      }
      [36, 14, 11, 40, 12, 14, 14, 30, 16, 12, 10, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      const { saveAs } = await import('file-saver');
      saveAs(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `FACTURACION FLOTAS ${(hoy ?? new Date()).toISOString().slice(0, 10)}.xlsx`);
    } catch { avisar('No se pudo preparar el Excel.'); }
  };

  const flota = useMemo(() => carpetas.find(c => c.id === flotaId) ?? null, [carpetas, flotaId]);
  const cargandoVacio = cargando && filas.length === 0;
  const etiquetaOrden = COLS.find(c => c.k === orden.k)?.t.toLowerCase() ?? '';

  const celda = (f: Fila, k: Columna) => {
    switch (k) {
      case 'n': return <td key={k} className="n5"><span className="nm" title={f.c.nombre}>{f.c.nombre}</span><div className="sub6">{f.c.vehiculosCount ? `${nf(f.c.vehiculosCount)} vehículos` : 'Sin vehículos cargados'}{f.c.header?.cif ? <> · <span className="fa-mono">{f.c.header.cif}</span></> : null}</div></td>;
      case 'cor': return <td key={k}><span title={f.corredor?.nombre}>{f.corredor?.nombre ?? <span className="qt">Sin corredor</span>}</span>{f.corredor?.codigo ? <div className="sub6"><span className="fa-mono">{f.corredor.codigo}</span></div> : null}</td>;
      case 'suc': return <td key={k}>{f.sucursal ? <span className={`fa-chp${f.sucursal === 'MEDIACION' ? ' mm' : ''}`}>{f.sucursal === 'TITAN' ? 'TITÁN' : 'MED'}</span> : <span className="qt">—</span>}</td>;
      case 'per': return <td key={k}>{NOMBRE_PERIODICIDAD[f.meses] ?? <span className="qt">—</span>}</td>;
      case 'sit': return <td key={k}><span className="tag" style={{ ['--c' as string]: SITUACION[f.situacion].color }}>{SITUACION[f.situacion].nombre}</span>{f.situacion === 'sin_datos' && <div className="sub6" title={`Falta: ${f.faltan.join(', ')}`}><span className="miss">Falta: {f.faltan[0].replace(' del corredor', ' corredor').replace(' del tomador', ' tomador')}{f.faltan.length > 1 ? ` +${f.faltan.length - 1}` : ''}</span></div>}</td>;
      case 'ult': return <td key={k}>{f.ultimo ? <><span className="fa-mono">{f.ultimo.numero}</span><div className="sub6">{fechaCorta(f.ultimo.creado_en)} · {f.ultimo.serie === 'RC' ? 'Emisión' : 'Regularización'}</div></> : <span className="qt">—</span>}</td>;
      case 'rec': return <td key={k} className="r5">{f.docs.length > 0 ? nf(f.recibos) : <span className="qt">—</span>}</td>;
      default: return <td key={k} className="r5">{f.docs.length > 0 ? eur2(f.importe) : <span className="qt">—</span>}</td>;
    }
  };

  return (
    <div className="pg fa">
      {flota ? (
        <FlotaFacturacion key={flota.id} flota={flota} corredor={corredores.find(c => c.id === flota.corredor_id) ?? null} usuario={usuario}
          onVolver={() => { setFlotaId(''); cargarResumen(); }} avisar={avisar} onCambio={cargarResumen} />
      ) : (
        <>
          <section className="intro" style={{ marginTop: 0, paddingTop: 0 }}>
            <div>
              <h1>Facturación</h1>
              <p className="fa-hoy">{hoy ? hoy.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase()) : ' '}</p>
            </div>
          </section>

          <div className={`kpis k4${cargandoVacio ? ' is-loading' : ''}`} aria-label="Indicadores principales">
            <button type="button" className="kpi" title="Quita los filtros y muestra todas las flotas" onClick={limpiar}>
              <span className="l">Flotas contratadas</span><span className="v">{nf(kpi.n)}</span>
              <span className="n"><b>{nf(kpi.veh)}</b> vehículos asegurados</span>
            </button>
            <button type="button" className="kpi" title="Ordena el listado por importe facturado" onClick={() => cambiar(() => setOrden({ k: 'fac', d: -1 }))}>
              <span className="l">Facturado {anio}</span><span className="v mny">{eur(kpi.fact)}</span>
              <span className="n"><b>{nf(kpi.rec)}</b> recibos emitidos</span>
              <span className="fa-kfoot">Comisión {eur(kpi.com)} · líquido {eur(kpi.liq)}</span>
            </button>
            <button type="button" className="kpi" title="Filtra las flotas con datos completos y sin ningún recibo" onClick={() => cambiar(() => setFSit(new Set<Situacion>(['pendiente'])))}>
              <span className="l">Sin facturar</span><span className="v">{nf(kpi.cnt.pendiente)}</span>
              <span className="n"><b>{nf(kpi.cnt.pendiente)}</b> de {nf(kpi.conDatos)} con datos completos</span>
              <span className="fa-kbar" role="img" aria-label="Proporción facturada"><i style={{ width: `${kpi.conDatos ? Math.round((kpi.cnt.facturada / kpi.conDatos) * 100) : 0}%` }} /></span>
            </button>
            <button type="button" className={`kpi${kpi.cnt.sin_datos > 0 ? ' warn' : ''}`} title="Filtra las flotas a las que les falta algún dato de facturación" onClick={() => cambiar(() => setFSit(new Set<Situacion>(['sin_datos'])))}>
              <span className="l">Faltan datos</span><span className="v">{nf(kpi.cnt.sin_datos)}</span>
              <span className="n">{kpi.cnt.sin_datos > 0 ? 'no se pueden facturar' : 'cartera completa'}</span>
              <span className="fa-kfoot">{kpi.masHabitual ? `Lo más habitual: ${kpi.masHabitual[0]} (${nf(kpi.masHabitual[1])})` : 'Sin incidencias'}</span>
            </button>
          </div>

          <div className={`fa-fl6${verFiltros ? '' : ' nof'}`}>
            {verFiltros && (
              <aside className="fa-side" aria-label="Filtros">
                <div className="sg">
                  <span className="fl" id="ff-suc">Sucursal</span>
                  <div className="fa-rad" role="radiogroup" aria-labelledby="ff-suc">
                    {[['', 'Todas'], ['TITAN', 'Titán'], ['MEDIACION', 'Mediación']].map(([v, n]) => <button key={v} type="button" role="radio" aria-checked={fSuc === v} className={fSuc === v ? 'on' : ''} onClick={() => cambiar(() => { setFSuc(v); setFCor(''); })}><i />{n}</button>)}
                  </div>
                </div>
                <div className="sg">
                  <label className="fl" htmlFor="ff-cor">Corredor</label>
                  <select id="ff-cor" className="select" value={fCor} onChange={e => cambiar(() => setFCor(e.target.value))}>
                    <option value="">Todos los corredores</option>
                    <option value="__sin">Sin corredor</option>
                    {(['TITAN', 'MEDIACION', ''] as const).map(s => {
                      const l = corredoresConFlota.filter(c => (c.sucursal ?? '') === s);
                      return l.length > 0 ? <optgroup key={s || 'x'} label={s ? SUC[s].toUpperCase() : 'SIN SUCURSAL'}>{l.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</optgroup> : null;
                    })}
                  </select>
                </div>
                <div className="sg">
                  <span className="fl" id="ff-sit">Situación</span>
                  <div className="fa-chk" role="group" aria-labelledby="ff-sit">
                    {SITS.map(s => <button key={s} type="button" role="checkbox" aria-checked={fSit.has(s)} className={fSit.has(s) ? 'on' : ''} style={{ ['--c' as string]: SITUACION[s].color }} onClick={() => cambiar(() => setFSit(alternar(fSit, s)))}><u /><span>{SITUACION[s].nombre}</span><em>{nf(cuentaSit[s])}</em></button>)}
                  </div>
                </div>
                {periodicidades.length > 0 && (
                  <div className="sg">
                    <span className="fl" id="ff-per">Periodicidad</span>
                    <div className="fa-chk" role="group" aria-labelledby="ff-per">
                      {periodicidades.map(({ m, n }) => <button key={m} type="button" role="checkbox" aria-checked={fPer.has(m)} className={fPer.has(m) ? 'on' : ''} style={{ ['--c' as string]: 'var(--blue)' }} onClick={() => cambiar(() => setFPer(alternar(fPer, m)))}><u /><span>{NOMBRE_PERIODICIDAD[m]}</span><em>{nf(n)}</em></button>)}
                    </div>
                  </div>
                )}
                {chips.length > 0 && <div className="sg"><button type="button" className="fa-reset" onClick={limpiar}>Limpiar filtros</button></div>}
              </aside>
            )}

            <section className="fa-main6" aria-labelledby="fa-dir">
              <div className="fa-actbar">
                <div className="fa-sbox">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                  <input ref={buscaRef} type="search" autoComplete="off" placeholder="Buscar flota, CIF, corredor o nº de recibo…" aria-label="Buscar" value={busca} onChange={e => cambiar(() => setBusca(e.target.value))} />
                  <kbd>/</kbd>
                </div>
                <button type="button" className="mini" aria-pressed={verFiltros} title="Mostrar u ocultar filtros" onClick={() => setVerFiltros(v => !v)}>Filtros</button>
                <div className="fa-pop">
                  <button type="button" className="mini" aria-haspopup="true" aria-expanded={menu === 'cols'} onClick={() => setMenu(menu === 'cols' ? '' : 'cols')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" /></svg> Columnas
                  </button>
                  {menu === 'cols' && (
                    <div className="fa-menu">
                      {COLS.map(c => <label key={c.k}><input type="checkbox" checked={!ocultas.has(c.k)} disabled={c.k === 'n'} onChange={() => setOcultas(alternar(ocultas, c.k))} />{c.t}</label>)}
                    </div>
                  )}
                </div>
                <div className="fa-pop">
                  <button type="button" className="mini" aria-haspopup="true" aria-expanded={menu === 'xls'} onClick={() => setMenu(menu === 'xls' ? '' : 'xls')}>Exportar Excel ▾</button>
                  {menu === 'xls' && (
                    <div className="fa-menu">
                      <button type="button" onClick={() => exportar(false)}>Listado filtrado</button>
                      <button type="button" onClick={() => exportar(true)}>Todas las flotas</button>
                    </div>
                  )}
                </div>
              </div>
              {chips.length > 0 && (
                <div className="fa-fchips">
                  {chips.map(c => <span className="fchip" key={c.k}>{c.t}<button type="button" aria-label={`Quitar filtro ${c.t}`} onClick={() => cambiar(c.quitar)}>×</button></span>)}
                  {chips.length > 1 && <button type="button" className="clr" onClick={limpiar}>Limpiar todo</button>}
                </div>
              )}
              <div className="fa-dirhead">
                <h2 id="fa-dir">Flotas contratadas</h2>
                <p className="sub-desc">{visibles.length < filas.length ? `${nf(visibles.length)} de ${nf(filas.length)}` : nf(visibles.length)} flotas · por {etiquetaOrden} {orden.d < 0 ? '↓' : '↑'}</p>
              </div>

              <div className={`tscroll${cargandoVacio ? ' is-loading' : ''}`}>
                {visibles.length === 0 && !cargandoVacio ? (
                  <div className="fa-empty">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--quiet)" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <p>{filas.length === 0 ? 'Todavía no hay flotas contratadas.' : 'Sin resultados para los filtros actuales.'}</p>
                    {filas.length > 0 && <button type="button" className="mini" onClick={limpiar}>Limpiar filtros</button>}
                  </div>
                ) : (
                  <table className="tbl fa-t6">
                    <colgroup>{cols.map(c => <col key={c.k} style={{ width: `${((c.w / ancho) * 100).toFixed(2)}%` }} />)}</colgroup>
                    <thead><tr>{cols.map(c => (
                      <th key={c.k} className={c.r ? 'r5' : ''} aria-sort={orden.k === c.k ? (orden.d > 0 ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className={`th${orden.k === c.k ? ' on' : ''}`} onClick={() => cambiar(() => setOrden(o => ({ k: c.k, d: o.k === c.k ? (o.d > 0 ? -1 : 1) : (c.r ? -1 : 1) })))}>{c.t}<i className="ar">{orden.k === c.k ? (orden.d > 0 ? '▲' : '▼') : '▲'}</i></button>
                      </th>
                    ))}</tr></thead>
                    <tbody>
                      {enPagina.map((f, i) => (
                        <tr key={f.c.id} tabIndex={0} style={{ ['--i' as string]: i }} onClick={() => setFlotaId(f.c.id)} onKeyDown={e => { if (e.key === 'Enter') setFlotaId(f.c.id); }}>
                          {cols.map(c => celda(f, c.k))}
                        </tr>
                      ))}
                      {cargandoVacio && [0, 1, 2, 3, 4].map(i => <tr key={i}>{cols.map(c => <td key={c.k}>Cargando</td>)}</tr>)}
                    </tbody>
                  </table>
                )}
              </div>
              {visibles.length > 0 && (
                <div className="fa-pager">
                  <span>Mostrando {nf((pag - 1) * PAGINA + 1)}–{nf(Math.min(visibles.length, pag * PAGINA))} de {nf(visibles.length)}</span>
                  {paginas > 1 && (
                    <div className="pp">
                      <button type="button" disabled={pag === 1} aria-label="Anterior" onClick={() => setPagina(pag - 1)}>‹</button>
                      {botonesPagina.map((p, i) => <span key={p} style={{ display: 'contents' }}>{i > 0 && p - botonesPagina[i - 1] > 1 && <span className="ell">…</span>}<button type="button" className={p === pag ? 'on' : ''} aria-label={`Página ${p}`} aria-current={p === pag ? 'page' : undefined} onClick={() => setPagina(p)}>{p}</button></span>)}
                      <button type="button" disabled={pag === paginas} aria-label="Siguiente" onClick={() => setPagina(pag + 1)}>›</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <div className={`fl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
