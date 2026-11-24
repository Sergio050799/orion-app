'use client';

// Paso 09 · EMISIÓN. Prepara el fichero de emisión masiva (plantilla oficial de MMT) con lo que ya se decidió
// en el estudio: vehículo identificado, coberturas confirmadas en INFORME y prima ofertada. Aquí solo se
// completan los datos que no se conocen al estudiar (ID cliente, ID flota, colectivo, valores comunes).

import React, { useMemo, useState } from 'react';
import { DetailDrawer, type DetailDrawerData } from '@/components/saas/DetailDrawer';
import { nf, eur } from '@/lib/fmt';
import type { EmisionDatos } from '@/core/flotas/carpeta';
import type { ConfigCobertura } from '@/core/flotas/catalogoCoberturas';
import type { InfoVerificacion } from '@/core/catalogo/verificacion';
import { leerErroresSistema, ventanasDeErrores, ventanasDeAceptados } from '@/core/catalogo/ventanasSistema';
import { guardarVentanas } from '@/lib/ventanasSistemaClient';
import {
  CAMPOS_COMUNES, COLUMNAS_EMISION, LISTAS_EMISION, prepararEmision, matriculaLimpia, type FilaEmision,
} from '@/core/flotas/emision';
import { aplicarResultado, numeroFichero, type AjustesPrecio, type FilaResultado, type ResumenRecalculo } from '@/core/flotas/precioObjetivo';

interface Props {
  trabajoRows: Record<string, string>[];
  catalogoSeleccion?: Record<string, string>;
  configCoberturas?: Record<string, ConfigCobertura>;
  ofertaRows: Record<string, string>[];
  emision?: EmisionDatos;
  onEmisionChange: (e: EmisionDatos) => void;
  idPerceptor?: string;
  corredorNombre?: string;
  carpetaNombre?: string;
  efectoGenerales?: string;
  periodicidadGenerales?: string;
  verificacion?: Record<string, InfoVerificacion>;
}

const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const PAGINA = 15;

/** Campo de texto que guarda al salir (evita guardar la carpeta con cada tecla). */
function CampoTexto({ id, label, valor, onCommit, placeholder, hint, requerido }: {
  id: string; label: string; valor: string; onCommit: (v: string) => void; placeholder?: string; hint?: string; requerido?: boolean;
}) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <div className="dg-fld">
      <label htmlFor={id}>{label}{requerido && <span className="req"> *</span>}</label>
      <input id={id} className="dg-inp" value={txt ?? valor} placeholder={placeholder}
        onChange={e => setTxt(e.target.value)}
        onBlur={() => { if (txt !== null && txt !== valor) onCommit(txt.trim()); setTxt(null); }} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

