'use client';

// ─── FACTURACIÓN DE FLOTAS ───────────────────────────────────────────────────
// Una flota contratada cada vez. Se sube el Excel de la emisión o fracción (RC) y, si lo hay, el de la
// regularización (RW); ORION los comprueba, calcula los recibos y entrega la carpeta TRABAJO / ENVIAR.
// Las reglas viven en core/flotas/facturacion.ts; el histórico y el control de doble facturación, en orion-api.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import {
  cargarCarpetasDelServidor, cargarCorredoresDelServidor, leerCarpetasDeSessionStorage, leerCorredoresDeSessionStorage,
  type Corredor, type FlotaCarpeta,
} from '@/core/flotas';
import {
  avisosDeFechas, comprobarImportes, conComision, diaDe, esDe, fraccionAnterior, fraccionDe, fraccionesDelCiclo, importeDe,
  inicioCicloDe, isoDe, leerRecibos, moverMeses, numeroRecibo, resumir, textoPeriodo, tomadorDe,
  MESES_PERIODICIDAD, NOMBRE_PERIODICIDAD,
  type Fraccion, type LecturaRecibos, type LineaRecibo, type Serie, type TomadorFacturacion,
} from '@/core/flotas/facturacion';
import { esCifValido } from '@/core/validators/cif';
import { eur2, nf } from '@/lib/fmt';
import { construirZip, inicioDesdeVencimiento, type CambioLinea, type ConfigFacturacion, type DocumentoFactura } from './generar';

const SERIES: Serie[] = ['RC', 'RW'];
const NOMBRE_SERIE: Record<Serie, string> = { RC: 'Emisión o fracción', RW: 'Regularización' };
const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'cuatrimestral', 'semestral', 'anual'];

