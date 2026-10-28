'use client';

// Paso 09 · EMISIÓN. Prepara el fichero de emisión masiva (plantilla oficial de MMT) con lo que ya se decidió
// en el estudio: vehículo identificado, coberturas confirmadas en INFORME y prima ofertada. Aquí solo se
// completan los datos que no se conocen al estudiar (ID cliente, ID flota, colectivo, valores comunes).

import React, { useMemo, useState } from 'react';
import { DetailDrawer, type DetailDrawerData } from '@/components/saas/DetailDrawer';
import { nf, eur } from '@/lib/fmt';
import type { EmisionDatos } from '@/core/flotas/carpeta';
import type { ConfigCobertura } from '@/core/flotas/catalogoCoberturas';
import {
  CAMPOS_COMUNES, COLUMNAS_EMISION, LISTAS_EMISION, prepararEmision, type FilaEmision,
} from '@/core/flotas/emision';

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

export default function HojaEmision({
  trabajoRows, catalogoSeleccion, configCoberturas, ofertaRows, emision, onEmisionChange,
  idPerceptor, corredorNombre, carpetaNombre, efectoGenerales, periodicidadGenerales,
}: Props) {
  const [shown, setShown] = useState(PAGINA);
  const [abierta, setAbierta] = useState<FilaEmision | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [errDescarga, setErrDescarga] = useState('');

  const em = emision ?? {};
  const res = useMemo(() => prepararEmision({
    trabajoRows,
    catalogoSeleccion: catalogoSeleccion ?? {},
    configCoberturas: configCoberturas ?? {},
    ofertaRows,
    emision,
    idPerceptor,
    efectoGenerales,
    periodicidadGenerales,
  }), [trabajoRows, catalogoSeleccion, configCoberturas, ofertaRows, emision, idPerceptor, efectoGenerales, periodicidadGenerales]);

  const setCampo = (campo: 'idCliente' | 'idFlota' | 'idColectivo' | 'fechaEfecto', v: string) => onEmisionChange({ ...em, [campo]: v });
  const setComun = (col: string, v: string) => {
    const comunes = { ...(em.comunes ?? {}) };
    if (v) comunes[col] = v; else delete comunes[col];
    onEmisionChange({ ...em, comunes });
  };

  const filasConError = res.filas.filter(f => f.errores.length > 0).length;
  const totalPrima = res.filas.reduce((a, f) => a + (parseFloat(f.valores.PRECIO_OBJETIVO ?? '') || 0), 0);

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
            <button type="button" className="mini pri" onClick={descargar} disabled={!res.listo || descargando}
              title={res.listo ? 'Genera el Excel de emisión masiva' : 'Resuelve los bloqueos para poder generar el fichero'}>
              {descargando ? 'Generando…' : 'Descargar Excel de emisión'}
            </button>
          </div>
        </div>

        {/* Estado */}
        {res.listo ? (
          <div className="lock"><b>Listo</b><span>{nf(res.filas.length)} {res.filas.length === 1 ? 'vehículo preparado' : 'vehículos preparados'} · prima total {eur(totalPrima, 2)}.</span></div>
        ) : (
          <div className="notice" role="status">
            <b>Para generar el fichero falta:</b>
            <ul className="emlist">
              {res.erroresGlobales.map(e => <li key={e}>{e}</li>)}
              {filasConError > 0 && <li>{nf(filasConError)} {filasConError === 1 ? 'vehículo con bloqueos' : 'vehículos con bloqueos'} (marcados en la tabla).</li>}
            </ul>
          </div>
        )}
        {errDescarga && <div className="notice" role="alert">{errDescarga}</div>}

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
            <input id="em-per" className="dg-inp" value={idPerceptor ?? ''} readOnly placeholder="Sin asignar" />
            <div className="hint">{idPerceptor ? `Se toma de la ficha del corredor${corredorNombre ? ` (${corredorNombre})` : ''} y se arrastra siempre.` : 'El corredor de esta flota no tiene ID de perceptor. Se asigna en CORREDORES.'}</div>
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
                  {res.filas.slice(0, shown).map(f => (
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
