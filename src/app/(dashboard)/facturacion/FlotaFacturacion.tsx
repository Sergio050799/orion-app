'use client';

// Facturación de UNA flota: datos de facturación, una operación cada vez (emisión o regularización) con su
// Excel de MMT, revisión, generación de la carpeta ORIGINAL / TRABAJO / ENVIAR e histórico.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import type { Corredor, FlotaCarpeta } from '@/core/flotas';
import {
  avisosDeFechas, comprobarImportes, conComision, diaDe, esDe, fechaDocumento, fraccionDe, fraccionQueContiene, fraccionesDelCiclo,
  inicioCicloDe, isoDe, leerRecibos, moverMeses, nombreFraccion, numeroRecibo, resumir, textoPeriodo, tomadorDe,
  MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD,
  type Fraccion, type LecturaRecibos, type LineaRecibo, type Serie, type TomadorFacturacion,
} from '@/core/flotas/facturacion';
import { eur2, nf } from '@/lib/fmt';
import { construirZip, inicioDesdeVencimiento, nombreCarpeta, type CambioLinea, type ConfigFacturacion, type DocumentoFactura } from './generar';
import { PanelConfig, PanelLinea, PanelRetirar, pctTxt, uid, type Edicion, type FacturaHist } from './paneles';

const OPERACION: Record<Serie, { nombre: string; corto: string; ayuda: string }> = {
  RC: { nombre: 'Emisión', corto: 'Emisión', ayuda: 'Emisión, renovación o fracción, con sus suplementos. Un recibo con el total.' },
  RW: { nombre: 'Regularización', corto: 'Regularización', ayuda: 'Todo lo que trae el archivo del periodo: altas, suplementos y anulaciones. Un recibo con la suma; lo negativo resta.' },
};
const capital = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const fechaHora = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

interface Subido { file: File; lectura: LecturaRecibos; sha256: string }
interface YaFacturado { recibo: string; numero: string; flota_nombre: string }

