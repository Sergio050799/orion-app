'use client';

// Facturación de UNA flota. El Excel primero: se suelta el informe de recibos de MMT y ORION propone operación,
// periodo, fecha y número; la persona confirma o corrige, revisa (primero los problemas) y genera la carpeta
// ORIGINAL / TRABAJO / ENVIAR. Debajo, el histórico de lo generado.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import type { Corredor, FlotaCarpeta } from '@/core/flotas';
import {
  aCentimos, avisosDeFechas, comprobarImportes, conComision, diaDe, esDe, fechaDocumento, fraccionDe, fraccionQueContiene, fraccionesDelCiclo,
  inicioCicloDe, leerRecibos, moverMeses, nombreFraccion, numeroRecibo, resumir, textoPeriodo, tomadorDe,
  MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD,
  type Fraccion, type LecturaRecibos, type LineaRecibo, type Serie, type TomadorFacturacion,
} from '@/core/flotas/facturacion';
import { eur2, nf } from '@/lib/fmt';
import { construirZip, inicioDesdeVencimiento, nombreCarpeta, type CambioLinea, type ConfigFacturacion, type DocumentoFactura } from './generar';
import { PanelConfig, PanelLinea, pctTxt, uid, type Edicion, type FacturaHist } from './paneles';

const OPERACION: Record<Serie, string> = { RC: 'Emisión', RW: 'Regularización' };
const SUC: Record<string, string> = { TITAN: 'Titán', MEDIACION: 'Mediación' };
const capital = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const fechaHora = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const hoyIso = () => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`; };

interface Subido { file: File; lectura: LecturaRecibos; sha256: string }
interface YaFacturado { recibo: string; numero: string; flota_nombre: string }
interface Problema { txt: string; recibo?: string; historico?: boolean }
type FiltroLineas = 'todas' | 'neg' | 'corr' | 'err';

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

/** Lo que falta, en corto, para la portada («Falta: CIF del tomador +1»). Mismas condiciones que faltaEnConfig. */
export function faltaCorta(cfg: ConfigFacturacion | null): string[] {
  if (!cfg) return ['Datos de facturación'];
  const f: string[] = [];
  if (!diaDe(cfg.inicioCiclo)) f.push('Inicio de ciclo');
  if (!MESES_PERIODICIDAD[cfg.periodicidad]) f.push('Periodicidad');
  if (!cfg.corredor?.nombre?.trim()) f.push('Nombre del corredor');
  if (!cfg.corredor?.cif?.trim()) f.push('CIF del corredor');
  if (!cfg.corredor?.domicilio?.trim()) f.push('Domicilio del corredor');
  const toms = cfg.tomadores ?? [];
  if (toms.length === 0 || toms.some(t => !t.nombre?.trim())) f.push('Tomador');
  else if (toms.some(t => !t.cif?.trim())) f.push('CIF del tomador');
  return f;
}

/** Operación que sugiere el archivo: con anulaciones o importes en negativo, regularización; si no, emisión. */
function operacionSugerida(lineas: LineaRecibo[]): Serie {
  return lineas.some(l => l.importe < 0 || /anul/i.test(l.tipo)) ? 'RW' : 'RC';
}

const Check = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

type Panel = null | { tipo: 'config' } | { tipo: 'linea'; recibo: string };
type Modal = null | { tipo: 'generar' } | { tipo: 'anular' | 'borrar'; factura: FacturaHist };

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
  const [sugerida, setSugerida] = useState<Serie | null>(null);
  /** operación y periodo preparados antes de soltar el archivo (tras una emisión: «hacer ahora la regularización») */
  const [preparada, setPreparada] = useState<{ serie: Serie; desde: string } | null>(null);
  const [subido, setSubido] = useState<Subido | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [periodo, setPeriodo] = useState('');                         // primer día de la fracción (ISO)
  const [periodoDetectado, setPeriodoDetectado] = useState('');
  const [fechaManual, setFechaManual] = useState<string | null>(null);   // ISO elegido a mano
  const [textoManual, setTextoManual] = useState<string | null>(null);
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [cambios, setCambios] = useState<CambioLinea[]>([]);
  const [yaFacturados, setYaFacturados] = useState<YaFacturado[]>([]);
  const [filtro, setFiltro] = useState<FiltroLineas>('todas');
  const [buscaLinea, setBuscaLinea] = useState('');
  const [lineasAbiertas, setLineasAbiertas] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [motivo, setMotivo] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [menuFila, setMenuFila] = useState<{ factura: FacturaHist; x: number; y: number } | null>(null);
  const [emitiendo, setEmitiendo] = useState('');
  const [errorEmitir, setErrorEmitir] = useState('');
  const [resultado, setResultado] = useState<{ blob: Blob; nombre: string; doc: DocumentoFactura; docs: number; importe: number } | null>(null);
  const [recienGenerado, setRecienGenerado] = useState('');
  const historicoRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const limpiarArchivo = () => {
    setSubido(null); setErrorArchivo(''); setPeriodo(''); setPeriodoDetectado(''); setFechaManual(null); setTextoManual(null); setEdiciones({}); setCambios([]);
    setYaFacturados([]); setFiltro('todas'); setBuscaLinea(''); setLineasAbiertas(false); setErrorEmitir(''); setSugerida(null);
  };

  const meses = MESES_PERIODICIDAD[cfg?.periodicidad ?? ''] ?? 0;
  const ancla = useMemo(() => diaDe(cfg?.inicioCiclo ?? ''), [cfg?.inicioCiclo]);
  const pct = cfg?.corredor.comision ?? 0;
  const faltan = useMemo(() => faltaEnConfig(cfg), [cfg]);

  const subir = async (file: File) => {
    if (leyendo) return;
    if (!/\.xlsx?$/i.test(file.name)) { setErrorArchivo('Ese archivo no es un Excel. Sube el informe de recibos de MMT (.xls o .xlsx).'); return; }
    setLeyendo(true); setErrorArchivo(''); setResultado(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      const lectura = leerRecibos(wb.SheetNames.map(n => ({ nombre: n, filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })));
      if (lectura.lineas.length === 0) { setErrorArchivo(lectura.errores[0] ?? 'El archivo no tiene recibos.'); return; }
      limpiarArchivo();
      // Propuesta a partir del Excel: operación y periodo (la decisión final es de la persona)
      const sug = operacionSugerida(lectura.lineas);
      const cuenta = new Map<string, number>();
      for (const l of lectura.lineas) if (l.fecha) cuenta.set(l.fecha, (cuenta.get(l.fecha) ?? 0) + 1);
      const moda = diaDe([...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '');
      const detectado = moda && ancla && meses ? fraccionQueContiene(ancla, meses, moda)?.desde ?? '' : '';
      setSugerida(sug);
      setTipo(preparada?.serie ?? sug);
      setPeriodoDetectado(detectado);
      setPeriodo(preparada?.desde ?? detectado);
      setPreparada(null);
      setSubido({ file, lectura, sha256: '' });
      huella(buf).then(h => setSubido(p => (p?.file === file ? { ...p, sha256: h } : p)));
    } catch {
      setErrorArchivo('No se ha podido leer el archivo. Comprueba que es el informe de recibos de MMT (.xls o .xlsx).');
    } finally { setLeyendo(false); }
  };

  // Soltar el Excel en cualquier punto de la pantalla
  const subirRef = useRef(subir); subirRef.current = subir;
  const puedeSoltar = !!cfg && !cargando && faltan.length === 0 && !emitiendo;
  useEffect(() => {
    if (!puedeSoltar) return;
    let dentro = 0;
    const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const entra = (e: DragEvent) => { if (!conArchivos(e)) return; e.preventDefault(); dentro++; setArrastrando(true); };
    const sobre = (e: DragEvent) => { if (conArchivos(e)) e.preventDefault(); };
    const sale = (e: DragEvent) => { if (!conArchivos(e)) return; dentro = Math.max(0, dentro - 1); if (dentro === 0) setArrastrando(false); };
    const suelta = (e: DragEvent) => { if (!conArchivos(e)) return; e.preventDefault(); dentro = 0; setArrastrando(false); const f = e.dataTransfer?.files?.[0]; if (f) subirRef.current(f); };
    window.addEventListener('dragenter', entra); window.addEventListener('dragover', sobre); window.addEventListener('dragleave', sale); window.addEventListener('drop', suelta);
    return () => { window.removeEventListener('dragenter', entra); window.removeEventListener('dragover', sobre); window.removeEventListener('dragleave', sale); window.removeEventListener('drop', suelta); };
  }, [puedeSoltar]);

  // ── Cálculo ──
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

  const opciones = useMemo((): Fraccion[] => {
    if (!ancla || !meses) return [];
    const ref = diaDe(periodoDetectado || periodo) ?? (() => { const h = new Date(); return { y: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() }; })();
    const ciclo = inicioCicloDe(ancla, ref);
    return [-12, 0, 12].flatMap(k => fraccionesDelCiclo(moverMeses(ciclo, k), meses));
  }, [ancla, meses, periodoDetectado, periodo]);

  const fraccion = useMemo(() => (ancla && meses && periodo ? fraccionDe(ancla, meses, diaDe(periodo)!) : null), [ancla, meses, periodo]);
  const fechaAuto = fraccion ? fechaDocumento(tipo, fraccion, subido?.lectura.fechaInforme ?? '') : '';
  const fechaDocIso = fechaManual ?? fechaAuto;
  const numero = cfg && fechaDocIso ? numeroRecibo(cfg.corredor.nombre, fechaDocIso) : '';
  const texto = textoManual ?? (fraccion ? textoPeriodo(tipo, meses, fraccion) : '');
  const activos = useMemo(() => historico.filter(f => f.estado === 'emitida'), [historico]);
  const yaExiste = useCallback((serie: Serie, desde: string) => activos.find(f => f.serie === serie && f.vencimiento === desde) ?? null, [activos]);

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

  const descuadradas = useMemo(() => new Set(lineas.filter(l => aCentimos(l.neta) + aCentimos(l.impuesto) !== aCentimos(l.importe)).map(l => l.recibo)), [lineas]);

  const problemas = useMemo((): Problema[] => {
    if (!subido) return [];
    const p: Problema[] = (subido.lectura.errores ?? []).map(txt => ({ txt }));
    for (const l of lineas) if (descuadradas.has(l.recibo)) p.push({ txt: `Línea ${nf(l.fila)} (póliza ${l.poliza}): la prima neta más el impuesto (${eur2(l.neta + l.impuesto)}) no coincide con el importe (${eur2(l.importe)}).`, recibo: l.recibo });
    for (const e of comprobarImportes(lineas)) if (/repetidos/.test(e)) p.push({ txt: e });
    const previo = fraccion ? yaExiste(tipo, fraccion.desde) : null;
    if (previo) p.push({ txt: `Ya existe el recibo ${previo.numero} de esta operación y este periodo. Hay que borrarlo antes en el histórico, o elegir otro periodo.`, historico: true });
    else if (yaFacturados.length > 0) {
      const por = new Map<string, number>();
      for (const y of yaFacturados) por.set(`${y.numero} de ${y.flota_nombre}`, (por.get(`${y.numero} de ${y.flota_nombre}`) ?? 0) + 1);
      p.push({ txt: `${nf(yaFacturados.length)} ${yaFacturados.length === 1 ? 'recibo ya está' : 'recibos ya están'} en otra ${OPERACION[tipo].toLowerCase()}: ${[...por.entries()].map(([k, n]) => `${nf(n)} en ${k}`).join('; ')}. Para rehacerla, bórrala antes en su histórico.` });
    }
    if (!fraccion) p.push({ txt: 'Elige el periodo que se factura.' });
    else if (!diaDe(fechaDocIso)) p.push({ txt: 'Indica la fecha del recibo.' });
    if (fraccion && !texto.trim()) p.push({ txt: 'Escribe la línea del periodo que se imprime en el recibo.' });
    return p;
  }, [subido, lineas, descuadradas, fraccion, yaExiste, tipo, yaFacturados, fechaDocIso, texto]);

  const avisos = useMemo(() => {
    if (!fraccion) return [] as string[];
    const a: string[] = [];
    if (tipo === 'RW' && fraccion.hasta >= hoyIso()) a.push(`El periodo aún no ha terminado (acaba el ${esDe(fraccion.hasta)}). La regularización se hace normalmente al cerrarlo.`);
    a.push(...avisosDeFechas(lineas, fraccion, meses));
    const quitadas = Object.values(ediciones).filter(e => 'quitada' in e).length, corregidas = Object.values(ediciones).length - quitadas;
    if (quitadas > 0) a.push(`${nf(quitadas)} ${quitadas === 1 ? 'línea quitada' : 'líneas quitadas'} del recibo (con motivo).`);
    if (corregidas > 0) a.push(`${nf(corregidas)} ${corregidas === 1 ? 'línea corregida' : 'líneas corregidas'} respecto al Excel (con motivo).`);
    return a;
  }, [lineas, fraccion, meses, tipo, ediciones]);

  const documentos = useMemo((): DocumentoFactura[] => {
    if (!cfg || !fraccion || !subido || !diaDe(fechaDocIso)) return [];
    return reparto.grupos.filter(g => g.lineas.length > 0).map(g => ({
      id: '', serie: tipo, tomador: g.tomador, numero, fechaDocumento: fechaDocIso, vencimiento: fraccion.desde,
      nombrePeriodo: nombreFraccion(fraccion, meses), nombrePeriodoCorto: nombreFraccion(fraccion, meses, true), textoPeriodo: texto,
      inicioCiclo: fraccion.inicioCiclo, renovacion: fraccion.renovacion, fechaInforme: subido.lectura.fechaInforme,
      lineas: g.lineas, resumen: resumir(g.lineas, pct), archivo: subido.file.name, sha256: subido.sha256, avisos, cambios,
    }));
  }, [cfg, fraccion, subido, fechaDocIso, reparto.grupos, tipo, numero, meses, texto, pct, avisos, cambios]);

  // Totales del recibo (todos los tomadores)
  const total = useMemo(() => {
    const t = { recibos: 0, neta: 0, impuesto: 0, importe: 0, comision: 0, liquido: 0 };
    for (const d of documentos) { t.recibos += d.resumen.recibos; t.neta += aCentimos(d.resumen.neta); t.impuesto += aCentimos(d.resumen.impuesto); t.importe += aCentimos(d.resumen.importe); t.comision += aCentimos(d.resumen.comision); t.liquido += aCentimos(d.resumen.liquido); }
    return { recibos: t.recibos, neta: t.neta / 100, impuesto: t.impuesto / 100, importe: t.importe / 100, comision: t.comision / 100, liquido: t.liquido / 100 };
  }, [documentos]);

  const bloqueos = problemas.length + reparto.desconocidos.length + (faltan.length > 0 ? 1 : 0);
  const puedeGenerar = !!subido && bloqueos === 0 && documentos.length > 0 && !emitiendo;

  const emitir = async () => {
    if (!cfg || !subido || !puedeGenerar) return;
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
      setEmitiendo(''); setModal(null); setErrorEmitir(e instanceof Error ? e.message : 'No se pudo guardar.');
      return;
    }
    // Ya está en el histórico. Si la carpeta fallara, se puede volver a descargar desde allí.
    const importe = total.importe;
    try {
      const zip = await construirZip({ cfg, docs, original: subido.file }, setEmitiendo);
      setResultado({ ...zip, doc: docs[0], docs: docs.length, importe });
      const { saveAs } = await import('file-saver');
      saveAs(zip.blob, zip.nombre);
    } catch {
      setErrorEmitir('El recibo está guardado en el histórico, pero no se pudo preparar la carpeta. Descárgala desde allí.');
    }
    setEmitiendo(''); setModal(null); setRecienGenerado(docs[0].id);
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
    } catch { avisar('Este recibo no se puede volver a descargar. Si era una prueba antigua, bórralo y genéralo de nuevo.'); }
    setEmitiendo('');
  };

  const retirar = async () => {
    if (!modal || modal.tipo === 'generar') return;
    const { tipo: modo, factura } = modal;
    if (modo === 'anular' && !motivo.trim()) { setErrorModal('Indica el motivo de la anulación.'); return; }
    setEmitiendo(modo === 'borrar' ? 'Borrando…' : 'Anulando…'); setErrorModal('');
    try {
      const res = await fetch(`/api/facturacion/factura/${encodeURIComponent(factura.id)}/${modo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'No se pudo completar.');
      avisar(modo === 'borrar' ? `Recibo ${factura.numero} borrado: el periodo vuelve a quedar libre.` : `Recibo ${factura.numero} anulado: ya no suma.`);
      if (resultado?.doc.id === factura.id) setResultado(null);
      setModal(null); setMotivo(''); cargar(); onCambio();
    } catch (e) { setErrorModal(e instanceof Error ? e.message : 'No se pudo completar.'); }
    setEmitiendo('');
  };

  const registrar = (recibo: string, campo: string, antes: string, despues: string, mot: string) =>
    setCambios(p => [...p, { recibo, campo, antes, despues, motivo: mot, usuario, fecha: new Date().toISOString() }]);
  const lineaAbierta = panel?.tipo === 'linea' ? subido?.lectura.lineas.find(l => l.recibo === panel.recibo) ?? null : null;

  // Líneas del informe con filtros (incluye las quitadas, tachadas, para poder restaurarlas)
  const filas = useMemo(() => {
    if (!subido) return [] as Array<{ l: LineaRecibo; quitada: boolean; corregida: boolean; error: boolean }>;
    const porRecibo = new Map(lineas.map(l => [l.recibo, l]));
    const q = buscaLinea.trim().toLowerCase();
    return subido.lectura.lineas.map(orig => {
      const e = ediciones[orig.recibo]; const quitada = !!e && 'quitada' in e;
      const l = porRecibo.get(orig.recibo) ?? orig;
      return { l, quitada, corregida: !!e && !quitada, error: !quitada && descuadradas.has(orig.recibo) };
    }).filter(x => (filtro === 'todas' || (filtro === 'neg' && x.l.importe < 0) || (filtro === 'corr' && (x.corregida || x.quitada)) || (filtro === 'err' && x.error))
      && (!q || `${x.l.poliza} ${x.l.recibo} ${x.l.riesgo} ${x.l.tomador}`.toLowerCase().includes(q)));
  }, [subido, lineas, ediciones, descuadradas, filtro, buscaLinea]);
  const cuentas = useMemo(() => {
    const todas = subido?.lectura.lineas ?? [];
    return { todas: todas.length, neg: todas.filter(l => l.importe < 0).length, corr: Object.keys(ediciones).length, err: descuadradas.size };
  }, [subido, ediciones, descuadradas]);

  const abrirLinea = (recibo: string) => setPanel({ tipo: 'linea', recibo });
  const irAlHistorico = () => historicoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const cerrarModal = () => { if (emitiendo) return; setModal(null); setMotivo(''); setErrorModal(''); };
  useEffect(() => {
    if (!modal && !menuFila) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuFila(null); cerrarModal(); } };
    const clic = () => setMenuFila(null);
    window.addEventListener('keydown', tecla); if (menuFila) window.addEventListener('click', clic);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('click', clic); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, menuFila, emitiendo]);

  const totalActivos = activos.reduce((a, f) => a + f.importe, 0), liquidoActivos = activos.reduce((a, f) => a + f.liquido, 0);
  const situacion = activos.length > 0 ? ['Facturada', 'var(--ok)'] : faltan.length > 0 ? ['Faltan datos', 'var(--warn)'] : ['Sin facturar', 'var(--blue)'];
  const ofrecerRegularizacion = resultado && resultado.doc.serie === 'RC' && !yaExiste('RW', resultado.doc.vencimiento);

  return (
    <div className="fa-ficha">
      <div className="fa-top">
        <button type="button" className="mini" onClick={onVolver}>‹ Todas las flotas</button>
        <span className="lb">Facturación</span>
      </div>
      <section className="fa-case">
        <p className="over">Facturación{corredor?.sucursal ? ` · ${SUC[corredor.sucursal] ?? corredor.sucursal}` : ''}</p>
        <h2>{flota.nombre}</h2>
        <div className="meta">
          <span>{corredor?.nombre ?? 'Sin corredor asignado'}</span>
          {flota.vehiculosCount ? <span>{nf(flota.vehiculosCount)} vehículos</span> : null}
          {flota.header?.cif ? <span className="fa-mono">{flota.header.cif}</span> : null}
          {!cargando && <span className="tag" style={{ ['--c' as string]: situacion[1] }}>{situacion[0]}</span>}
        </div>
      </section>

      {cargando && <p className="hint">Cargando los datos de facturación…</p>}
      {errorFlota && (
        <div className="fa-grp e" role="alert">
          <div className="gh"><b>No se pudieron leer los datos de facturación</b><span>{errorFlota}</span></div>
          <div className="fa-ac"><button type="button" className="mini" onClick={cargar}>Reintentar</button></div>
        </div>
      )}

      {cfg && !cargando && (
        <>
          {/* Datos de facturación: una línea si están completos; desplegados y en ámbar si falta algo */}
          {faltan.length === 0 ? (
            <div className="fa-datos">
              <span className="k">Datos de facturación</span>
              <span className="v">
                Ciclo desde {esDe(cfg.inicioCiclo)} · {NOMBRE_PERIODICIDAD[meses]} · {cfg.corredor.nombre} · <span className="fa-mono">{cfg.corredor.cif}</span> · {pctTxt(cfg.corredor.comision)} · {nf(cfg.tomadores.length)} {cfg.tomadores.length === 1 ? 'tomador' : 'tomadores'}
                {!cfgGuardada && <em> · propuestos desde la ficha de la flota: revísalos y guárdalos</em>}
              </span>
              <button type="button" className="fa-act" onClick={() => setPanel({ tipo: 'config' })}>Editar</button>
            </div>
          ) : (
            <div className="fa-datos bad">
              <div className="hd">
                <div><b>Faltan datos para poder facturar</b><p>Falta {faltan.slice(0, 5).join(', ')}{faltan.length > 5 ? ` y ${nf(faltan.length - 5)} más` : ''}. Se guardan una vez y sirven para las siguientes facturaciones.</p></div>
                <button type="button" className="btn" onClick={() => setPanel({ tipo: 'config' })}>Completar datos</button>
              </div>
            </div>
          )}

          {/* Hecho */}
          {resultado && !subido && (
            <section className="fa-stage fa-in fa-doneb" aria-label="Operación generada">
              <div className="dn">
                <span className="ck"><Check size={18} /></span>
                <div>
                  <h3>Hecho</h3>
                  <p>{OPERACION[resultado.doc.serie]} · {capital(resultado.doc.nombrePeriodo)} · <span className="fa-mono">{resultado.doc.numero}</span> · {eur2(resultado.importe)} · {nf(resultado.docs)} {resultado.docs === 1 ? 'documento' : 'documentos'}</p>
                  <p className="fo">Carpeta <span className="fa-mono">{resultado.nombre.replace(/\.zip$/, '')}</span> con ORIGINAL, TRABAJO y ENVIAR.</p>
                  <button type="button" className="mini" onClick={async () => { const { saveAs } = await import('file-saver'); saveAs(resultado.blob, resultado.nombre); }}>Descargar de nuevo</button>
                </div>
              </div>
              {ofrecerRegularizacion && (
                <div className="fa-follow">
                  <p><b>¿Hacer ahora la regularización de este periodo?</b></p>
                  <div className="fa-ac">
                    <button type="button" className="btn" onClick={() => { setPreparada({ serie: 'RW', desde: resultado.doc.vencimiento }); setResultado(null); }}>Hacer regularización</button>
                    <button type="button" className="mini" onClick={() => setResultado(null)}>Ahora no</button>
                  </div>
                </div>
              )}
            </section>
          )}
          {errorEmitir && !subido && <div className="fa-grp e" role="alert" style={{ marginTop: 18 }}><div className="gh"><b>Atención</b><span>{errorEmitir}</span></div></div>}

          {/* Sin archivo: zona para soltar el Excel */}
          {!subido && faltan.length === 0 && (
            <section className="fa-stage fa-in" aria-label="Informe de recibos">
              {preparada && (
                <div className="fa-start">
                  <span>Preparada: <b>{OPERACION[preparada.serie].toLowerCase()}</b> del periodo que empieza el {esDe(preparada.desde)}. Suelta el informe para continuar.</span>
                  <button type="button" className="fa-act" onClick={() => setPreparada(null)}>Quitar</button>
                </div>
              )}
              <div className={`fa-drop${preparada ? ' pulse' : ''}`}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
                <p className="t">{leyendo ? 'Leyendo el informe…' : 'Suelta aquí el Excel de recibos'}</p>
                <p className="s">Puedes soltarlo en cualquier punto de la pantalla. Sube el informe tal cual sale de MMT: ORION propone operación, periodo, fecha y número, quita las columnas que sobran y añade la comisión y el líquido.</p>
                <div className="fa-ac">
                  <button type="button" className="btn" disabled={leyendo} onClick={() => fileRef.current?.click()}>Elegir archivo</button>
                </div>
                {errorArchivo && <p className="fa-err" role="alert">{errorArchivo}</p>}
              </div>
            </section>
          )}

          {/* Con archivo: propuesta y revisión */}
          {subido && (
            <section className="fa-stage fa-in" aria-label="Revisión">
              <div className="fa-file">
                <span className="nm">{subido.file.name}</span>
                <span className="sb">{nf(subido.lectura.lineas.length)} líneas leídas{subido.lectura.fechaInforme ? ` · informe del ${esDe(subido.lectura.fechaInforme)}` : ''}</span>
                <button type="button" className="fa-act" onClick={() => fileRef.current?.click()}>Cambiar archivo</button>
                <button type="button" className="fa-act dng" onClick={limpiarArchivo}>Descartar</button>
              </div>
              {errorArchivo && <p className="fa-err" role="alert">{errorArchivo}</p>}

              <div className="fa-prop">
                <div className="ph"><h3>Propuesta a partir del Excel</h3><p>Confirma o corrige. La decisión final es tuya.</p></div>
                <div className="fa-row">
                  <div className="fld">
                    <label id="fa-op">Operación</label>
                    <div className="seg" role="radiogroup" aria-labelledby="fa-op">
                      {(['RC', 'RW'] as Serie[]).map(s => (
                        <button key={s} type="button" role="radio" aria-checked={tipo === s} className={tipo === s ? 'on' : ''} onClick={() => { setTipo(s); setTextoManual(null); setFechaManual(null); }}>
                          {OPERACION[s]}{sugerida === s && <em className="sg">sugerida</em>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="fld">
                    <label htmlFor="fa-per">Periodo</label>
                    <select id="fa-per" className="select" value={periodo} onChange={e => { setPeriodo(e.target.value); setTextoManual(null); setFechaManual(null); }} disabled={opciones.length === 0}>
                      <option value="">Elige el periodo…</option>
                      {opciones.map(f => <option key={f.desde} value={f.desde}>{capital(nombreFraccion(f, meses))} ({esDe(f.desde)} a {esDe(f.hasta)}){yaExiste(tipo, f.desde) ? ' · ya existe' : ''}</option>)}
                    </select>
                    <div className="hint">{!periodoDetectado ? 'Elige el periodo de este informe.' : periodo === periodoDetectado ? 'Detectado en el Excel.' : <>Cambiado: el Excel apunta a otro periodo. <button type="button" className="fa-link" onClick={() => { setPeriodo(periodoDetectado); setTextoManual(null); setFechaManual(null); }}>Volver al detectado</button></>}</div>
                  </div>
                  <div className="fld">
                    <label htmlFor="fa-fec">Fecha del recibo</label>
                    <input id="fa-fec" type="date" className="inp" disabled={!fraccion} value={fechaDocIso} onChange={e => setFechaManual(e.target.value)} />
                    <div className="hint">{fechaManual !== null ? <button type="button" className="fa-link" onClick={() => setFechaManual(null)}>Volver a la propuesta</button> : tipo === 'RW' ? 'Último día del periodo.' : 'Fecha del informe.'}</div>
                  </div>
                  <div className="fld">
                    <label>Número</label>
                    <div className="fa-num">{numero || '—'}</div>
                    <div className="hint">R + inicial del corredor + fecha.</div>
                  </div>
                </div>
              </div>

              <div className="fa-rev">
                <h3>Revisión</h3>
                {bloqueos === 0 && avisos.length === 0 && (
                  <div className="fa-okb"><span className="ck"><Check /></span><div><b>Todo correcto</b><span>Sin errores ni avisos. Estos son los totales del recibo.</span></div></div>
                )}
                {bloqueos > 0 && (
                  <div className="fa-grp e" role="alert">
                    <div className="gh"><b>Impiden generar · {nf(bloqueos)}</b><span>Hay que resolverlos para activar Generar.</span></div>
                    <div className="fa-iss">
                      {faltan.length > 0 && <div className="it"><span className="k e">Datos</span><span className="tx">Faltan datos de facturación de la flota.</span><span className="bt"><button type="button" className="mini" onClick={() => setPanel({ tipo: 'config' })}>Completar datos</button></span></div>}
                      {problemas.slice(0, 14).map((p, i) => (
                        <div className="it" key={i}>
                          <span className="k e">Error</span><span className="tx">{p.txt}</span>
                          <span className="bt">
                            {p.recibo && <button type="button" className="mini" onClick={() => abrirLinea(p.recibo!)}>Corregir línea</button>}
                            {p.historico && <button type="button" className="mini" onClick={irAlHistorico}>Ir al histórico</button>}
                          </span>
                        </div>
                      ))}
                      {problemas.length > 14 && <div className="it"><span className="k e">Error</span><span className="tx">…y {nf(problemas.length - 14)} más.</span></div>}
                      {reparto.desconocidos.map(([nombre, n]) => (
                        <div className="it" key={nombre}>
                          <span className="k e">Tomador</span>
                          <span className="tx">«<b>{nombre}</b>» aparece en {nf(n)} {n === 1 ? 'línea' : 'líneas'} y no coincide con ningún tomador de la flota. ¿Quién es?</span>
                          <span className="bt">
                            {cfg.tomadores.filter(t => t.nombre.trim()).map(t => (
                              <button key={t.id} type="button" className="mini" onClick={() => guardarConfig({ ...cfg, tomadores: cfg.tomadores.map(x => (x.id === t.id ? { ...x, alias: [...x.alias, nombre] } : x)) })}>Es {t.nombre.length > 26 ? t.nombre.slice(0, 25) + '…' : t.nombre}</button>
                            ))}
                            <button type="button" className="mini" onClick={() => guardarConfig({ ...cfg, tomadores: [...cfg.tomadores.filter(t => t.nombre.trim()), { id: uid(), nombre, cif: '', alias: [] }] }).then(ok => { if (ok) setPanel({ tipo: 'config' }); })}>Es otro tomador</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {bloqueos === 0 && avisos.length > 0 && (
                  <div className="fa-okb"><span className="ck"><Check /></span><div><b>Sin errores</b><span>Puedes generar. Hay avisos que conviene leer.</span></div></div>
                )}
                {avisos.length > 0 && (
                  <div className="fa-grp w">
                    <div className="gh"><b>Avisos · {nf(avisos.length)}</b><span>No impiden generar.</span></div>
                    <div className="fa-iss">{avisos.map((a, i) => <div className="it" key={i}><span className="k w">Aviso</span><span className="tx">{a}</span></div>)}</div>
                  </div>
                )}

                <div className="fa-six" role="group" aria-label="Totales del recibo">
                  <div><label>Recibos</label><b>{nf(total.recibos)}</b></div>
                  <div><label>Prima neta</label><b>{eur2(total.neta)}</b></div>
                  <div><label>Impuestos</label><b>{eur2(total.impuesto)}</b></div>
                  <div className="main"><label>Importe total</label><b>{eur2(total.importe)}</b></div>
                  <div><label>Comisión</label><b>{eur2(total.comision)}</b></div>
                  <div><label>Líquido a abonar</label><b>{eur2(total.liquido)}</b></div>
                </div>
                {documentos.length > 1 && (
                  <details className="fa-det">
                    <summary>Desglose por tomador · {nf(documentos.length)} recibos</summary>
                    <div className="fa-xw" style={{ marginTop: 12 }}>
                      <table className="fa-xg">
                        <thead><tr><th>Tomador</th><th className="n">Recibos</th><th className="n">Prima neta</th><th className="n">Impuestos</th><th className="n">Importe total</th><th className="n">Comisión</th><th className="n">Líquido</th></tr></thead>
                        <tbody>{documentos.map(d => <tr key={d.tomador.id}><td>{d.tomador.nombre}</td><td className="n">{nf(d.resumen.recibos)}</td><td className="n">{eur2(d.resumen.neta)}</td><td className="n">{eur2(d.resumen.impuesto)}</td><td className="n">{eur2(d.resumen.importe)}</td><td className="n">{eur2(d.resumen.comision)}</td><td className="n">{eur2(d.resumen.liquido)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                )}

                <div className="fa-pl">
                  <label htmlFor="fa-txt">Línea del periodo <span>se imprime en negrita en el recibo, encima de los importes</span></label>
                  <input id="fa-txt" className="inp" value={texto} onChange={e => setTextoManual(e.target.value)} />
                  <div className="hint">{textoManual !== null && <button type="button" className="fa-link" onClick={() => setTextoManual(null)}>Volver al texto calculado</button>}</div>
                </div>

                <details className="fa-det fa-lines" open={lineasAbiertas} onToggle={e => setLineasAbiertas((e.target as HTMLDetailsElement).open)}>
                  <summary>Líneas del informe · {nf(subido.lectura.lineas.length)}</summary>
                  {lineasAbiertas && (
                    <>
                      <div className="fa-lt">
                        <input className="inp" type="search" placeholder="Buscar póliza, recibo, riesgo o tomador" value={buscaLinea} onChange={e => setBuscaLinea(e.target.value)} aria-label="Buscar líneas" />
                        <div className="fa-chips">
                          {([['todas', 'Todas'], ['neg', 'En negativo'], ['corr', 'Corregidas'], ['err', 'Con error']] as [FiltroLineas, string][]).map(([k, n]) => (
                            <button key={k} type="button" className={filtro === k ? 'on' : ''} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{n} <em>{nf(cuentas[k])}</em></button>
                          ))}
                        </div>
                      </div>
                      <div className="fa-xw" style={{ maxHeight: 440 }}>
                        <table className="fa-xg">
                          <thead><tr><th>Fila</th><th>Póliza</th><th>Recibo</th><th>Riesgo</th><th>Fecha</th><th>Tipo</th><th className="n">Prima neta</th><th className="n">Impuesto</th><th className="n">Importe</th><th className="n">Comisión</th><th className="n">Líquido</th><th className="act"></th></tr></thead>
                          <tbody>
                            {filas.slice(0, 400).map(({ l, quitada, corregida, error }) => (
                              <tr key={l.recibo} className={quitada ? 'rem' : ''}>
                                <td>{nf(l.fila)}</td><td>{l.poliza}</td><td>{l.recibo}</td><td>{l.riesgo}</td><td>{esDe(l.fecha) || '—'}</td>
                                <td className={l.importe < 0 ? 'neg' : ''}>{l.tipo}{l.estado ? ` · ${l.estado}` : ''}</td>
                                <td className={`n${corregida ? ' fix' : ''}`}>{eur2(l.neta)}</td><td className={`n${corregida ? ' fix' : ''}`}>{eur2(l.impuesto)}</td>
                                <td className={`n${corregida ? ' fix' : ''}${error ? ' bad' : ''}`}>{eur2(l.importe)}</td><td className="n">{eur2(l.comision)}</td><td className="n">{eur2(l.liquido)}</td>
                                <td className="act">{quitada
                                  ? <button type="button" className="lk" onClick={() => { registrar(l.recibo, 'Línea', 'Quitada del recibo', 'Recuperada', ''); setEdiciones(p => { const n = { ...p }; delete n[l.recibo]; return n; }); }}>Restaurar</button>
                                  : <button type="button" className="lk" onClick={() => abrirLinea(l.recibo)}>Corregir</button>}</td>
                              </tr>
                            ))}
                            {filas.length === 0 && <tr><td colSpan={12} className="vacio">Ninguna línea coincide.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      {filas.length > 400 && <p className="fa-note">Se muestran las 400 primeras de {nf(filas.length)}. Usa el buscador o los filtros para llegar a una concreta.</p>}
                      {cambios.length > 0 && (
                        <details className="fa-det">
                          <summary>Cambios registrados · {nf(cambios.length)}</summary>
                          <ul>{cambios.map((c, i) => <li key={i}>{c.recibo} · {c.campo}: {c.antes} → {c.despues}{c.motivo ? ` · ${c.motivo}` : ''}</li>)}</ul>
                        </details>
                      )}
                    </>
                  )}
                </details>
              </div>
            </section>
          )}

          {/* Histórico */}
          <section className="fa-hist" ref={historicoRef}>
            <div className="sh">
              <h3>Histórico</h3>
              <p>{historico.length === 0 ? 'Todavía no hay recibos generados.' : `${nf(activos.length)} ${activos.length === 1 ? 'recibo activo' : 'recibos activos'} · ${eur2(totalActivos)} · líquido ${eur2(liquidoActivos)}`}</p>
            </div>
            {historico.length > 0 && (
              <div className="tscroll">
                <table className="tbl static">
                  <thead><tr><th>Recibo</th><th>Operación</th><th>Periodo</th><th>Generado</th><th>Importe total</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {historico.map(f => (
                      <tr key={f.id} className={recienGenerado === f.id ? 'fa-flash' : ''} style={f.estado === 'emitida' ? undefined : { opacity: 0.72 }}>
                        <td><span className="fa-mono">{f.numero}</span><div className="muted">{f.tomador_nombre} · {nf(f.recibos)} {f.recibos === 1 ? 'recibo' : 'recibos'}</div></td>
                        <td>{OPERACION[f.serie] ?? f.serie}</td>
                        <td>{f.texto_periodo.split(':')[0].replace(/^REGULARIZACIÓN\s+/i, '').toLowerCase().replace(/^./, c => c.toUpperCase())}</td>
                        <td>{fechaHora(f.creado_en)}<div className="muted">{f.creado_por}</div></td>
                        <td><b>{eur2(f.importe)}</b></td>
                        <td>{f.estado === 'emitida'
                          ? <span className="tag" style={{ ['--c' as string]: 'var(--ok)' }}>Activo</span>
                          : <><span className="tag" style={{ ['--c' as string]: 'var(--quiet)' }}>Anulado</span><div className="muted">{f.motivo_anulacion}</div></>}</td>
                        <td>
                          <div className="fa-acts">
                            <button type="button" className="fa-act" disabled={!!emitiendo} onClick={() => descargarDelHistorico(f)}>Descargar</button>
                            <button type="button" className="fa-act fa-dots" aria-haspopup="true" aria-expanded={menuFila?.factura.id === f.id} aria-label={`Más acciones de ${f.numero}`}
                              onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenuFila(menuFila?.factura.id === f.id ? null : { factura: f, x: Math.max(8, r.right - 190), y: r.bottom + 4 > window.innerHeight - 100 ? r.top - 92 : r.bottom + 4 }); }}>⋯</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Barra fija: número, importe total y Generar siempre a la vista */}
          {subido && (
            <div className="fa-fbar fa-in">
              <div className="in">
                <div className="who"><span className="fa-mono">{numero || '—'}</span><span>{OPERACION[tipo]}{fraccion ? ` · ${capital(nombreFraccion(fraccion, meses))}` : ''}</span></div>
                <div className="amt"><small>Importe total</small><b>{eur2(total.importe)}</b></div>
                <span className={`msg${bloqueos > 0 ? ' bad' : ''}`}>{bloqueos > 0 ? `Resuelve ${nf(bloqueos)} ${bloqueos === 1 ? 'problema' : 'problemas'} para generar` : avisos.length > 0 ? `Listo para generar · ${nf(avisos.length)} ${avisos.length === 1 ? 'aviso' : 'avisos'}` : 'Listo para generar'}</span>
                <button type="button" className="btn" disabled={!puedeGenerar} onClick={() => setModal({ tipo: 'generar' })}>Generar</button>
              </div>
            </div>
          )}
        </>
      )}

      <input ref={fileRef} type="file" accept=".xls,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f); }} />

      {/* Paneles laterales */}
      <DetailDrawer isOpen={panel?.tipo === 'config'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'config' && cfg && <PanelConfig cfg={cfg} onGuardar={async n => { if (await guardarConfig(n)) { setPanel(null); avisar('Datos de facturación guardados.'); } }} onCancelar={() => setPanel(null)} />}
      </DetailDrawer>
      <DetailDrawer isOpen={panel?.tipo === 'linea'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'linea' && lineaAbierta && (
          <PanelLinea
            key={panel.recibo} original={lineaAbierta} edicion={ediciones[panel.recibo]} onCancelar={() => setPanel(null)}
            onGuardar={(v, mot) => {
              const prev = ediciones[panel.recibo]; const base = prev && !('quitada' in prev) ? prev : lineaAbierta;
              (['neta', 'impuesto', 'importe'] as const).forEach(c => { if (base[c] !== v[c]) registrar(panel.recibo, c === 'neta' ? 'Prima neta' : c === 'impuesto' ? 'Impuesto' : 'Importe', eur2(base[c]), eur2(v[c]), mot); });
              setEdiciones(p => ({ ...p, [panel.recibo]: v })); setPanel(null);
            }}
            onQuitar={mot => { registrar(panel.recibo, 'Línea', 'Incluida', 'Quitada del recibo', mot); setEdiciones(p => ({ ...p, [panel.recibo]: { quitada: true } })); setPanel(null); }}
            onRestaurar={() => { registrar(panel.recibo, 'Línea', 'Corregida', 'Como en el Excel', ''); setEdiciones(p => { const n = { ...p }; delete n[panel.recibo]; return n; }); setPanel(null); }}
          />
        )}
      </DetailDrawer>

      {/* Capas sobre la página */}
      {typeof document !== 'undefined' && createPortal(
        <>
          {arrastrando && <div className="fa-dropov"><div><b>Suelta el Excel de recibos</b><span>ORION lo lee y propone operación, periodo, fecha y número.</span></div></div>}
          {menuFila && (
            <div className="fa-rowmenu" role="menu" style={{ left: menuFila.x, top: menuFila.y }} onClick={e => e.stopPropagation()}>
              {menuFila.factura.estado === 'emitida'
                ? <button type="button" role="menuitem" onClick={() => { setModal({ tipo: 'anular', factura: menuFila.factura }); setMenuFila(null); }}>Anular recibo</button>
                : <button type="button" role="menuitem" disabled>Ya anulado</button>}
              <button type="button" role="menuitem" className="dng" onClick={() => { setModal({ tipo: 'borrar', factura: menuFila.factura }); setMenuFila(null); }}>Borrar recibo…</button>
            </div>
          )}
          {modal && (
            <div className="fa-mw" onMouseDown={e => { if (e.target === e.currentTarget) cerrarModal(); }}>
              <div className="fa-mdl" role="alertdialog" aria-modal="true">
                {modal.tipo === 'generar' && cfg && documentos[0] && (
                  <>
                    <p className="over">Generar</p>
                    <h3>Confirma la generación</h3>
                    <p className="desc">Se crean los documentos y se guardan en el histórico. Después no se puede generar otra vez esta operación para este periodo sin borrar antes el recibo.</p>
                    <dl className="fa-sum">
                      <div><dt>Número</dt><dd className="fa-mono">{numero}</dd></div>
                      <div><dt>Operación y periodo</dt><dd>{OPERACION[tipo]} · {capital(documentos[0].nombrePeriodo)}</dd></div>
                      <div><dt>Importe total</dt><dd><b>{eur2(total.importe)}</b> · {nf(documentos.length)} {documentos.length === 1 ? 'documento' : 'documentos (uno por tomador)'}</dd></div>
                      <div><dt>Carpeta</dt><dd className="fa-mono">{nombreCarpeta(cfg, documentos[0])}</dd></div>
                      {avisos.length > 0 && <div><dt>Avisos</dt><dd>{nf(avisos.length)} sin resolver (no impiden generar)</dd></div>}
                    </dl>
                    <div className="act">
                      <button type="button" className="mini" onClick={cerrarModal} disabled={!!emitiendo}>Volver a revisar</button>
                      <button type="button" className="btn" onClick={emitir} disabled={!!emitiendo} autoFocus>{emitiendo || 'Generar recibos'}</button>
                    </div>
                  </>
                )}
                {(modal.tipo === 'anular' || modal.tipo === 'borrar') && (
                  <>
                    <p className="over">Recibo {modal.factura.numero}</p>
                    <h3>{modal.tipo === 'borrar' ? 'Borrar recibo' : 'Anular recibo'}</h3>
                    <p className="desc">
                      {OPERACION[modal.factura.serie]} · {modal.factura.tomador_nombre} · {eur2(modal.factura.importe)}.{' '}
                      {modal.tipo === 'borrar'
                        ? 'Se elimina del todo y no se puede deshacer. El periodo quedará libre para volver a generarlo.'
                        : 'El recibo se conserva en el histórico pero deja de sumar. Sus recibos quedan libres para generar la corrección.'}
                    </p>
                    {modal.tipo === 'anular' && (
                      <div className="fld">
                        <label htmlFor="fa-mot">Motivo <span className="req">*</span></label>
                        <textarea id="fa-mot" className="inp" rows={3} placeholder="Por qué se anula este recibo" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
                      </div>
                    )}
                    <div className="ferr" role="alert">{errorModal}</div>
                    <div className="act">
                      <button type="button" className="mini" onClick={cerrarModal} disabled={!!emitiendo}>Cancelar</button>
                      <button type="button" className={`btn${modal.tipo === 'borrar' ? ' dng' : ''}`} onClick={retirar} disabled={!!emitiendo}>{emitiendo || (modal.tipo === 'borrar' ? 'Borrar definitivamente' : 'Anular recibo')}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>, document.body)}
    </div>
  );
}