/** Pegar los errores que devuelve el sistema de emisión: ORION aprende el rango de años de cada ID. */
function AprenderDelSistema({ filas }: { filas: FilaEmision[] }) {
  const [txt, setTxt] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const errores = useMemo(() => leerErroresSistema(txt), [txt]);
  const ids = useMemo(() => new Set(errores.map(e => e.id)).size, [errores]);
  // ¿Los errores son de ESTA emisión? Lo son si en cada fila que citan está la misma ID que hay ahora en pantalla
  // (fila 2 del Excel = primer vehículo). Solo entonces se puede dar por aceptado el resto de filas.
  const fabric = errores.filter(e => e.campo === 'fabricacion' && e.fila !== null);
  const mismaEmision = fabric.length > 0 && fabric.every(e => filas[e.fila! - 2]?.valores.ID_VEH_MMT === e.id);
  const filasRechazadas = useMemo(() => new Set(errores.map(e => e.fila).filter((n): n is number => n !== null)), [errores]);
  const aceptadasDe = (soloSinError: boolean) => filas
    .map((f, i) => ({ fila: i + 2, id: f.valores.ID_VEH_MMT ?? '', anio: parseInt(f.valores.ANHO_FABRICACION ?? '', 10) }))
    .filter(x => x.id && Number.isFinite(x.anio) && (!soloSinError || !filasRechazadas.has(x.fila)));
  const aprender = async () => {
    setOcupado(true);
    const nuevas = ventanasDeErrores(errores);
    // Las filas de esta emisión que el sistema no rechazó quedan como «año aceptado» para su ID
    const aceptadas = mismaEmision ? ventanasDeAceptados(aceptadasDe(true)) : [];
    const donde = await guardarVentanas([...nuevas, ...aceptadas]);
    setMsg(`${nf(ids)} ${ids === 1 ? 'versión con rango aprendido' : 'versiones con rango aprendido'}${aceptadas.length > 0 ? ` y ${nf(aceptadas.length)} confirmadas por haberlas aceptado el sistema` : ''}${donde === 'servidor' ? '' : ' (solo en este navegador: el servidor no respondió)'}. En PRE-EMISIÓN pulsa «Buscar una versión que cubra el año» para corregir los vehículos afectados.`);
    setTxt('');
    setOcupado(false);
  };
  // El sistema aceptó el fichero entero (sin errores de año): todas las filas confirman su ID para su año
  const confirmarTodo = async () => {
    const lista = ventanasDeAceptados(aceptadasDe(false));
    if (lista.length === 0) return;
    if (!window.confirm(`¿El sistema de emisión ha aceptado este fichero SIN errores de año?\n\nSe guardará que estas ${lista.length} versiones admiten los años con los que se han emitido. Hazlo solo si la emisión entró completa.`)) return;
    setOcupado(true);
    const donde = await guardarVentanas(lista);
    setMsg(`${nf(lista.length)} versiones confirmadas con sus años${donde === 'servidor' ? '' : ' (solo en este navegador: el servidor no respondió)'}.`);
    setOcupado(false);
  };
  return (
    <details style={{ margin: '14px 0 4px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>¿El sistema rechazó años? Sube aquí su fichero de errores</summary>
      <p className="dg-sub" style={{ marginTop: 8 }}>
        Sube el fichero «…_ERRORES.txt» que devuelve el sistema de emisión, o pega sus líneas (por ejemplo «Error en fila 29 Causa:
        Año de fabricación 2022 debe estar entre [2018,2019] para idVehMMT=256114891»). ORION guarda el rango de años real de cada
        versión para todas las flotas: desde ese momento no vuelve a proponerla ni a dejarla pasar fuera de ese rango.
      </p>
      <div style={{ margin: '0 0 8px' }}>
        <input type="file" accept=".txt,text/plain" aria-label="Fichero de errores del sistema de emisión"
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { setTxt(await f.text()); setMsg(''); } catch { setMsg('No se ha podido leer el fichero.'); }
          }} />
      </div>
      <textarea className="dg-inp" rows={4} value={txt} onChange={e => setTxt(e.target.value)} aria-label="Errores del sistema de emisión"
        placeholder="Error en fila 29 Causa: Año de fabricación 2022 debe estar entre [2018,2019] para idVehMMT=256114891" style={{ width: '100%', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <button type="button" className="mini pri" onClick={aprender} disabled={errores.length === 0 || ocupado}>Aprender estos rangos</button>
        <button type="button" className="mini" onClick={confirmarTodo} disabled={ocupado || filas.length === 0 || txt.trim() !== ''}
          title="Úsalo cuando el sistema haya aceptado el fichero completo: ORION recordará que esas versiones admiten esos años.">
          El sistema lo aceptó todo
        </button>
        <span className="dg-sub" style={{ margin: 0 }}>{txt.trim() ? `${nf(errores.length)} ${errores.length === 1 ? 'error leído' : 'errores leídos'} · ${nf(ids)} ${ids === 1 ? 'versión' : 'versiones'}${errores.length > 0 ? (mismaEmision ? ' · son de esta emisión: el resto de filas se guardarán como aceptadas' : ' · no coinciden con las filas de esta emisión: solo se aprenden los rangos') : ''}` : msg}</span>
      </div>
    </details>
  );
}

/**
 * Recalcular PRECIO_OBJETIVO: se sube el fichero de resultado del sistema (columnas MATRICULA, PRECIO_OBJETIVO y
 * PRIMA) y ORION calcula, vehículo a vehículo, qué precio hay que enviar para que la prima salga exactamente la
 * buscada. Cada fichero que se sube afina más (con dos intentos el cálculo ya es exacto en el tramo del sistema).
 */
function RecalcularPrecio({ filas, ajustes, onChange }: {
  filas: FilaEmision[];
  ajustes?: AjustesPrecio;
  onChange: (a: AjustesPrecio | undefined) => void;
}) {
  const [resumen, setResumen] = useState<(ResumenRecalculo & { fichero: string }) | null>(null);
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);

  // Prima buscada por matrícula = el precio objetivo original (la prima ofertada del estudio)
  const objetivos = useMemo(() => {
    const o: Record<string, number> = {};
    for (const f of filas) if (f.precioBase && f.precioBase > 0) o[f.matricula] = f.precioBase;
    return o;
  }, [filas]);

  const leer = async (file: File) => {
    setLeyendo(true); setError(''); setResumen(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets['DATOS'] ?? wb.Sheets[wb.SheetNames[0]];
      const tabla = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
      // Fila de cabeceras: la primera que tenga MATRICULA, PRECIO_OBJETIVO y PRIMA
      const norm = (x: unknown) => String(x ?? '').trim().toUpperCase();
      const iCab = tabla.findIndex(r => Array.isArray(r) && ['MATRICULA', 'PRECIO_OBJETIVO', 'PRIMA'].every(k => r.some(c => norm(c) === k)));
      if (iCab < 0) { setError('El fichero no tiene las columnas MATRICULA, PRECIO_OBJETIVO y PRIMA. Sube el Excel de resultado que devuelve el sistema de emisión.'); return; }
      const cab = tabla[iCab].map(norm);
      const cM = cab.indexOf('MATRICULA'), cP = cab.indexOf('PRECIO_OBJETIVO'), cR = cab.indexOf('PRIMA');
      const leidas: FilaResultado[] = [];
      for (const r of tabla.slice(iCab + 1)) {
        const mat = matriculaLimpia(String(r?.[cM] ?? ''));
        if (!mat) continue;
        leidas.push({ matricula: mat, enviado: numeroFichero(r[cP]), obtenido: numeroFichero(r[cR]) });
      }
      if (leidas.length === 0) { setError('El fichero no tiene vehículos.'); return; }
      const res = aplicarResultado(ajustes, objetivos, leidas);
      onChange(res.ajustes);
      setResumen({ ...res, fichero: file.name });
    } catch {
      setError('No se ha podido leer el fichero. Comprueba que es el Excel de resultado del sistema de emisión.');
    } finally {
      setLeyendo(false);
    }
  };

  const lista = useMemo(() => filas
    .map(f => ({ f, a: ajustes?.[f.matricula] }))
    .filter((x): x is { f: FilaEmision; a: NonNullable<typeof x.a> } => !!x.a && !!x.f.precioBase && Math.abs(x.a.objetivo - x.f.precioBase) < 0.005)
    .sort((x, y) => (x.a.estado === 'ajustado' ? 0 : 1) - (y.a.estado === 'ajustado' ? 0 : 1)), [filas, ajustes]);
  const nExactos = lista.filter(x => x.a.estado === 'exacto').length;
  const eur2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section id="recalcular-precio" style={{ margin: '18px 0 6px', padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 6, scrollMarginTop: 80 }}>
      <p className="dg-h3" style={{ marginTop: 0 }}>Recalcular precio objetivo</p>
      <p className="dg-sub" style={{ marginTop: 6 }}>
        Sube el Excel de resultado que devuelve el sistema de emisión. ORION compara la PRIMA que ha dado cada vehículo con su
        precio objetivo original y calcula el PRECIO_OBJETIVO que hay que enviar para que salga exacta. Después descarga de nuevo
        el Excel de emisión (ya lleva los precios corregidos) y vuelve a subirlo al sistema. Si algún vehículo aún no cuadra, sube el
        nuevo resultado: con cada vuelta el cálculo es más preciso.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="mini pri" style={{ cursor: leyendo ? 'default' : 'pointer', opacity: leyendo ? 0.6 : 1 }}>
          {leyendo ? 'Leyendo…' : 'Subir resultado del sistema (.xlsx)'}
          <input type="file" accept=".xlsx,.xls" aria-label="Excel de resultado del sistema de emisión" disabled={leyendo} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) leer(f); }} />
        </label>
        {lista.length > 0 && (
          <button type="button" className="mini"
            onClick={() => { if (window.confirm('¿Quitar los precios recalculados? El Excel de emisión volverá a llevar el precio objetivo original.')) { onChange(undefined); setResumen(null); } }}>
            Quitar ajustes
          </button>
        )}
      </div>
      {error && <div className="notice" role="alert" style={{ marginTop: 8 }}>{error}</div>}
      {resumen && (
        <div className={resumen.corregidos === 0 ? 'lock' : 'notice'} role="status" style={{ marginTop: 8 }}>
          <b>{resumen.fichero}</b>
          <span>
            {nf(resumen.exactos)} {resumen.exactos === 1 ? 'vehículo ya exacto' : 'vehículos ya exactos'} · {nf(resumen.corregidos)} con precio objetivo corregido
            {resumen.masCercanos > 0 ? ` · ${nf(resumen.masCercanos)} en los que el sistema no permite la prima exacta (se deja la más cercana posible)` : ''}
            {resumen.sinPrima.length > 0 ? ` · ${nf(resumen.sinPrima.length)} sin prima en el fichero (${resumen.sinPrima.slice(0, 6).join(', ')}${resumen.sinPrima.length > 6 ? '…' : ''})` : ''}
            {resumen.noEncontradas.length > 0 ? ` · ${nf(resumen.noEncontradas.length)} no están en esta emisión (${resumen.noEncontradas.slice(0, 6).join(', ')}${resumen.noEncontradas.length > 6 ? '…' : ''})` : ''}
            {resumen.corregidos > 0 ? '. Descarga de nuevo el Excel de emisión y súbelo al sistema.' : '. Todas las primas cuadran.'}
          </span>
        </div>
      )}
      {lista.length > 0 && (
        <>
          <p className="dg-sub" style={{ marginTop: 10 }}>{nf(nExactos)} de {nf(lista.length)} vehículos con la prima exacta.</p>
          <div className="xwrap" style={{ maxHeight: 360 }}>
            <table className="xg">
              <thead>
                <tr>
                  <th>Matrícula</th><th className="n">Prima buscada</th><th className="n">Último enviado</th><th className="n">Prima obtenida</th>
                  <th className="n">Diferencia</th><th className="n">Próximo PRECIO_OBJETIVO</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(({ f, a }) => {
                  const u = a.puntos[a.puntos.length - 1];
                  const dif = u ? u.obtenido - a.objetivo : 0;
                  return (
                    <tr key={f.matricula}>
                      <td><b>{f.matricula}</b></td>
                      <td className="n">{eur2(a.objetivo)}</td>
                      <td className="n">{u ? eur2(u.enviado) : '—'}</td>
                      <td className="n">{u ? eur2(u.obtenido) : '—'}</td>
                      <td className="n" style={{ color: a.estado === 'exacto' ? undefined : 'var(--warn, #b45309)' }}>{u ? `${dif >= 0 ? '+' : '−'}${eur2(Math.abs(dif))}` : '—'}</td>
                      <td className="n"><b>{eur2(a.enviar)}</b></td>
                      <td>{a.estado === 'exacto'
                        ? <span className="cfgst confirmada">Exacta</span>
                        : a.estado === 'mas_cercano'
                          ? <span className="cfgst falta" title="El sistema salta de un céntimo a otro sin pasar por la prima buscada: este es el precio que más se acerca">Lo más cercano posible</span>
                          : <span className="cfgst propuesta">Corregido · {nf(a.puntos.length)} {a.puntos.length === 1 ? 'intento' : 'intentos'}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function HojaEmision({
  trabajoRows, catalogoSeleccion, configCoberturas, ofertaRows, emision, onEmisionChange,
  idPerceptor, corredorNombre, carpetaNombre, efectoGenerales, periodicidadGenerales, verificacion,
}: Props) {
  const [shown, setShown] = useState(PAGINA);
  const [abierta, setAbierta] = useState<FilaEmision | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errDescarga, setErrDescarga] = useState('');

  const em = emision ?? {};
  // Fix 18/11: si hay override manual en la emisión, prevalece sobre el del corredor.
  const idPerceptorEfectivo = (em.idPerceptorOverride?.trim()) || idPerceptor || '';
  const res = useMemo(() => prepararEmision({
    trabajoRows,
    catalogoSeleccion: catalogoSeleccion ?? {},
    configCoberturas: configCoberturas ?? {},
    ofertaRows,
    emision,
    idPerceptor: idPerceptorEfectivo,
    efectoGenerales,
    periodicidadGenerales,
    verificacion,
  }), [trabajoRows, catalogoSeleccion, configCoberturas, ofertaRows, emision, idPerceptorEfectivo, efectoGenerales, periodicidadGenerales, verificacion]);

  const setCampo = (campo: 'idCliente' | 'idFlota' | 'idColectivo' | 'fechaEfecto', v: string) => onEmisionChange({ ...em, [campo]: v });
  const setComun = (col: string, v: string) => {
    const comunes = { ...(em.comunes ?? {}) };
    if (v) comunes[col] = v; else delete comunes[col];
    onEmisionChange({ ...em, comunes });
  };

  const filasConError = res.filas.filter(f => f.errores.length > 0).length;
  // En la vista previa, primero los vehículos bloqueados (antes quedaban perdidos más allá de la primera página)
  const filasOrdenadas = useMemo(() => [...res.filas].sort((a, b) => (b.errores.length > 0 ? 1 : 0) - (a.errores.length > 0 ? 1 : 0)), [res.filas]);
  // Motivos de bloqueo agrupados, con las matrículas afectadas
  const motivosBloqueo = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of res.filas) {
      for (const e of f.errores) {
        const clave = e.startsWith('Identificación por revisar') ? 'Identificación por revisar en PRE-EMISIÓN (abre el vehículo allí: elige otra versión, corrige el año o dalo por bueno)'
          : e.startsWith('Año de fabricación') ? 'Año de fabricación fuera del rango de su ID'
          : e.startsWith('Plazas ') ? 'Plazas fuera de las que admite su ID'
          : e;
        const l = m.get(clave) ?? [];
        if (!l.includes(f.matricula)) l.push(f.matricula);
        m.set(clave, l);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [res.filas]);
  // Filas cuyo año no entra en el rango de su ID y que por eso bloquean el fichero
  const conflictosAnio = res.filas.filter(f => f.conflictoAnio && f.errores.some(e => e.startsWith('Año de fabricación')));
  // Total de la flota: la prima buscada (el precio objetivo original), aunque se envíe un precio corregido
  const totalPrima = res.filas.reduce((a, f) => a + (f.precioBase ?? (parseFloat(f.valores.PRECIO_OBJETIVO ?? '') || 0)), 0);
  const nAjustados = res.filas.filter(f => f.precioAjustado).length;

  // Fecha: input date trabaja con aaaa-mm-dd; se guarda dd/mm/aaaa
  const aIso = (dmy?: string) => { const m = (dmy ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
  const deIso = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const efectoMostrado = em.fechaEfecto || efectoGenerales || '';

  const descargar = async () => {
    if (!res.listo || descargando) return;
    setDescargando(true); setErrDescarga('');
    try {
      const r = await fetch('/api/flotas/emision-masiva/excel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas: res.filas.map(f => f.valores) }),
      });
      if (!r.ok) {
        let msg = `Error ${r.status}`;
        try { const j = await r.json(); msg = j.error || msg; } catch { /* sin cuerpo */ }
        setErrDescarga(msg);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EMISION_${(carpetaNombre ?? 'FLOTA').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().toUpperCase().replace(/\s+/g, '_')}.xlsx`;
      a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErrDescarga(e instanceof Error ? e.message : 'No se pudo generar el fichero.');
    } finally {
      setDescargando(false);
    }
  };

  const drawerData: DetailDrawerData | null = abierta ? {
    over: 'Fila de emisión',
    title: abierta.matricula,
    desc: `${titulo(abierta.tipoEtiqueta)} · se emitirá con estos valores en la plantilla oficial.`,
    stats: [
      ['Producto', abierta.valores.ID_PRODUCTO ?? '—'],
      ['Franquicia', abierta.valores.ID_FRANQUICIA ?? '—'],
      ['Prima', abierta.valores.PRECIO_OBJETIVO ? eur(parseFloat(abierta.valores.PRECIO_OBJETIVO), 2) : '—'],
    ],
    head: ['Columna', 'Valor'],
    rows: COLUMNAS_EMISION.filter(c => abierta.valores[c] !== undefined && abierta.valores[c] !== '').map(c => [c, abierta.valores[c] as string]),
    note: [...abierta.errores.map(e => `Bloquea: ${e}`), ...abierta.avisos].join(' · ') || undefined,
  } : null;

  return (
    <div className="stepscroll custom-scrollbar">
      <div className="infbody">
        <div className="sh" style={{ flexShrink: 0 }}>
          <div>
            <h2><b>09 ·</b>Emisión</h2>
            <p>Fichero de emisión masiva con la plantilla oficial. Las coberturas son las confirmadas en el informe.</p>
          </div>
          <div className="acts">
            <button type="button" className="mini"
              onClick={() => document.getElementById('recalcular-precio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              title="Sube el resultado del sistema de emisión y ORION corrige el PRECIO_OBJETIVO para que la prima salga exacta">
              Recalcular precio objetivo
            </button>
            <button type="button" className="mini pri" onClick={descargar} disabled={!res.listo || descargando}
              title={res.listo ? 'Genera el Excel de emisión masiva' : 'Resuelve los bloqueos para poder generar el fichero'}>
              {descargando ? 'Generando…' : 'Descargar Excel de emisión'}
            </button>
          </div>
        </div>

        {/* Estado */}
        {res.listo ? (
          <div className="lock"><b>Listo</b><span>{nf(res.filas.length)} {res.filas.length === 1 ? 'vehículo preparado' : 'vehículos preparados'} · prima total {eur(totalPrima, 2)}{nAjustados > 0 ? ` · ${nf(nAjustados)} con precio objetivo recalculado` : ''}.</span></div>
        ) : (
          <div className="notice" role="status">
            <b>Para generar el fichero falta:</b>
            <ul className="emlist">
              {res.erroresGlobales.map(e => <li key={e}>{e}</li>)}
              {filasConError > 0 && <li>{nf(filasConError)} {filasConError === 1 ? 'vehículo con bloqueos' : 'vehículos con bloqueos'} (van los primeros en la tabla):</li>}
            </ul>
            {motivosBloqueo.length > 0 && (
              <ul className="emlist" style={{ marginTop: 6 }}>
                {motivosBloqueo.map(([motivo, mats]) => (
                  <li key={motivo}><b>{nf(mats.length)}</b> · {motivo} — {mats.slice(0, 12).join(', ')}{mats.length > 12 ? ` y ${nf(mats.length - 12)} más` : ''}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {conflictosAnio.length > 0 && (
          <>
            <p className="dg-h3 sp">Años fuera del rango de su ID</p>
            <p className="dg-sub">
              El sistema de emisión rechazaría estas filas. No se puede descargar el Excel hasta corregir el año
              o asignar otra ID en PRE-EMISIÓN.
            </p>
            <div className="xwrap" style={{ maxHeight: 'none' }}>
              <table className="xg">
                <thead>
                  <tr><th>Matrícula</th><th className="n">Año del vehículo</th><th>Rango que admite la ID</th><th>ID catálogo</th><th>Origen del rango</th></tr>
                </thead>
                <tbody>
                  {conflictosAnio.map(f => {
                    const c = f.conflictoAnio!;
                    return (
                      <tr key={f.matricula}>
                        <td><b>{f.matricula}</b></td>
                        <td className="n">{c.anio}</td>
                        <td>{c.min != null && c.max != null ? `${c.min} – ${c.max}` : c.min != null ? `desde ${c.min}` : `hasta ${c.max}`}</td>
                        <td>{c.id}</td>
                        <td>{c.origen === 'sistema' ? 'Sistema de emisión' : 'Catálogo'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {errDescarga && <div className="notice" role="alert">{errDescarga}</div>}
        <RecalcularPrecio filas={res.filas} ajustes={em.ajustesPrecio}
          onChange={a => { const n = { ...em }; if (a && Object.keys(a).length > 0) n.ajustesPrecio = a; else delete n.ajustesPrecio; onEmisionChange(n); }} />
        <AprenderDelSistema filas={res.filas} />

        {/* Datos de la emisión */}
        <p className="dg-h3">Datos de la emisión</p>
        <p className="dg-sub">Lo que no se conoce al estudiar la flota.</p>
        <div className="formgrid">
          <CampoTexto id="em-cli" label="ID de cliente (ID_TOM)" valor={em.idCliente ?? ''} onCommit={v => setCampo('idCliente', v)} requerido placeholder="Código del cliente en el sistema" />
          <CampoTexto id="em-flo" label="ID de flota (ID_FLOTA)" valor={em.idFlota ?? ''} onCommit={v => setCampo('idFlota', v)} requerido placeholder="Código de la flota en el sistema" />
          <CampoTexto id="em-col" label="ID de colectivo (ID_COLECTIVO)" valor={em.idColectivo ?? ''} onCommit={v => setCampo('idColectivo', v)} placeholder="Opcional" />
          <div className="dg-fld">
            <label htmlFor="em-efe">Fecha de efecto (FECHA_EFECTO) <span className="req">*</span></label>
            <input id="em-efe" type="date" className="dg-inp" value={aIso(efectoMostrado)} onChange={e => setCampo('fechaEfecto', deIso(e.target.value))} />
            <div className="hint">{em.fechaEfecto ? 'Fecha propia de la emisión.' : 'Por defecto, la de DATOS GENERALES.'}</div>
          </div>
          <div className="dg-fld full">
            <label htmlFor="em-per">ID de perceptor (ID_INTERVINIENTE)</label>
            <input
              id="em-per"
              className="dg-inp"
              value={em.idPerceptorOverride ?? idPerceptor ?? ''}
              placeholder="Sin asignar — escribir aquí para forzar un ID manual"
              onChange={e => onEmisionChange({ ...em, idPerceptorOverride: e.target.value })}
            />
            <div className="hint">
              {em.idPerceptorOverride
                ? `Override manual activo. Prevalece sobre el del corredor${corredorNombre ? ` (${corredorNombre})` : ''}. Vacía el campo para volver al del corredor.`
                : idPerceptor
                  ? `Se toma de la ficha del corredor${corredorNombre ? ` (${corredorNombre})` : ''}. Puedes sobrescribirlo aquí si necesitas otro.`
                  : 'El corredor de esta flota no tiene ID de perceptor. Rellénalo aquí a mano o asígnalo en CORREDORES.'}
            </div>
          </div>
        </div>

        {/* Valores comunes */}
        <p className="dg-h3 sp">Valores comunes a todos los vehículos</p>
        <p className="dg-sub">Se aplican a todas las filas. El uso, el ámbito y la periodicidad salen del estudio cuando lo traen.</p>
        <div className="formgrid">
          {CAMPOS_COMUNES.map(c => {
            const val = em.comunes?.[c.col] ?? '';
            const id = `em-c-${c.col}`;
            return c.tipo === 'cp' ? (
              <div className="dg-fld" key={c.col}>
                <label htmlFor={id}>{c.label} ({c.col})</label>
                <CpInput id={id} valor={val} onCommit={v => setComun(c.col, v)} />
              </div>
            ) : (
              <div className="dg-fld" key={c.col}>
                <label htmlFor={id}>{c.label} ({c.col})</label>
                <select id={id} className="select dg-sel" value={val || c.defecto || ''} onChange={e => setComun(c.col, e.target.value)}>
                  <option value="">Sin indicar</option>
                  {(LISTAS_EMISION[c.col] ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {c.ayuda && <div className="hint">{c.ayuda}</div>}
              </div>
            );
          })}
        </div>

        {/* Avisos de la flota */}
        {res.avisosGlobales.length > 0 && (
          <>
            <p className="dg-h3 sp">Avisos</p>
            <p className="dg-sub">No impiden generar el fichero.</p>
            <ul className="emlist emlist-avisos">{res.avisosGlobales.map(a => <li key={a}>{a}</li>)}</ul>
          </>
        )}

        {/* Vista previa */}
        <p className="dg-h3 sp">Vista previa por vehículo</p>
        <p className="dg-sub">Pulsa una fila para ver todas las columnas que se emiten.</p>
        {res.filas.length === 0 ? (
          <div className="notice">Todavía no hay vehículos en el trabajo.</div>
        ) : (
          <>
            <div className="xwrap" style={{ maxHeight: 'none' }}>
              <table className="xg emprev">
                <thead>
                  <tr>
                    <th>Matrícula</th><th>Tipología</th><th>Catálogo</th><th>Producto</th><th>Franquicia</th><th className="n">Prima</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.slice(0, shown).map(f => (
                    <tr key={f.matricula} className="clk" onClick={() => setAbierta(f)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierta(f); } }}>
                      <td><b>{f.matricula}</b></td>
                      <td>{titulo(f.tipoEtiqueta)}</td>
                      <td>{f.valores.ID_VEH_MMT ?? <span className="em">—</span>}</td>
                      <td>{f.valores.ID_PRODUCTO ?? <span className="em">—</span>}</td>
                      <td>{f.valores.ID_FRANQUICIA ?? <span className="em">—</span>}</td>
                      <td className="n">{f.valores.PRECIO_OBJETIVO ? eur(parseFloat(f.valores.PRECIO_OBJETIVO), 2) : <span className="em">—</span>}</td>
                      <td>
                        {f.errores.length > 0
                          ? <span className="cfgst falta" title={f.errores.join(' · ')}>{f.errores[0]}</span>
                          : f.avisos.length > 0
                            ? <span className="cfgst propuesta" title={f.avisos.join(' · ')}>{nf(f.avisos.length)} {f.avisos.length === 1 ? 'aviso' : 'avisos'}</span>
                            : <span className="cfgst confirmada">Lista</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {res.filas.length > shown && (
              <div className="edtools" style={{ marginTop: 12 }}>
                <button type="button" className="mini" onClick={() => setShown(s => s + PAGINA * 4)}>
                  Ver {nf(Math.min(PAGINA * 4, res.filas.length - shown))} más (quedan {nf(res.filas.length - shown)})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDrawer isOpen={!!abierta} onClose={() => setAbierta(null)} data={drawerData} />
    </div>
  );
}

/** Código postal: 5 cifras, se guarda al salir. */
function CpInput({ id, valor, onCommit }: { id: string; valor: string; onCommit: (v: string) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  const actual = txt ?? valor;
  const malo = actual !== '' && !/^\d{5}$/.test(actual);
  return (
    <>
      <input id={id} className="dg-inp" inputMode="numeric" maxLength={5} value={actual} placeholder="Ej. 28001"
        onChange={e => setTxt(e.target.value.replace(/\D/g, ''))}
        onBlur={() => { if (txt !== null && txt !== valor && (txt === '' || /^\d{5}$/.test(txt))) onCommit(txt); setTxt(null); }} />
      <div className="warn">{malo ? 'Debe tener 5 cifras.' : ''}</div>
    </>
  );
}