interface Subido { file: File; lectura: LecturaRecibos; sha256: string }
interface FacturaHist {
  id: string; numero: string; serie: Serie; tomador_nombre: string; vencimiento: string; estado: string; recibos: number;
  neta: number; impuesto: number; importe: number; comision: number; liquido: number; creado_por: string; creado_en: string;
  anulada_por?: string; anulada_en?: string; motivo_anulacion?: string;
}
interface YaFacturado { recibo: string; numero: string; flota_nombre: string; tomador_nombre: string; creado_en: string }
type Edicion = { quitada: true } | { neta: number; impuesto: number; importe: number };

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now()}${Math.random().toString(16).slice(2)}`);
const fechaHora = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

async function huella(buf: ArrayBuffer): Promise<string> {
  try {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

function configInicial(c: FlotaCarpeta, corredor: Corredor | null): ConfigFacturacion {
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

export default function FacturacionPage() {
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [busca, setBusca] = useState('');
  const [flotaId, setFlotaId] = useState('');

  const [cfg, setCfg] = useState<ConfigFacturacion | null>(null);
  const [cfgGuardada, setCfgGuardada] = useState(false);
  const [historico, setHistorico] = useState<FacturaHist[]>([]);
  const [cargandoFlota, setCargandoFlota] = useState(false);
  const [errorFlota, setErrorFlota] = useState('');

  const [subidos, setSubidos] = useState<Partial<Record<Serie, Subido>>>({});
  const [leyendo, setLeyendo] = useState<Serie | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<Partial<Record<Serie, string>>>({});
  const [vencimiento, setVencimiento] = useState('');
  const [ediciones, setEdiciones] = useState<Record<string, Edicion>>({});
  const [cambios, setCambios] = useState<CambioLinea[]>([]);
  const [textoManual, setTextoManual] = useState<Partial<Record<Serie, string>>>({});
  const [yaFacturados, setYaFacturados] = useState<YaFacturado[]>([]);
  const [revisado, setRevisado] = useState(false);

  const [verSerie, setVerSerie] = useState<Serie>('RC');
  const [mostradas, setMostradas] = useState(40);
  const [panel, setPanel] = useState<null | { tipo: 'config' } | { tipo: 'linea'; serie: Serie; recibo: string } | { tipo: 'anular'; factura: FacturaHist }>(null);
  const [emitiendo, setEmitiendo] = useState('');
  const [errorEmitir, setErrorEmitir] = useState('');
  const [resultado, setResultado] = useState<{ blob: Blob; nombre: string; numeros: string[] } | null>(null);
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = useCallback((t: string) => { setToast(t); if (toastRef.current) clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(''), 3600); }, []);

  // ── Carga inicial: flotas contratadas, corredores y usuario ──
  useEffect(() => {
    const c = leerCarpetasDeSessionStorage(true); if (c) setCarpetas(c);
    const b = leerCorredoresDeSessionStorage(); if (b) setCorredores(b);
    let vivo = true;
    Promise.all([cargarCarpetasDelServidor(undefined, true), cargarCorredoresDelServidor()])
      .then(([fs, cs]) => { if (vivo) { setCarpetas(fs); setCorredores(cs); } })
      .catch(() => { if (vivo) avisar('No se pudo conectar con el servidor. Los datos pueden no estar actualizados.'); })
      .finally(() => { if (vivo) setCargando(false); });
    fetch('/api/auth/me').then(r => r.json()).then(d => { if (vivo && d?.username) setUsuario(d.username); }).catch(() => {});
    return () => { vivo = false; };
  }, [avisar]);

  const contratadas = useMemo(() => carpetas.filter(c => c.estado === 'CONTRATADA').sort((a, b) => a.nombre.localeCompare(b.nombre)), [carpetas]);
  const corredorDe = useCallback((c: FlotaCarpeta | null) => corredores.find(x => x.id === c?.corredor_id) ?? null, [corredores]);
  const flota = useMemo(() => carpetas.find(c => c.id === flotaId) ?? null, [carpetas, flotaId]);
  const encontradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (q ? contratadas.filter(c => c.nombre.toLowerCase().includes(q) || (corredorDe(c)?.nombre ?? '').toLowerCase().includes(q) || (c.header?.cif ?? '').toLowerCase().includes(q)) : contratadas).slice(0, 8);
  }, [busca, contratadas, corredorDe]);

  const limpiarTrabajo = () => {
    setSubidos({}); setErrorArchivo({}); setVencimiento(''); setEdiciones({}); setCambios([]); setTextoManual({});
    setYaFacturados([]); setRevisado(false); setResultado(null); setErrorEmitir(''); setMostradas(40);
  };

  const cargarFlota = useCallback(async (c: FlotaCarpeta) => {
    setCargandoFlota(true); setErrorFlota('');
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(c.id)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'No se pudieron leer los datos de facturación.');
      const guardada = d.config && typeof d.config === 'object' ? d.config as ConfigFacturacion : null;
      setCfg(guardada ?? configInicial(c, corredores.find(x => x.id === c.corredor_id) ?? null));
      setCfgGuardada(!!guardada);
      setHistorico(Array.isArray(d.facturas) ? d.facturas : []);
    } catch (e) {
      setCfg(null); setHistorico([]);
      setErrorFlota(e instanceof Error ? e.message : 'No se pudieron leer los datos de facturación.');
    } finally { setCargandoFlota(false); }
  }, [corredores]);

  const elegirFlota = (c: FlotaCarpeta) => { setFlotaId(c.id); setBusca(''); limpiarTrabajo(); setCfg(null); cargarFlota(c); };

  const guardarConfig = async (nueva: ConfigFacturacion): Promise<boolean> => {
    if (!flota) return false;
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(flota.id)}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: nueva }) });
      if (!res.ok) throw new Error();
      setCfg(nueva); setCfgGuardada(true);
      return true;
    } catch { avisar('No se pudieron guardar los datos de facturación.'); return false; }
  };

  // ── Lectura de un Excel ──
  const subir = async (serie: Serie, file: File) => {
    setLeyendo(serie); setErrorArchivo(p => ({ ...p, [serie]: '' })); setResultado(null); setRevisado(false);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      const lectura = leerRecibos(wb.SheetNames.map(n => ({ nombre: n, filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' }) })));
      if (lectura.lineas.length === 0) { setErrorArchivo(p => ({ ...p, [serie]: lectura.errores[0] ?? 'El archivo no tiene recibos.' })); return; }
      setSubidos(p => ({ ...p, [serie]: { file, lectura, sha256: '' } }));
      huella(buf).then(h => setSubidos(p => (p[serie]?.file === file ? { ...p, [serie]: { ...p[serie]!, sha256: h } } : p)));
      // las ediciones de esa serie ya no valen para otro archivo
      setEdiciones(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(serie + '|'))));
      setCambios(p => p.filter(c => c.serie !== serie));
      setVerSerie(serie); setMostradas(40);
    } catch {
      setErrorArchivo(p => ({ ...p, [serie]: 'No se ha podido leer el archivo. Comprueba que es el Excel de recibos (.xls o .xlsx).' }));
    } finally { setLeyendo(null); }
  };
  const quitarArchivo = (serie: Serie) => {
    setSubidos(p => { const n = { ...p }; delete n[serie]; return n; });
    setEdiciones(p => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith(serie + '|'))));
    setCambios(p => p.filter(c => c.serie !== serie)); setResultado(null); setRevisado(false);
  };

  // ── Cálculo ──
  const meses = MESES_PERIODICIDAD[cfg?.periodicidad ?? ''] ?? 0;
  const ancla = useMemo(() => diaDe(cfg?.inicioCiclo ?? ''), [cfg?.inicioCiclo]);
  const pct = cfg?.corredor.comision ?? 0;

  const lineas = useMemo(() => {
    const out: Partial<Record<Serie, LineaRecibo[]>> = {};
    for (const s of SERIES) {
      const sub = subidos[s]; if (!sub) continue;
      const vivas: LineaRecibo[] = [];
      for (const l of sub.lectura.lineas) {
        const e = ediciones[`${s}|${l.recibo}`];
        if (e && 'quitada' in e) continue;
        vivas.push(e ? { ...l, ...e } : l);
      }
      out[s] = conComision(vivas, pct);
    }
    return out;
  }, [subidos, ediciones, pct]);

  // Fechas de referencia que traen los archivos
  const referencia = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const l of lineas.RC ?? []) if (l.fecha) cuenta.set(l.fecha, (cuenta.get(l.fecha) ?? 0) + 1);
    const modaRC = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const maxRW = (lineas.RW ?? []).reduce((m, l) => (l.fecha > m ? l.fecha : m), '');
    return { modaRC, maxRW };
  }, [lineas]);

  const opcionesVenc = useMemo((): Fraccion[] => {
    if (!ancla || !meses) return [];
    const ref = diaDe(referencia.modaRC || referencia.maxRW) ?? (() => { const h = new Date(); return { y: h.getFullYear(), m: h.getMonth() + 1, d: h.getDate() }; })();
    const ciclo = inicioCicloDe(ancla, ref);
    return [-12, 0, 12].flatMap(k => fraccionesDelCiclo(moverMeses(ciclo, k), meses));
  }, [ancla, meses, referencia]);

  // Vencimiento propuesto: la fecha de los recibos RC; con solo RW, el primer vencimiento posterior a sus movimientos
  useEffect(() => {
    if (opcionesVenc.length === 0) return;
    if (vencimiento && opcionesVenc.some(f => f.desde === vencimiento)) return;
    const prop = opcionesVenc.find(f => f.desde === referencia.modaRC) ?? (referencia.maxRW ? opcionesVenc.find(f => f.desde > referencia.maxRW) : undefined);
    setVencimiento(prop?.desde ?? '');
  }, [opcionesVenc, referencia, vencimiento]);

  const fraccion = useMemo(() => (ancla && meses && vencimiento ? fraccionDe(ancla, meses, diaDe(vencimiento)!) : null), [ancla, meses, vencimiento]);
  const anterior = useMemo(() => (ancla && meses && fraccion ? fraccionAnterior(ancla, meses, fraccion) : null), [ancla, meses, fraccion]);
  const textoDe = useCallback((s: Serie) => textoManual[s] ?? (fraccion ? textoPeriodo(s, meses, fraccion, anterior) : ''), [textoManual, fraccion, anterior, meses]);

  // Reparto por tomador de facturación
  const reparto = useMemo(() => {
    const porTomador = new Map<string, { tomador: TomadorFacturacion; series: Partial<Record<Serie, LineaRecibo[]>> }>();
    const desconocidos = new Map<string, number>();
    for (const s of SERIES) {
      for (const l of lineas[s] ?? []) {
        const t = tomadorDe(l.tomador, cfg?.tomadores ?? []);
        if (!t) { desconocidos.set(l.tomador || '(sin tomador)', (desconocidos.get(l.tomador || '(sin tomador)') ?? 0) + 1); continue; }
        const g = porTomador.get(t.id) ?? { tomador: t, series: {} };
        (g.series[s] ??= []).push(l);
        porTomador.set(t.id, g);
      }
    }
    return { grupos: [...porTomador.values()], desconocidos: [...desconocidos.entries()] };
  }, [lineas, cfg?.tomadores]);

  // Recibos ya facturados (en cualquier flota)
  const claveRecibos = useMemo(() => SERIES.flatMap(s => (lineas[s] ?? []).map(l => l.recibo)).join(','), [lineas]);
  useEffect(() => {
    if (!flotaId || !claveRecibos) { setYaFacturados([]); return; }
    let vivo = true;
    fetch(`/api/facturacion/${encodeURIComponent(flotaId)}/comprobar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recibos: claveRecibos.split(',') }) })
      .then(r => r.json()).then(d => { if (vivo) setYaFacturados(Array.isArray(d?.ya_facturados) ? d.ya_facturados : []); }).catch(() => {});
    return () => { vivo = false; };
  }, [flotaId, claveRecibos, historico]);

  const faltan = useMemo(() => faltaEnConfig(cfg), [cfg]);
  const hayArchivos = !!(subidos.RC || subidos.RW);

  const errores = useMemo(() => {
    const e: string[] = [];
    for (const s of SERIES) for (const x of subidos[s]?.lectura.errores ?? []) e.push(`${s} · ${x}`);
    e.push(...comprobarImportes(lineas));
    if (reparto.desconocidos.length > 0) e.push(`Hay tomadores del Excel sin reconocer: ${reparto.desconocidos.map(([n, c]) => `${n} (${nf(c)})`).join(', ')}. Asígnalos más abajo.`);
    if (yaFacturados.length > 0) {
      const por = new Map<string, number>();
      for (const y of yaFacturados) por.set(`${y.numero} de ${y.flota_nombre}`, (por.get(`${y.numero} de ${y.flota_nombre}`) ?? 0) + 1);
      e.push(`${nf(yaFacturados.length)} ${yaFacturados.length === 1 ? 'recibo ya está facturado' : 'recibos ya están facturados'}: ${[...por.entries()].map(([k, n]) => `${nf(n)} en ${k}`).join('; ')}. Para corregir, anula antes ese documento en el histórico.`);
    }
    if (hayArchivos && cfg && faltan.length === 0 && !fraccion) e.push('Elige el vencimiento de la fracción que se factura.');
    return e;
  }, [subidos, lineas, reparto.desconocidos, yaFacturados, hayArchivos, cfg, faltan, fraccion]);

  const avisos = useMemo(() => {
    if (!fraccion) return [] as string[];
    return SERIES.flatMap(s => avisosDeFechas(s, lineas[s] ?? [], fraccion, anterior, meses).map(a => `${s} · ${a}`));
  }, [lineas, fraccion, anterior, meses]);

  const documentos = useMemo((): DocumentoFactura[] => {
    if (!cfg || !fraccion) return [];
    const docs: DocumentoFactura[] = [];
    for (const g of reparto.grupos) for (const s of SERIES) {
      const ls = g.series[s]; const sub = subidos[s];
      if (!ls || ls.length === 0 || !sub) continue;
      docs.push({
        id: '', serie: s, tomador: g.tomador, numero: numeroRecibo(s, fraccion.desde), vencimiento: fraccion.desde, textoPeriodo: textoDe(s),
        inicioCiclo: fraccion.inicioCiclo, renovacion: fraccion.renovacion, lineas: ls, resumen: resumir(ls), archivo: sub.file.name, sha256: sub.sha256,
        excluidas: sub.lectura.excluidas, avisos: avisos.filter(a => a.startsWith(s + ' ·')), cambios: cambios.filter(c => c.serie === s),
      });
    }
    return docs;
  }, [cfg, fraccion, reparto.grupos, subidos, textoDe, avisos, cambios]);

  const puedeEmitir = hayArchivos && faltan.length === 0 && errores.length === 0 && documentos.length > 0 && revisado && !emitiendo;
  useEffect(() => { setRevisado(false); }, [claveRecibos, vencimiento, pct]);

  // ── Emitir ──
  const emitir = async () => {
    if (!flota || !cfg || !puedeEmitir) return;
    setErrorEmitir(''); setEmitiendo('Guardando la emisión…');
    const docs = documentos.map(d => ({ ...d, id: uid() }));
    const emitidoEn = new Date().toISOString();
    try {
      const res = await fetch(`/api/facturacion/${encodeURIComponent(flota.id)}/emitir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentos: docs.map(d => ({
          id: d.id, flota: cfg.flota, tomador: { id: d.tomador.id, nombre: d.tomador.nombre, cif: d.tomador.cif }, serie: d.serie, vencimiento: d.vencimiento,
          numero: d.numero, texto_periodo: d.textoPeriodo, pct_comision: cfg.corredor.comision, totales: d.resumen, archivo: d.archivo, sha256: d.sha256,
          recibos: d.lineas.map(l => l.recibo),
          data: { cfg, lineas: d.lineas, cambios: d.cambios, avisos: d.avisos, excluidas: d.excluidas, inicioCiclo: d.inicioCiclo, renovacion: d.renovacion, tomador: d.tomador },
        })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(j?.ya_facturados)) setYaFacturados(j.ya_facturados);
        throw new Error(j?.error || 'No se pudo guardar la emisión.');
      }
    } catch (e) {
      setEmitiendo(''); setErrorEmitir(e instanceof Error ? e.message : 'No se pudo guardar la emisión.');
      return;
    }
    // La emisión ya está guardada. Si la carpeta fallara, se puede volver a descargar desde el histórico.
    try {
      const zip = await construirZip({ cfg, docs, originales: { RC: subidos.RC?.file, RW: subidos.RW?.file }, usuario, emitidoEn }, setEmitiendo);
      setResultado({ ...zip, numeros: docs.map(d => d.numero) });
      const { saveAs } = await import('file-saver');
      saveAs(zip.blob, zip.nombre);
    } catch {
      setErrorEmitir('La emisión está guardada, pero no se pudo preparar la carpeta. Descárgala desde el histórico.');
    }
    setEmitiendo('');
    setSubidos({}); setEdiciones({}); setCambios([]); setTextoManual({}); setRevisado(false);
    cargarFlota(flota);
  };

  const descargarDelHistorico = async (f: FacturaHist) => {
    setEmitiendo(`Preparando ${f.numero}…`);
    try {
      const res = await fetch(`/api/facturacion/factura/${encodeURIComponent(f.id)}`);
      const d = await res.json();
      if (!res.ok || !d?.data?.cfg) throw new Error();
      const ls = d.data.lineas as LineaRecibo[];
      const doc: DocumentoFactura = {
        id: d.id, serie: d.serie, tomador: d.data.tomador, numero: d.numero, vencimiento: d.vencimiento, textoPeriodo: d.texto_periodo,
        inicioCiclo: d.data.inicioCiclo, renovacion: d.data.renovacion, lineas: ls, resumen: resumir(ls), archivo: d.archivo, sha256: d.sha256,
        excluidas: d.data.excluidas ?? [], avisos: d.data.avisos ?? [], cambios: d.data.cambios ?? [],
      };
      const zip = await construirZip({ cfg: d.data.cfg, docs: [doc], originales: {}, usuario: d.creado_por, emitidoEn: d.creado_en });
      const { saveAs } = await import('file-saver');
      saveAs(zip.blob, `${zip.nombre.replace(/\.zip$/, '')}_${d.numero}.zip`);
    } catch { avisar('No se pudo preparar la descarga.'); }
    setEmitiendo('');
  };

  // ── Edición de una línea ──
  const lineaAbierta = panel?.tipo === 'linea' ? subidos[panel.serie]?.lectura.lineas.find(l => l.recibo === panel.recibo) ?? null : null;
  const registrar = (serie: Serie, recibo: string, campo: string, antes: string, despues: string, motivo: string) =>
    setCambios(p => [...p, { serie, recibo, campo, antes, despues, motivo, usuario, fecha: new Date().toISOString() }]);

  const filasVisibles = lineas[verSerie] ?? [];
  const totalFlota = (s: Serie) => resumir(lineas[s] ?? []);

  // ───────────────────────────── Vista ─────────────────────────────
  return (
    <div className="pg fa">
      <section className="intro" style={{ marginTop: 0, paddingTop: 0 }}>
        <div>
          <h1>Facturación</h1>
          <p>Recibos de cobro de las flotas contratadas: emisión o fracción (RC) y regularización (RW).</p>
        </div>
      </section>

      {/* 1 · Flota */}
      <section className="vzone" style={{ paddingTop: 0 }}>
        <div className="vzhead">
          <div>
            <h2>{flota ? flota.nombre : 'Elige la flota'}</h2>
            <p className="sub-desc">{flota ? `${corredorDe(flota)?.nombre ?? 'Sin corredor asignado'} · se factura una flota cada vez` : `${nf(contratadas.length)} flotas contratadas. Busca por nombre, corredor o CIF.`}</p>
          </div>
          {flota && <div className="actions"><button type="button" className="mini" onClick={() => { setFlotaId(''); setCfg(null); setHistorico([]); limpiarTrabajo(); }}>Cambiar de flota</button></div>}
        </div>
        {!flota && (
          <>
            <input className="search wide" placeholder="Buscar flota contratada…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar flota contratada" />
            <div className={`tscroll${cargando && contratadas.length === 0 ? ' is-loading' : ''}`} style={{ marginTop: 18 }}>
              <table className="tbl">
                <thead><tr><th>Flota</th><th>Corredor</th><th>Vencimiento</th><th>Vehículos</th></tr></thead>
                <tbody>
                  {encontradas.map(c => (
                    <tr key={c.id} tabIndex={0} onClick={() => elegirFlota(c)} onKeyDown={e => { if (e.key === 'Enter') elegirFlota(c); }}>
                      <td><b>{c.nombre}</b></td>
                      <td>{corredorDe(c)?.nombre ?? <span className="dim0">Sin corredor</span>}</td>
                      <td>{c.header?.fechaVencimiento || <span className="dim0">—</span>}</td>
                      <td>{c.vehiculosCount ? nf(c.vehiculosCount) : <span className="dim0">—</span>}</td>
                    </tr>
                  ))}
                  {cargando && contratadas.length === 0 && [0, 1, 2].map(i => <tr key={i}><td>Cargando</td><td>Cargando</td><td>—</td><td>—</td></tr>)}
                </tbody>
              </table>
              {!cargando && encontradas.length === 0 && <div className="empty">{contratadas.length === 0 ? 'Todavía no hay flotas contratadas.' : 'Ninguna flota contratada coincide con la búsqueda.'}</div>}
            </div>
          </>
        )}
        {flota && cargandoFlota && <p className="hint">Cargando los datos de facturación…</p>}
        {flota && errorFlota && (
          <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert">
            <h3>No se pudieron leer los datos de facturación</h3>
            <p>{errorFlota}</p>
            <div className="actions" style={{ marginTop: 14 }}><button type="button" className="mini" onClick={() => cargarFlota(flota)}>Reintentar</button></div>
          </div>
        )}
        {flota && cfg && !cargandoFlota && (
          <>
            <div className="fa-kv">
              <div><label>Ciclo anual</label><span>{fraccion ? `${esDe(fraccion.inicioCiclo)} – renovación ${esDe(fraccion.renovacion)}` : (diaDe(cfg.inicioCiclo) ? `Empieza cada ${esDe(cfg.inicioCiclo).slice(0, 5)}` : <em>Sin indicar</em>)}</span></div>
              <div><label>Periodicidad</label><span>{NOMBRE_PERIODICIDAD[meses] ?? <em>Sin indicar</em>}</span></div>
              <div><label>Corredor</label><span>{cfg.corredor.nombre || <em>Sin indicar</em>}{cfg.corredor.cif ? ` · ${cfg.corredor.cif}` : ''}</span></div>
              <div><label>Comisión</label><span>{`${String(cfg.corredor.comision).replace('.', ',')} %`}</span></div>
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

      {flota && cfg && !cargandoFlota && (
        <>
          {/* 2 · Archivos */}
          <section className="vzone">
            <div className="vzhead"><div><h2>Archivos de recibos</h2><p className="sub-desc">Tú decides qué archivo es cada serie. ORION no lo deduce del signo ni del tipo de recibo.</p></div></div>
            <div className="vtri two">
              {SERIES.map(s => {
                const sub = subidos[s]; const r = sub ? totalFlota(s) : null;
                return (
                  <div key={s}>
                    <span className="no">{s} · {NOMBRE_SERIE[s]}</span>
                    <h3>{sub ? sub.file.name : s === 'RC' ? 'Excel de la emisión o fracción' : 'Excel de la regularización'}</h3>
                    <p>{sub && r
                      ? `${nf(r.recibos)} recibos · ${nf(r.vehiculos)} vehículos · ${eur2(r.importe)}${r.negativos.recibos > 0 ? ` · ${nf(r.negativos.recibos)} en negativo (${eur2(r.negativos.importe)})` : ''}`
                      : s === 'RC' ? 'Primera emisión, renovación o fracción ordinaria. Un único recibo con el total.' : 'Altas, bajas y anulaciones del periodo anterior. Un único recibo con la suma; lo negativo resta.'}</p>
                    <div className="actions">
                      <label className={`mini filebtn${sub ? '' : ' pri'}`}>
                        {leyendo === s ? 'Leyendo…' : sub ? 'Cambiar archivo' : `Subir Excel ${s}`}
                        <input type="file" accept=".xls,.xlsx" hidden disabled={leyendo !== null} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(s, f); }} />
                      </label>
                      {sub && <button type="button" className="mini danger" onClick={() => quitarArchivo(s)}>Quitar</button>}
                    </div>
                    {sub && <p className="hint">Cabecera en la fila {nf(sub.lectura.filaCabecera)}{sub.lectura.excluidas.length > 0 ? ` · ${nf(sub.lectura.excluidas.length)} ${sub.lectura.excluidas.length === 1 ? 'fila de totales ignorada' : 'filas de totales ignoradas'}` : ''}.</p>}
                    {errorArchivo[s] && <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>{errorArchivo[s]}</p>}
                  </div>
                );
              })}
            </div>
          </section>

          {hayArchivos && (
            <>
              {/* 3 · Revisión */}
              <section className="vzone">
                <div className="vzhead">
                  <div><h2>Revisión</h2><p className="sub-desc">Comprueba los totales y los textos antes de generar. Lo que aparece aquí es lo que se imprime.</p></div>
                  <div className="fld" style={{ minWidth: 300 }}>
                    <label htmlFor="fa-venc">Vencimiento de la fracción</label>
                    <select id="fa-venc" className="select" value={vencimiento} onChange={e => { setVencimiento(e.target.value); setTextoManual({}); }} disabled={opcionesVenc.length === 0}>
                      <option value="">{opcionesVenc.length === 0 ? 'Completa antes el ciclo y la periodicidad' : 'Elige el vencimiento…'}</option>
                      {opcionesVenc.map(f => <option key={f.desde} value={f.desde}>{esDe(f.desde)} — cubre hasta {esDe(f.hasta)}</option>)}
                    </select>
                  </div>
                </div>

                {errores.length > 0 && (
                  <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert">
                    <h3>{errores.length === 1 ? 'Hay un problema que impide generar' : `Hay ${nf(errores.length)} problemas que impiden generar`}</h3>
                    <ul className="fa-list">{errores.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{errores.length > 12 && <li>…y {nf(errores.length - 12)} más.</li>}</ul>
                  </div>
                )}
                {reparto.desconocidos.length > 0 && (
                  <div className="chkbox" style={{ ['--c' as string]: 'var(--warn)' }}>
                    <h3>¿A quién se factura?</h3>
                    <p>El Excel trae nombres de tomador que esta flota todavía no tiene reconocidos. Indica a qué tomador de facturación corresponde cada uno; queda guardado para la próxima vez.</p>
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
                    <p>No impiden generar, pero conviene comprobarlos: las fechas de los recibos no encajan del todo con la fracción elegida.</p>
                    <ul className="fa-list">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  </div>
                )}

                {documentos.map(d => (
                  <div className="fa-doc" key={`${d.tomador.id}|${d.serie}`}>
                    <div className="fa-dochead">
                      <span className="plate">{d.numero}</span>
                      <div>
                        <b>{NOMBRE_SERIE[d.serie]}</b>
                        <span>{d.tomador.nombre}{d.tomador.cif ? ` · ${d.tomador.cif}` : ''}</span>
                      </div>
                    </div>
                    <div className="kpis">
                      <div className="kpi"><span className="l">Recibos</span><span className="v">{nf(d.resumen.recibos)}</span><span className="n">{nf(d.resumen.vehiculos)} vehículos{d.resumen.negativos.recibos > 0 ? <> · <b>{nf(d.resumen.negativos.recibos)}</b> en negativo</> : null}</span></div>
                      <div className="kpi"><span className="l">Prima neta</span><span className="v mny">{eur2(d.resumen.neta)}</span><span className="n">Suma del Excel</span></div>
                      <div className="kpi"><span className="l">Impuestos</span><span className="v mny">{eur2(d.resumen.impuesto)}</span><span className="n">Suma del Excel</span></div>
                      <div className="kpi"><span className="l">Importe total</span><span className="v mny">{eur2(d.resumen.importe)}</span><span className="n">Es lo que se imprime</span></div>
                      <div className="kpi"><span className="l">Líquido a abonar</span><span className="v mny">{eur2(d.resumen.liquido)}</span><span className="n">Comisión <b>{eur2(d.resumen.comision)}</b> ({String(pct).replace('.', ',')} %)</span></div>
                    </div>
                  </div>
                ))}

                {fraccion && documentos.length > 0 && (
                  <div className="fa-textos">
                    {SERIES.filter(s => documentos.some(d => d.serie === s)).map(s => (
                      <div className="fld" key={s}>
                        <label htmlFor={`fa-txt-${s}`}>Texto del periodo en el recibo {s}</label>
                        <input id={`fa-txt-${s}`} className="inp" value={textoDe(s)} onChange={e => { setTextoManual(p => ({ ...p, [s]: e.target.value })); setRevisado(false); }} />
                        {textoManual[s] !== undefined && <button type="button" className="mini" style={{ justifySelf: 'start' }} onClick={() => setTextoManual(p => { const n = { ...p }; delete n[s]; return n; })}>Volver al texto calculado</button>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Líneas */}
                <div className="fa-lhead">
                  <div className="seg" role="tablist" aria-label="Serie">
                    {SERIES.filter(s => subidos[s]).map(s => (
                      <button key={s} type="button" role="tab" aria-selected={verSerie === s} className={verSerie === s ? 'on' : ''} onClick={() => { setVerSerie(s); setMostradas(40); }}>{s} · {nf((lineas[s] ?? []).length)} recibos</button>
                    ))}
                  </div>
                  <span className="hint" style={{ margin: 0 }}>Pulsa una línea para corregirla o quitarla. Cada cambio queda registrado.</span>
                </div>
                <div className="tscroll">
                  <table className="tbl fa-lines">
                    <thead><tr><th>Recibo</th><th>Póliza</th><th>Riesgo</th><th>Fecha</th><th>Tipo</th><th>Prima neta</th><th>Impuesto</th><th>Importe</th><th>Comisión</th><th>Líquido</th></tr></thead>
                    <tbody>
                      {filasVisibles.slice(0, mostradas).map(l => {
                        const editada = !!ediciones[`${verSerie}|${l.recibo}`];
                        return (
                          <tr key={l.recibo} tabIndex={0} onClick={() => setPanel({ tipo: 'linea', serie: verSerie, recibo: l.recibo })} onKeyDown={e => { if (e.key === 'Enter') setPanel({ tipo: 'linea', serie: verSerie, recibo: l.recibo }); }}>
                            <td className="mono">{l.recibo}{editada && <div className="muted">Corregida</div>}</td>
                            <td>{l.poliza}</td><td className="mono">{l.riesgo}</td><td>{esDe(l.fecha) || '—'}</td>
                            <td>{l.importe < 0 ? <span className="venclr">{l.tipo || 'Negativo'}</span> : l.tipo}</td>
                            <td>{eur2(l.neta)}</td><td>{eur2(l.impuesto)}</td><td><b>{eur2(l.importe)}</b></td><td>{eur2(l.comision)}</td><td>{eur2(l.liquido)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filasVisibles.length > mostradas && <div className="more"><button type="button" onClick={() => setMostradas(m => m + 200)}>Ver más ({nf(filasVisibles.length - mostradas)} restantes)</button></div>}
                {cambios.length > 0 && <p className="note">{nf(cambios.length)} {cambios.length === 1 ? 'cambio registrado' : 'cambios registrados'} en esta revisión. Van al detalle interno y a la auditoría de la carpeta TRABAJO.</p>}
              </section>

              {/* 4 · Generar */}
              <section className="vzone">
                <div className="vzhead"><div><h2>Generar</h2><p className="sub-desc">Se guarda la emisión en el histórico y se descarga la carpeta de la flota con TRABAJO y ENVIAR.</p></div></div>
                <label className="fa-check">
                  <input type="checkbox" checked={revisado} onChange={e => setRevisado(e.target.checked)} disabled={errores.length > 0 || faltan.length > 0 || documentos.length === 0} />
                  <span>He revisado los importes, los textos{avisos.length > 0 ? ', los avisos' : ''} y los datos del corredor y del tomador.</span>
                </label>
                <div className="runrow">
                  <button type="button" className="btn" disabled={!puedeEmitir} onClick={emitir}>
                    {emitiendo || `Generar ${documentos.map(d => d.numero).filter((n, i, a) => a.indexOf(n) === i).join(' y ') || 'recibos'}`}
                  </button>
                </div>
                {faltan.length > 0 && <p className="hint">Completa antes los datos de facturación de la flota.</p>}
                {errorEmitir && <div className="chkbox" style={{ ['--c' as string]: 'var(--danger)' }} role="alert"><h3>No se ha generado</h3><p>{errorEmitir}</p></div>}
              </section>
            </>
          )}

          {resultado && (
            <section className="vzone">
              <div className="chkbox" style={{ ['--c' as string]: 'var(--ok)', marginTop: 0 }} role="status">
                <h3>{resultado.numeros.filter((n, i, a) => a.indexOf(n) === i).join(' y ')} generado{resultado.numeros.length > 1 ? 's' : ''}</h3>
                <p>La emisión está guardada en el histórico y la carpeta se ha descargado como {resultado.nombre}.</p>
                <div className="actions" style={{ marginTop: 14 }}>
                  <button type="button" className="mini pri" onClick={async () => { const { saveAs } = await import('file-saver'); saveAs(resultado.blob, resultado.nombre); }}>Descargar de nuevo</button>
                </div>
              </div>
            </section>
          )}

          {/* 5 · Histórico */}
          <section className="vzone">
            <div className="vzhead"><div><h2>Histórico</h2><p className="sub-desc">Recibos emitidos de esta flota. Un recibo de la compañía no se puede facturar dos veces.</p></div></div>
            {historico.length === 0 ? <div className="empty">Esta flota todavía no tiene recibos emitidos.</div> : (
              <div className="tscroll">
                <table className="tbl static">
                  <thead><tr><th>Número</th><th>Tomador</th><th>Vencimiento</th><th>Recibos</th><th>Importe</th><th>Emitido</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {historico.map(f => (
                      <tr key={f.id}>
                        <td className="mono">{f.numero}</td>
                        <td>{f.tomador_nombre}</td>
                        <td>{esDe(f.vencimiento)}</td>
                        <td>{nf(f.recibos)}</td>
                        <td><b>{eur2(f.importe)}</b></td>
                        <td>{fechaHora(f.creado_en)}<div className="muted">{f.creado_por}</div></td>
                        <td>{f.estado === 'emitida'
                          ? <span className="tag" style={{ ['--c' as string]: 'var(--ok)' }}>Emitido</span>
                          : <><span className="tag" style={{ ['--c' as string]: 'var(--quiet)' }}>Anulado</span><div className="muted">{f.motivo_anulacion}</div></>}</td>
                        <td>
                          <div className="actions" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="mini" disabled={!!emitiendo} onClick={() => descargarDelHistorico(f)}>Descargar</button>
                            {f.estado === 'emitida' && <button type="button" className="mini danger" onClick={() => setPanel({ tipo: 'anular', factura: f })}>Anular</button>}
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

      {/* Paneles */}
      <DetailDrawer isOpen={panel?.tipo === 'config'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'config' && cfg && <PanelConfig cfg={cfg} onGuardar={async n => { if (await guardarConfig(n)) { setPanel(null); avisar('Datos de facturación guardados.'); } }} onCancelar={() => setPanel(null)} />}
      </DetailDrawer>
      <DetailDrawer isOpen={panel?.tipo === 'linea'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'linea' && lineaAbierta && (
          <PanelLinea
            key={`${panel.serie}|${panel.recibo}`}
            original={lineaAbierta} edicion={ediciones[`${panel.serie}|${panel.recibo}`]} serie={panel.serie}
            onCancelar={() => setPanel(null)}
            onGuardar={(v, motivo) => {
              const k = `${panel.serie}|${panel.recibo}`; const prev = ediciones[k]; const base = prev && !('quitada' in prev) ? prev : lineaAbierta;
              (['neta', 'impuesto', 'importe'] as const).forEach(c => { if (base[c] !== v[c]) registrar(panel.serie, panel.recibo, c === 'neta' ? 'Prima neta' : c === 'impuesto' ? 'Impuesto' : 'Importe', eur2(base[c]), eur2(v[c]), motivo); });
              setEdiciones(p => ({ ...p, [k]: v })); setRevisado(false); setPanel(null);
            }}
            onQuitar={motivo => { registrar(panel.serie, panel.recibo, 'Línea', 'Incluida', 'Quitada del recibo', motivo); setEdiciones(p => ({ ...p, [`${panel.serie}|${panel.recibo}`]: { quitada: true } })); setRevisado(false); setPanel(null); }}
            onRestaurar={() => { registrar(panel.serie, panel.recibo, 'Línea', 'Corregida', 'Como en el Excel', ''); setEdiciones(p => { const n = { ...p }; delete n[`${panel.serie}|${panel.recibo}`]; return n; }); setRevisado(false); setPanel(null); }}
          />
        )}
      </DetailDrawer>
      <DetailDrawer isOpen={panel?.tipo === 'anular'} onClose={() => setPanel(null)}>
        {panel?.tipo === 'anular' && (
          <PanelAnular factura={panel.factura} onCancelar={() => setPanel(null)} onHecho={() => { setPanel(null); avisar(`${panel.factura.numero} anulado.`); if (flota) cargarFlota(flota); }} />
        )}
      </DetailDrawer>

      {/* Quitadas: se pueden recuperar */}
      {Object.entries(ediciones).some(([, e]) => 'quitada' in e) && hayArchivos && (
        <section className="vzone">
          <div className="vzhead"><div><h2>Líneas quitadas</h2><p className="sub-desc">No entran en el recibo. Puedes recuperarlas.</p></div></div>
          <div className="vtags">
            {Object.entries(ediciones).filter(([, e]) => 'quitada' in e).map(([k]) => {
              const [s, rec] = k.split('|') as [Serie, string];
              return <button key={k} type="button" className="mini" onClick={() => { registrar(s, rec, 'Línea', 'Quitada del recibo', 'Recuperada', ''); setEdiciones(p => { const n = { ...p }; delete n[k]; return n; }); setRevisado(false); }}>{s} · {rec} · recuperar</button>;
            })}
          </div>
        </section>
      )}

      <div className={`fl-toast${toast ? ' on' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

// ─── Panel · datos de facturación de la flota ────────────────────────────────

function PanelConfig({ cfg, onGuardar, onCancelar }: { cfg: ConfigFacturacion; onGuardar: (c: ConfigFacturacion) => void; onCancelar: () => void }) {
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
        <div className="fld"><label htmlFor="fc-flota">Nombre de la flota en el recibo</label><input id="fc-flota" className="inp" value={c.flota} onChange={e => setC(p => ({ ...p, flota: e.target.value }))} /></div>
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
        <div className="fld"><label htmlFor="fc-cn">Razón social <span className="req">*</span></label><input id="fc-cn" className="inp" value={c.corredor.nombre} onChange={e => setCor('nombre', e.target.value)} /><div className="hint">Tal como debe salir en el recibo.</div></div>
        <div className="frow">
          <div className="fld"><label htmlFor="fc-cc">CIF <span className="req">*</span></label><input id="fc-cc" className="inp" value={c.corredor.cif} onChange={e => setCor('cif', e.target.value)} /></div>
          <div className="fld"><label htmlFor="fc-cp">Comisión (%)</label><input id="fc-cp" className="inp" inputMode="decimal" value={comision} onChange={e => setComision(e.target.value)} /><div className="hint">Se aplica a la prima neta de cada recibo.</div></div>
        </div>
        <div className="fld"><label htmlFor="fc-cd">Domicilio <span className="req">*</span></label><input id="fc-cd" className="inp" value={c.corredor.domicilio} onChange={e => setCor('domicilio', e.target.value)} /></div>

        <h4>{c.tomadores.length === 1 ? 'Tomador' : 'Tomadores'}</h4>
        <p className="hint" style={{ marginTop: -6 }}>Cada tomador recibe su propio recibo RC y RW. En «También aparece como» van los nombres con los que sale en los Excel de la compañía, uno por línea.</p>
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

// ─── Panel · corregir una línea ──────────────────────────────────────────────

function PanelLinea({ original, edicion, serie, onGuardar, onQuitar, onRestaurar, onCancelar }: {
  original: LineaRecibo; edicion?: Edicion; serie: Serie;
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
    if (!motivo.trim()) { setError('Indica el motivo del cambio: queda en la auditoría.'); return; }
    onGuardar({ neta: n, impuesto: i, importe: t }, motivo.trim());
  };

  return (
    <>
      <div className="over">{serie} · recibo {original.recibo}</div>
      <h3>Corregir línea</h3>
      <p className="desc">Póliza {original.poliza} · {original.riesgo || 'sin matrícula'} · {esDe(original.fecha) || 'sin fecha'} · {original.tipo || 'sin tipo'}. En el Excel: {eur2(original.neta)} + {eur2(original.impuesto)} = {eur2(original.importe)} (fila {nf(original.fila)}).</p>
      <div className="form">
        <div className="frow">
          <div className="fld"><label htmlFor="fl-n">Prima neta</label><input id="fl-n" className="inp" inputMode="decimal" value={neta} onChange={e => setNeta(e.target.value)} /></div>
          <div className="fld"><label htmlFor="fl-i">Impuesto</label><input id="fl-i" className="inp" inputMode="decimal" value={impuesto} onChange={e => setImpuesto(e.target.value)} /></div>
        </div>
        <div className="fld"><label htmlFor="fl-t">Importe</label><input id="fl-t" className="inp" inputMode="decimal" value={importe} onChange={e => setImporte(e.target.value)} /></div>
        <div className="fld"><label htmlFor="fl-m">Motivo del cambio <span className="req">*</span></label><textarea id="fl-m" className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} /><div className="hint">Se guarda con tu usuario y la fecha.</div></div>
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

// ─── Panel · anular un recibo emitido ────────────────────────────────────────

function PanelAnular({ factura, onHecho, onCancelar }: { factura: FacturaHist; onHecho: () => void; onCancelar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const anular = async () => {
    if (!motivo.trim()) { setError('Indica el motivo de la anulación.'); return; }
    setEnviando(true); setError('');
    try {
      const res = await fetch(`/api/facturacion/factura/${encodeURIComponent(factura.id)}/anular`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'No se pudo anular.');
      onHecho();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo anular.'); setEnviando(false); }
  };
  return (
    <>
      <div className="over">Histórico</div>
      <h3>Anular {factura.numero}</h3>
      <p className="desc">{factura.tomador_nombre} · {nf(factura.recibos)} recibos · {eur2(factura.importe)}. El documento se conserva en el histórico como anulado y sus recibos quedan libres para emitir la corrección.</p>
      <div className="form">
        <div className="fld"><label htmlFor="fan-m">Motivo <span className="req">*</span></label><textarea id="fan-m" className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
        <div className="ferr" role="alert">{error}</div>
        <div className="fact">
          <button type="button" className="btn" onClick={anular} disabled={enviando}>{enviando ? 'Anulando…' : 'Anular recibo'}</button>
          <button type="button" className="btn ghost" onClick={onCancelar}>No anular</button>
        </div>
      </div>
    </>
  );
}