async function huella(buf: ArrayBuffer): Promise<string> {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

export function configInicial(c: FlotaCarpeta, corredor: Corredor | null): ConfigFacturacion {
  const tomador = (c.header?.tomador || c.nombre || '').trim();
  return {
    flota: c.nombre,
    inicioCiclo: inicioDesdeVencimiento(c.header?.fechaVencimiento),
    periodicidad: c.header?.periodicidad || corredor?.periodicidad || '',
    corredor: { nombre: corredor?.nombre ?? '', cif: corredor?.cif ?? '', domicilio: corredor?.domicilio ?? '', comision: corredor?.comisionBase ?? 0 },
    tomadores: [{ id: uid(), nombre: tomador, cif: (c.header?.cifTomador || c.header?.cif || '').trim(), alias: [] }],
  };
}

/** Lo que falta en los datos de facturación para poder emitir. */
function faltaEnConfig(cfg: ConfigFacturacion | null): string[] {
  if (!cfg) return ['los datos de facturación'];
  const f: string[] = [];
  if (!diaDe(cfg.inicioCiclo)) f.push('el inicio del ciclo anual');
  if (!MESES_PERIODICIDAD[cfg.periodicidad]) f.push('la periodicidad');
  if (!cfg.corredor.nombre.trim()) f.push('el nombre del corredor');
  if (!cfg.corredor.cif.trim()) f.push('el CIF del corredor');
  if (!cfg.corredor.domicilio.trim()) f.push('el domicilio del corredor');
  if (cfg.tomadores.length === 0) f.push('al menos un tomador');
  for (const t of cfg.tomadores) {
    if (!t.nombre.trim()) f.push('la razón social de un tomador');
    else if (!t.cif.trim()) f.push(`el CIF de ${t.nombre}`);
  }
  return f;
}

type Panel = null | { tipo: 'config' } | { tipo: 'linea'; recibo: string } | { tipo: 'anular' | 'borrar'; factura: FacturaHist };

export default function FlotaFacturacion({ flota, corredor, usuario, onVolver, avisar, onCambio }: {
  flota: FlotaCarpeta; corredor: Corredor | null; usuario: string;
  onVolver: () => void; avisar: (t: string) => void; onCambio: () => void;
}) {
  const [cfg, setCfg] = useState<ConfigFacturacion | null>(null);
  const [cfgGuardada, setCfgGuardada] = useState(false);
  const [historico, setHistorico] = useState<FacturaHist[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorFlota, setErrorFlota] = useState('');

  const [tipo, setTipo] = useState<Serie>('RC');
  const [subido, setSubido] = useState<Subido | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [periodo, setPeriodo] = useState('');                       // primer día de la fracción (ISO)
  const [fechaManual, setFechaManual] = useState<string | null>(null);   // dd/mm/aaaa escrito a mano
  const [textoManual, setTextoManual] = useState<string | null>(null);
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [cambios, setCambios] = useState<CambioLinea[]>([]);
  const [yaFacturados, setYaFacturados] = useState<YaFacturado[]>([]);
  const [revisado, setRevisado] = useState(false);
  const [mostradas, setMostradas] = useState(40);
  const [panel, setPanel] = useState<Panel>(null);
  const [emitiendo, setEmitiendo] = useState('');
  const [errorEmitir, setErrorEmitir] = useState('');
  const [resultado, setResultado] = useState<{ blob: Blob; nombre: string; numero: string } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setErrorFlota('');
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(flota.id)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'No se pudieron leer los datos de facturación.');
      const guardada = d.config && typeof d.config === 'object' ? d.config as ConfigFacturacion : null;
      setCfg(guardada ?? configInicial(flota, corredor));
      setCfgGuardada(!!guardada);
      setHistorico(Array.isArray(d.facturas) ? d.facturas : []);
    } catch (e) {
      setCfg(null); setHistorico([]);
      setErrorFlota(e instanceof Error ? e.message : 'No se pudieron leer los datos de facturación.');
    } finally { setCargando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flota.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardarConfig = async (nueva: ConfigFacturacion): Promise<boolean> => {
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(flota.id)}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: nueva }) });
      if (!res.ok) throw new Error();
      setCfg(nueva); setCfgGuardada(true); onCambio();
      return true;
    } catch { avisar('No se pudieron guardar los datos de facturación.'); return false; }
  };

  const limpiarArchivo = () => { setSubido(null); setErrorArchivo(''); setPeriodo(''); setFechaManual(null); setTextoManual(null); setEdiciones({}); setCambios([]); setYaFacturados([]); setRevisado(false); setMostradas(40); setErrorEmitir(''); };
  const cambiarTipo = (t: Serie) => { if (t === tipo) return; setTipo(t); limpiarArchivo(); setResultado(null); };

  const subir = async (file: File) => {
    setLeyendo(true); setErrorArchivo(''); setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      const lectura = leerRecibos(wb.SheetNames.map(n => ({ nombre: n, filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })));
      if (lectura.lineas.length === 0) { setErrorArchivo(lectura.errores[0] ?? 'El archivo no tiene recibos.'); return; }
      limpiarArchivo();
      setSubido({ file, lectura, sha256: '' });
      huella(buf).then(h => setSubido(p => (p?.file === file ? { ...p, sha256: h } : p)));
    } catch {
      setErrorArchivo('No se ha podido leer el archivo. Comprueba que es el informe de recibos de MMT (.xls o .xlsx).');
    } finally { setLeyendo(false); }
  };

  // ── Cálculo ──
  const meses = MESES_PERIODICIDAD[cfg?.periodicidad ?? ''] ?? 0;
  const ancla = useMemo(() => diaDe(cfg?.inicioCiclo ?? ''), [cfg?.inicioCiclo]);
  const pct = cfg?.corredor.comision ?? 0;

  const lineas = useMemo(() => {
    if (!subido) return [] as LineaRecibo[];
    const vivas: LineaRecibo[] = [];
    for (const l of subido.lectura.lineas) {
      const e = ediciones[l.recibo];
      if (e && 'quitada' in e) continue;
      vivas.push(e ? { ...l, ...e } : l);
    }
    return conComision(vivas, pct);
  }, [subido, ediciones, pct]);

  // Fecha más repetida del archivo: sirve para proponer el periodo
  const fechaModa = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const l of lineas) if (l.fecha) cuenta.set(l.fecha, (cuenta.get(l.fecha) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [lineas]);

  const opciones = useMemo((): Fraccion[] => {
    if (!ancla || !meses) return [];
    const ref = diaDe(fechaModa) ?? (() => { const h = new Date(); return { y: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() }; })();
    const ciclo = inicioCicloDe(ancla, ref);
    return [-12, 0, 12].flatMap(k => fraccionesDelCiclo(moverMeses(ciclo, k), meses));
  }, [ancla, meses, fechaModa]);

  useEffect(() => {
    if (opciones.length === 0 || !subido) return;
    if (periodo && opciones.some(f => f.desde === periodo)) return;
    const d = diaDe(fechaModa);
    setPeriodo((d && ancla ? fraccionQueContiene(ancla, meses, d)?.desde : '') ?? '');
  }, [opciones, fechaModa, periodo, subido, ancla, meses]);

  const fraccion = useMemo(() => (ancla && meses && periodo ? fraccionDe(ancla, meses, diaDe(periodo)!) : null), [ancla, meses, periodo]);
  const fechaAuto = fraccion ? fechaDocumento(tipo, fraccion, subido?.lectura.fechaInforme ?? '') : '';
  const fechaDocIso = fechaManual !== null ? (diaDe(fechaManual) ? isoDe(diaDe(fechaManual)!) : '') : fechaAuto;
  const numero = cfg && fechaDocIso ? numeroRecibo(cfg.corredor.nombre, fechaDocIso) : '';
  const texto = textoManual ?? (fraccion ? textoPeriodo(tipo, meses, fraccion) : '');

  const reparto = useMemo(() => {
    const porTomador = new Map<string, { tomador: TomadorFacturacion; lineas: LineaRecibo[] }>();
    const desconocidos = new Map<string, number>();
    for (const l of lineas) {
      const t = tomadorDe(l.tomador, cfg?.tomadores ?? []);
      if (!t) { desconocidos.set(l.tomador || '(sin tomador)', (desconocidos.get(l.tomador || '(sin tomador)') ?? 0) + 1); continue; }
      const g = porTomador.get(t.id) ?? { tomador: t, lineas: [] };
      g.lineas.push(l); porTomador.set(t.id, g);
    }
    return { grupos: [...porTomador.values()], desconocidos: [...desconocidos.entries()] };
  }, [lineas, cfg?.tomadores]);

  // Recibos ya incluidos en otra operación del mismo tipo (en cualquier flota)
  const claveRecibos = useMemo(() => lineas.map(l => l.recibo).join(','), [lineas]);
  useEffect(() => {
    if (!claveRecibos) { setYaFacturados([]); return; }
    let vivo = true;
    fetch(`/api/facturacion/${encodeURIComponent(flota.id)}/comprobar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serie: tipo, recibos: claveRecibos.split(',') }) })
      .then(r => r.json()).then(d => { if (vivo) setYaFacturados(Array.isArray(d?.ya_facturados) ? d.ya_facturados : []); }).catch(() => {});
    return () => { vivo = false; };
  }, [flota.id, claveRecibos, tipo, historico]);

  const faltan = useMemo(() => faltaEnConfig(cfg), [cfg]);

  const errores = useMemo(() => {
    const e: string[] = [...(subido?.lectura.errores ?? []), ...comprobarImportes(lineas)];
    if (reparto.desconocidos.length > 0) e.push(`Hay tomadores del Excel sin reconocer: ${reparto.desconocidos.map(([n, c]) => `${n} (${nf(c)})`).join(', ')}. Asígnalos más abajo.`);
    if (yaFacturados.length > 0) {
      const por = new Map<string, number>();
      for (const y of yaFacturados) por.set(`${y.numero} de ${y.flota_nombre}`, (por.get(`${y.numero} de ${y.flota_nombre}`) ?? 0) + 1);
      e.push(`${nf(yaFacturados.length)} ${yaFacturados.length === 1 ? 'recibo ya está' : 'recibos ya están'} en otra ${OPERACION[tipo].nombre.toLowerCase()}: ${[...por.entries()].map(([k, n]) => `${nf(n)} en ${k}`).join('; ')}. Si quieres rehacerla, bórrala antes en el histórico.`);
    }
    if (subido && faltan.length === 0 && !fraccion) e.push('Elige el periodo que se factura.');
    if (subido && fraccion && !fechaDocIso) e.push('La fecha del recibo no es válida: escríbela como dd/mm/aaaa.');
    return e;
  }, [subido, lineas, reparto.desconocidos, yaFacturados, tipo, faltan, fraccion, fechaDocIso]);

  const avisos = useMemo(() => (fraccion ? avisosDeFechas(lineas, fraccion, meses) : []), [lineas, fraccion, meses]);

  const documentos = useMemo((): DocumentoFactura[] => {
    if (!cfg || !fraccion || !subido || !fechaDocIso) return [];
    return reparto.grupos.filter(g => g.lineas.length > 0).map(g => ({
      id: '', serie: tipo, tomador: g.tomador, numero, fechaDocumento: fechaDocIso, vencimiento: fraccion.desde,
      nombrePeriodo: nombreFraccion(fraccion, meses), nombrePeriodoCorto: nombreFraccion(fraccion, meses, true), textoPeriodo: texto,
      inicioCiclo: fraccion.inicioCiclo, renovacion: fraccion.renovacion, fechaInforme: subido.lectura.fechaInforme,
      lineas: g.lineas, resumen: resumir(g.lineas, pct), archivo: subido.file.name, sha256: subido.sha256, avisos, cambios,
    }));
  }, [cfg, fraccion, subido, fechaDocIso, reparto.grupos, tipo, numero, meses, texto, pct, avisos, cambios]);

  const puedeEmitir = !!subido && faltan.length === 0 && errores.length === 0 && documentos.length > 0 && revisado && !emitiendo;
  useEffect(() => { setRevisado(false); }, [claveRecibos, periodo, pct, fechaDocIso, tipo]);

  const emitir = async () => {
    if (!cfg || !subido || !puedeEmitir) return;
    setErrorEmitir(''); setEmitiendo('Guardando en el histórico…');
    const docs = documentos.map(d => ({ ...d, id: uid() }));
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(flota.id)}/emitir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentos: docs.map(d => ({
          id: d.id, flota: cfg.flota, tomador: { id: d.tomador.id, nombre: d.tomador.nombre, cif: d.tomador.cif }, serie: d.serie, vencimiento: d.vencimiento,
          numero: d.numero, texto_periodo: d.textoPeriodo, pct_comision: cfg.corredor.comision, totales: d.resumen, archivo: d.archivo, sha256: d.sha256,
          recibos: d.lineas.map(l => l.recibo),
          data: { cfg, doc: { ...d, lineas: undefined }, lineas: d.lineas },
        })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(j?.ya_facturados)) setYaFacturados(j.ya_facturados);
        throw new Error(j?.error || 'No se pudo guardar.');
      }
    } catch (e) {
      setEmitiendo(''); setErrorEmitir(e instanceof Error ? e.message : 'No se pudo guardar.');
      return;
    }
    // Ya está en el histórico. Si la carpeta fallara, se puede volver a descargar desde allí.
    try {
      const zip = await construirZip({ cfg, docs, original: subido.file }, setEmitiendo);
      setResultado({ ...zip, numero: docs[0].numero });
      const { saveAs } = await import('file-saver');
      saveAs(zip.blob, zip.nombre);
    } catch {
      setErrorEmitir('El recibo está guardado en el histórico, pero no se pudo preparar la carpeta. Descárgala desde allí.');
    }
    setEmitiendo('');
    limpiarArchivo();
    cargar(); onCambio();
  };

  const descargarDelHistorico = async (f: FacturaHist) => {
    setEmitiendo(`Preparando ${f.numero}…`);
    try {
      const res = await fetch(`/api/facturacion/factura/${encodeURIComponent(f.id)}`);
      const d = await res.json();
      if (!res.ok || !d?.data?.cfg || !d.data.doc) throw new Error();
      const doc: DocumentoFactura = { ...d.data.doc, lineas: d.data.lineas };
      const zip = await construirZip({ cfg: d.data.cfg, docs: [doc] });
      const { saveAs } = await import('file-saver');
      saveAs(zip.blob, zip.nombre);
    } catch { avisar('No se pudo preparar la descarga.'); }
    setEmitiendo('');
  };

  const registrar = (recibo: string, campo: string, antes: string, despues: string, motivo: string) =>
    setCambios(p => [...p, { recibo, campo, antes, despues, motivo, usuario, fecha: new Date().toISOString() }]);
  const lineaAbierta = panel?.tipo === 'linea' ? subido?.lectura.lineas.find(l => l.recibo === panel.recibo) ?? null : null;
  const quitadas = Object.entries(ediciones).filter(([, e]) => 'quitada' in e).map(([k]) => k);
  const activos = historico.filter(f => f.estado === 'emitida');

  return (
    <>
      {/* Flota */}
      <section className="vzone" style={{ paddingTop: 0 }}>
        <div className="vzhead">
          <div>
            <h2>{flota.nombre}</h2>
            <p className="sub-desc">{corredor?.nombre ?? 'Sin corredor asignado'}{activos.length > 0 ? ` · ${nf(activos.length)} ${activos.length === 1 ? 'recibo emitido' : 'recibos emitidos'} · ${eur2(activos.reduce((a, f) => a + f.importe, 0))}` : ' · todavía sin recibos emitidos'}</p>
          </div>
          <div className="actions"><button type="button" className="mini" onClick={onVolver}>Volver a las flotas</button></div>
        </div>
        {cargando && <p className="hint">Cargando los datos de facturación…</p>}
        {errorFlota && (
          <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert">
            <h3>No se pudieron leer los datos de facturación</h3>
            <p>{errorFlota}</p>
            <div className="actions" style={{ marginTop: 14 }}><button type="button" className="mini" onClick={cargar}>Reintentar</button></div>
          </div>
        )}
        {cfg && !cargando && (
          <>
            <div className="fa-kv">
              <div><label>Ciclo anual</label><span>{diaDe(cfg.inicioCiclo) ? `Empieza cada ${esDe(cfg.inicioCiclo).slice(0, 5)}` : <em>Sin indicar</em>}</span></div>
              <div><label>Periodicidad</label><span>{NOMBRE_PERIODICIDAD[meses] ?? <em>Sin indicar</em>}</span></div>
              <div><label>Corredor</label><span>{cfg.corredor.nombre || <em>Sin indicar</em>}{cfg.corredor.cif ? ` · ${cfg.corredor.cif}` : ''}</span></div>
              <div><label>Comisión</label><span>{pctTxt(cfg.corredor.comision)}</span></div>
              <div className="wide"><label>{cfg.tomadores.length === 1 ? 'Tomador' : `Tomadores (${nf(cfg.tomadores.length)})`}</label><span>{cfg.tomadores.map(t => `${t.nombre || 'Sin nombre'}${t.cif ? ` · ${t.cif}` : ''}`).join('  |  ') || <em>Sin indicar</em>}</span></div>
            </div>
            <div className="actions" style={{ marginTop: 16 }}>
              <button type="button" className={faltan.length > 0 ? 'mini pri' : 'mini'} onClick={() => setPanel({ tipo: 'config' })}>{faltan.length > 0 ? 'Completar datos de facturación' : 'Editar datos de facturación'}</button>
              {!cfgGuardada && faltan.length === 0 && <span className="hint" style={{ margin: 0 }}>Datos propuestos desde la ficha de la flota: revísalos y guárdalos.</span>}
            </div>
            {faltan.length > 0 && (
              <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)' }}>
                <h3>Faltan datos para facturar esta flota</h3>
                <p>Falta {faltan.slice(0, 5).join(', ')}{faltan.length > 5 ? ` y ${nf(faltan.length - 5)} más` : ''}. Se guardan una vez y sirven para las siguientes facturaciones.</p>
              </div>
            )}
          </>
        )}
      </section>

      {cfg && !cargando && (
        <>
          {/* Operación y archivo */}
          <section className="vzone">
            <div className="vzhead">
              <div><h2>Nueva facturación</h2><p className="sub-desc">Emisión y regularización se hacen por separado: cada una con su informe de recibos de MMT y su carpeta.</p></div>
              <div className="seg" role="radiogroup" aria-label="Operación">
                {(['RC', 'RW'] as Serie[]).map(s => <button key={s} type="button" role="radio" aria-checked={tipo === s} className={tipo === s ? 'on' : ''} onClick={() => cambiarTipo(s)}>{OPERACION[s].nombre}</button>)}
              </div>
            </div>
            <div className="vtri two">
              <div>
                <span className="no">{OPERACION[tipo].nombre}</span>
                <h3>{subido ? subido.file.name : 'Informe de recibos de MMT'}</h3>
                <p>{subido
                  ? `${nf(subido.lectura.lineas.length)} recibos leídos${subido.lectura.fechaInforme ? ` · fecha del informe ${esDe(subido.lectura.fechaInforme)}` : ''}.`
                  : `${OPERACION[tipo].ayuda} Sube el Excel tal cual sale de MMT: ORION quita las columnas que sobran y añade la comisión y el líquido.`}</p>
                <div className="actions">
                  <label className={`mini filebtn${subido ? '' : ' pri'}`}>
                    {leyendo ? 'Leyendo…' : subido ? 'Cambiar archivo' : 'Subir informe de recibos'}
                    <input type="file" accept=".xls,.xlsx" hidden disabled={leyendo} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f); }} />
                  </label>
                  {subido && <button type="button" className="mini danger" onClick={limpiarArchivo}>Quitar</button>}
                </div>
                {errorArchivo && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{errorArchivo}</p>}
              </div>
              <div>
                <span className="no">Periodo y número</span>
                <div className="fld">
                  <label htmlFor="fa-per">Periodo que se factura</label>
                  <select id="fa-per" className="select" value={periodo} onChange={e => { setPeriodo(e.target.value); setTextoManual(null); setFechaManual(null); }} disabled={opciones.length === 0 || !subido}>
                    <option value="">{opciones.length === 0 ? 'Completa antes el ciclo y la periodicidad' : !subido ? 'Sube antes el informe' : 'Elige el periodo…'}</option>
                    {opciones.map(f => <option key={f.desde} value={f.desde}>{capital(nombreFraccion(f, meses))} ({esDe(f.desde)} a {esDe(f.hasta)})</option>)}
                  </select>
                </div>
                <div className="frow2">
                  <div className="fld">
                    <label htmlFor="fa-fec">Fecha del recibo</label>
                    <input id="fa-fec" className="inp" placeholder="dd/mm/aaaa" disabled={!fraccion} value={fechaManual ?? esDe(fechaAuto)} onChange={e => setFechaManual(e.target.value)} />
                  </div>
                  <div className="fld">
                    <label>Número del recibo</label>
                    <div className="fa-num">{numero || '—'}</div>
                  </div>
                </div>
                <p className="hint">R + inicial del corredor + fecha del recibo. {tipo === 'RC' ? 'En la emisión se propone la fecha del informe.' : 'En la regularización se propone el último día del periodo.'}{fechaManual !== null && <> <button type="button" className="fa-link" onClick={() => setFechaManual(null)}>Volver a la fecha propuesta</button></>}</p>
              </div>
            </div>
          </section>

          {subido && (
            <>
              {/* Revisión */}
              <section className="vzone">
                <div className="vzhead"><div><h2>Revisión</h2><p className="sub-desc">Lo que aparece aquí es lo que se imprime en el recibo y lo que lleva el Excel.</p></div></div>

                {errores.length > 0 && (
                  <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert">
                    <h3>{errores.length === 1 ? 'Hay un problema que impide generar' : `Hay ${nf(errores.length)} problemas que impiden generar`}</h3>
                    <ul className="fa-list">{errores.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{errores.length > 12 && <li>…y {nf(errores.length - 12)} más.</li>}</ul>
                  </div>
                )}
                {reparto.desconocidos.length > 0 && (
                  <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)' }}>
                    <h3>¿A quién se factura?</h3>
                    <p>El Excel trae nombres de tomador que esta flota todavía no tiene reconocidos. Indica a qué tomador corresponde cada uno; queda guardado para la próxima vez.</p>
                    {reparto.desconocidos.map(([nombre, n]) => (
                      <div className="hit" key={nombre}>
                        <div className="nm">{nombre} <span className="why">{nf(n)} {n === 1 ? 'recibo' : 'recibos'}</span></div>
                        <div className="ln">
                          {cfg.tomadores.filter(t => t.nombre.trim()).map(t => (
                            <button key={t.id} type="button" className="mini" style={{ marginRight: 8, marginTop: 6 }}
                              onClick={() => guardarConfig({ ...cfg, tomadores: cfg.tomadores.map(x => (x.id === t.id ? { ...x, alias: [...x.alias, nombre] } : x)) })}>
                              Es {t.nombre}
                            </button>
                          ))}
                          <button type="button" className="mini" style={{ marginTop: 6 }}
                            onClick={() => guardarConfig({ ...cfg, tomadores: [...cfg.tomadores.filter(t => t.nombre.trim()), { id: uid(), nombre, cif: '', alias: [] }] }).then(ok => { if (ok) setPanel({ tipo: 'config' }); })}>
                            Es otro tomador
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {avisos.length > 0 && (
                  <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)' }}>
                    <h3>{avisos.length === 1 ? 'Un aviso para revisar' : `${nf(avisos.length)} avisos para revisar`}</h3>
                    <p>No impiden generar, pero conviene comprobarlos.</p>
                    <ul className="fa-list">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}

                {documentos.map(d => (
                  <div className="fa-doc" key={d.tomador.id}>
                    <div className="fa-dochead">
                      <span className="plate">{d.numero}</span>
                      <div>
                        <b>{OPERACION[d.serie].nombre} · {capital(d.nombrePeriodo)}</b>
                        <span>{d.tomador.nombre}{d.tomador.cif ? ` · ${d.tomador.cif}` : ''}</span>
                      </div>
                    </div>
                    <div className="kpis six">
                      <div className="kpi"><span className="l">Recibos</span><span className="v">{nf(d.resumen.recibos)}</span><span className="n">{nf(d.resumen.vehiculos)} vehículos{d.resumen.negativos.recibos > 0 ? <> · <b>{nf(d.resumen.negativos.recibos)}</b> en negativo</> : null}</span></div>
                      <div className="kpi"><span className="l">Prima neta</span><span className="v mny">{eur2(d.resumen.neta)}</span><span className="n">Suma del Excel</span></div>
                      <div className="kpi"><span className="l">Impuestos</span><span className="v mny">{eur2(d.resumen.impuesto)}</span><span className="n">Suma del Excel</span></div>
                      <div className="kpi"><span className="l">Importe total</span><span className="v mny">{eur2(d.resumen.importe)}</span><span className="n">Es lo que se imprime</span></div>
                      <div className="kpi"><span className="l">Comisión</span><span className="v mny">{eur2(d.resumen.comision)}</span><span className="n">{pctTxt(pct)} de la prima neta</span></div>
                      <div className="kpi"><span className="l">Líquido a abonar</span><span className="v mny">{eur2(d.resumen.liquido)}</span><span className="n">Importe menos comisión</span></div>
                    </div>
                  </div>
                ))}

                {fraccion && documentos.length > 0 && (
                  <div className="fa-textos">
                    <div className="fld">
                      <label htmlFor="fa-txt">Línea del periodo que se imprime en el recibo</label>
                      <input id="fa-txt" className="inp" value={texto} onChange={e => { setTextoManual(e.target.value); setRevisado(false); }} />
                      <div className="hint">Es la frase en negrita que va justo encima de los importes en el PDF y el Word.{textoManual !== null && <> <button type="button" className="fa-link" onClick={() => setTextoManual(null)}>Volver al texto calculado</button></>}</div>
                    </div>
                  </div>
                )}

                <div className="fa-lhead">
                  <b>{nf(lineas.length)} recibos</b>
                  <span className="hint" style={{ margin: 0 }}>Pulsa una línea para corregirla o quitarla. Cada cambio queda registrado.</span>
                </div>
                <div className="tscroll">
                  <table className="tbl fa-lines">
                    <thead><tr><th>Recibo</th><th>Póliza</th><th>Riesgo</th><th>Fecha</th><th>Tipo</th><th>Prima neta</th><th>Impuesto</th><th>Importe</th><th>Comisión</th><th>Líquido</th></tr></thead>
                    <tbody>
                      {lineas.slice(0, mostradas).map(l => (
                        <tr key={l.recibo} tabIndex={0} onClick={() => setPanel({ tipo: 'linea', recibo: l.recibo })} onKeyDown={e => { if (e.key === 'Enter') setPanel({ tipo: 'linea', recibo: l.recibo }); }}>
                          <td className="mono">{l.recibo}{ediciones[l.recibo] && <div className="muted">Corregida</div>}</td>
                          <td>{l.poliza}</td><td className="mono">{l.riesgo}</td><td>{esDe(l.fecha) || '—'}</td>
                          <td>{l.importe < 0 ? <span className="venclr">{l.tipo || 'Negativo'}</span> : l.tipo}{l.estado && <div className="muted">{l.estado}</div>}</td>
                          <td>{eur2(l.neta)}</td><td>{eur2(l.impuesto)}</td><td><b>{eur2(l.importe)}</b></td><td>{eur2(l.comision)}</td><td>{eur2(l.liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lineas.length > mostradas && <div className="more"><button type="button" onClick={() => setMostradas(m => m + 200)}>Ver más ({nf(lineas.length - mostradas)} restantes)</button></div>}
                {quitadas.length > 0 && (
                  <div className="vtags" style={{ marginTop: 18 }}>
                    {quitadas.map(rec => <button key={rec} type="button" className="mini" onClick={() => { registrar(rec, 'Línea', 'Quitada del recibo', 'Recuperada', ''); setEdiciones(p => { const n = { ...p }; delete n[rec]; return n; }); }}>Recuperar {rec}</button>)}
                  </div>
                )}
                {cambios.length > 0 && <p className="note">{nf(cambios.length)} {cambios.length === 1 ? 'cambio registrado' : 'cambios registrados'}. Van en la hoja «Cambios» del Excel.</p>}
              </section>

              {/* Generar */}
              <section className="vzone">
                <div className="vzhead"><div><h2>Generar</h2><p className="sub-desc">{documentos[0] ? <>Se descarga la carpeta <b>{nombreCarpeta(cfg, documentos[0])}</b> con ORIGINAL, TRABAJO y ENVIAR, y el recibo queda en el histórico.</> : 'Se descarga la carpeta con ORIGINAL, TRABAJO y ENVIAR, y el recibo queda en el histórico.'}</p></div></div>
                <label className="fa-check">
                  <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} disabled={errores.length > 0 || faltan.length > 0 || documentos.length === 0} />
                  <span>He revisado los importes, el periodo, el número{avisos.length > 0 ? ', los avisos' : ''} y los datos del corredor y del tomador.</span>
                </label>
                <div className="runrow">
                  <button type="button" className="btn" disabled={!puedeEmitir} onClick={emitir}>{emitiendo || `Generar ${numero || 'recibo'}`}</button>
                </div>
                {faltan.length > 0 && <p className="hint">Completa antes los datos de facturación de la flota.</p>}
                {errorEmitir && <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert"><h3>No se ha generado</h3><p>{errorEmitir}</p></div>}
              </section>
            </>
          )}

          {resultado && (
            <section className="vzone">
              <div className="chkbox" style={{ ['--c' as string]: 'var(--ok)', marginTop: 0 }} role="status">
                <h3>{resultado.numero} generado</h3>
                <p>Está guardado en el histórico y la carpeta se ha descargado como {resultado.nombre}.</p>
                <div className="actions" style={{ marginTop: 14 }}>
                  <button type="button" className="mini pri" onClick={async () => { const { saveAs } = await import('file-saver'); saveAs(resultado.blob, resultado.nombre); }}>Descargar de nuevo</button>
                </div>
              </div>
            </section>
          )}

          {/* Histórico */}
          <section className="vzone">
            <div className="vzhead"><div><h2>Histórico</h2><p className="sub-desc">Lo generado para esta flota. Puedes volver a descargarlo, anularlo (se conserva sin sumar) o borrarlo del todo.</p></div></div>
            {historico.length === 0 ? <div className="empty">Esta flota todavía no tiene recibos generados.</div> : (
              <div className="tscroll">
                <table className="tbl static">
                  <thead><tr><th>Número</th><th>Operación</th><th>Tomador</th><th>Recibos</th><th>Importe</th><th>Generado</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {historico.map(f => (
                      <tr key={f.id}>
                        <td className="mono">{f.numero}</td>
                        <td>{OPERACION[f.serie]?.nombre ?? f.serie}<div className="muted">{f.texto_periodo}</div></td>
                        <td>{f.tomador_nombre}</td>
                        <td>{nf(f.recibos)}</td>
                        <td><b>{eur2(f.importe)}</b></td>
                        <td>{fechaHora(f.creado_en)}<div className="muted">{f.creado_por}</div></td>
                        <td>{f.estado === 'emitida'
                          ? <span className="tag" style={{ ['--c' as string]: 'var(--ok)' }}>Emitido</span>
                          : <><span className="tag" style={{ ['--c' as string]: 'var(--quiet)' }}>Anulado</span><div className="muted">{f.motivo_anulacion}</div></>}</td>
                        <td>
                          <div className="actions" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="mini" disabled={!!emitiendo} onClick={() => descargarDelHistorico(f)}>Descargar</button>
                            {f.estado === 'emitida' && <button type="button" className="mini" onClick={() => setPanel({ tipo: 'anular', factura: f })}>Anular</button>}
                            <button type="button" className="mini danger" onClick={() => setPanel({ tipo: 'borrar', factura: f })}>Borrar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <DetailDrawer isOpen={panel?.tipo === 'config'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'config' && cfg && <PanelConfig cfg={cfg} onGuardar={async n => { if (await guardarConfig(n)) { setPanel(null); avisar('Datos de facturación guardados.'); } }} onCancelar={() => setPanel(null)} />}
      </DetailDrawer>
      <DetailDrawer isOpen={panel?.tipo === 'linea'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'linea' && lineaAbierta && (
          <PanelLinea
            key={panel.recibo} original={lineaAbierta} edicion={ediciones[panel.recibo]} onCancelar={() => setPanel(null)}
            onGuardar={(v, motivo) => {
              const prev = ediciones[panel.recibo]; const base = prev && !('quitada' in prev) ? prev : lineaAbierta;
              (['neta', 'impuesto', 'importe'] as const).forEach(c => { if (base[c] !== v[c]) registrar(panel.recibo, c === 'neta' ? 'Prima neta' : c === 'impuesto' ? 'Impuesto' : 'Importe', eur2(base[c]), eur2(v[c]), motivo); });
              setEdiciones(p => ({ ...p, [panel.recibo]: v })); setPanel(null);
            }}
            onQuitar={motivo => { registrar(panel.recibo, 'Línea', 'Incluida', 'Quitada del recibo', motivo); setEdiciones(p => ({ ...p, [panel.recibo]: { quitada: true } })); setPanel(null); }}
            onRestaurar={() => { registrar(panel.recibo, 'Línea', 'Corregida', 'Como en el Excel', ''); setEdiciones(p => { const n = { ...p }; delete n[panel.recibo]; return n; }); setPanel(null); }}
          />
        )}
      </DetailDrawer>
      <DetailDrawer isOpen={panel?.tipo === 'anular' || panel?.tipo === 'borrar'} onClose={() => setPanel(null)}>
        {(panel?.tipo === 'anular' || panel?.tipo === 'borrar') && (
          <PanelRetirar key={panel.tipo + panel.factura.id} factura={panel.factura} modo={panel.tipo} onCancelar={() => setPanel(null)}
            onHecho={() => { avisar(`${panel.factura.numero} ${panel.tipo === 'borrar' ? 'borrado' : 'anulado'}.`); setPanel(null); cargar(); onCambio(); }} />
        )}
      </DetailDrawer>
    </>
  );
}
