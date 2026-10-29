'use client';

// Configurador de coberturas del INFORME: una fila por tipología × cobertura solicitada.
// Cobertura (terceros / ampliado / todo riesgo con franquicia), franquicia limitada por tipología y panel con
// todas las garantías de esa tipología, con los códigos que se emitirán. Todo sale del catálogo único
// (core/flotas/catalogoCoberturas.ts). Lo confirmado aquí es lo que ve la OFERTA y lo que emite la EMISIÓN.

import React, { useMemo, useState } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import { nf } from '@/lib/fmt';
import { TIPO_INFO } from '@/core/catalogo/tipologia';
import {
  PRODUCTO_DEF, PRODUCTOS, aEmision, camposDe, franquiciasPermitidas, grupoCob, inferirConfig,
  normalizarConfig, pendientesEmision, productosPermitidos, resumenConfig, tipoKeyDesdeEtiqueta, validarConfig,
  type ConfigCobertura, type FilaSolicitada, type ProductoKey,
} from '@/core/flotas/catalogoCoberturas';

export interface GrupoConfig {
  key: string;            // «TIPO||Cobertura solicitada»
  tipoNorm: string;       // etiqueta de tipo normalizada (TURISMO, CAMION RIGIDO…)
  cob: string;            // cobertura que pidió el corredor
  count: number;
  filas: FilaSolicitada[];
}

interface Props {
  grupos: GrupoConfig[];
  configs: Record<string, ConfigCobertura>;
  onChange: (next: Record<string, ConfigCobertura>) => void;
}

type Estado = 'confirmada' | 'propuesta' | 'falta' | 'no_admitida';

const eurTxt = (n: number) => `${nf(n)} €`;
const titulo = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function ConfigCoberturas({ grupos, configs, onChange }: Props) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(null);
  const [masProd, setMasProd] = useState('');
  const [masFrq, setMasFrq] = useState('');
  const [aviso, setAviso] = useState('');

  // Configuración efectiva de cada grupo: la confirmada o, si no hay, la propuesta que deduce ORION.
  const filas = useMemo(() => grupos.map(g => {
    const tipo = tipoKeyDesdeEtiqueta(g.tipoNorm);
    const guardada = normalizarConfig(tipo, configs[g.key]);
    const propuesta = guardada ? null : inferirConfig(tipo, g.cob, g.filas);
    const cfg = guardada ?? propuesta;
    const errs = grupoCob(tipo) ? validarConfig(tipo, cfg ?? undefined) : validarConfig(tipo, undefined);
    const estado: Estado = !grupoCob(tipo) ? 'no_admitida' : !cfg || errs.length > 0 ? 'falta' : guardada ? 'confirmada' : 'propuesta';
    return { g, tipo, cfg, guardada: !!guardada, errs, estado };
  }), [grupos, configs]);

  const porClave = useMemo(() => new Map(filas.map(f => [f.g.key, f])), [filas]);
  const nConfirmadas = filas.filter(f => f.estado === 'confirmada').length;
  const nPendientes = filas.filter(f => f.estado === 'propuesta' || f.estado === 'falta').length;

  const guardar = (cambios: Record<string, ConfigCobertura>) => onChange({ ...configs, ...cambios });

  const setProducto = (key: string, p: ProductoKey) => {
    const f = porClave.get(key); if (!f) return;
    const base = f.cfg ?? { producto: p, opciones: {} };
    const nueva = normalizarConfig(f.tipo, { producto: p, franquicia: base.franquicia, opciones: base.opciones });
    if (nueva) guardar({ [key]: nueva });
  };
  const setFranquicia = (key: string, v: string) => {
    const f = porClave.get(key); if (!f || !f.cfg) return;
    guardar({ [key]: { ...f.cfg, franquicia: v ? Number(v) : undefined } });
  };
  const setOpcion = (key: string, campo: string, v: string) => {
    const f = porClave.get(key); if (!f || !f.cfg) return;
    guardar({ [key]: { ...f.cfg, opciones: { ...f.cfg.opciones, [campo]: v } } });
  };
  const confirmarTodas = () => {
    const nuevo: Record<string, ConfigCobertura> = {};
    for (const f of filas) if (f.estado === 'propuesta' && f.cfg) nuevo[f.g.key] = f.cfg;
    if (Object.keys(nuevo).length) guardar(nuevo);
    setAviso(`${nf(Object.keys(nuevo).length)} propuestas confirmadas.`);
  };

  // ── Selección y cambios masivos ──
  const alternar = (key: string) => setSel(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const tiposPresentes = useMemo(() => [...new Set(filas.map(f => f.g.tipoNorm))], [filas]);
  const marcarTipologia = (t: string) => { setSel(new Set(t ? filas.filter(f => f.g.tipoNorm === t).map(f => f.g.key) : [])); setAviso(''); };
  const marcadas = filas.filter(f => sel.has(f.g.key));

  const opcionesMasProd = useMemo(() => {
    const keys = new Set<ProductoKey>();
    marcadas.forEach(f => productosPermitidos(f.tipo).forEach(p => keys.add(p)));
    return PRODUCTOS.filter(p => keys.has(p.key));
  }, [marcadas]);
  const opcionesMasFrq = useMemo(() => {
    const vals = new Set<number>();
    marcadas.forEach(f => (f.cfg ? franquiciasPermitidas(f.tipo, f.cfg.producto) : []).forEach(n => vals.add(n)));
    return [...vals].sort((a, b) => a - b);
  }, [marcadas]);

  const aplicarMasivo = () => {
    const cambios: Record<string, ConfigCobertura> = {};
    const omitidas: string[] = [];
    for (const f of marcadas) {
      let cfg = f.cfg;
      if (masProd) {
        if (!productosPermitidos(f.tipo).includes(masProd as ProductoKey)) { omitidas.push(`${titulo(f.g.tipoNorm)}: cobertura no válida`); continue; }
        cfg = normalizarConfig(f.tipo, { producto: masProd as ProductoKey, franquicia: cfg?.franquicia, opciones: cfg?.opciones ?? {} });
      }
      if (masFrq && cfg) {
        const permitidas = franquiciasPermitidas(f.tipo, cfg.producto);
        if (!permitidas.includes(Number(masFrq))) {
            omitidas.push(`${titulo(f.g.tipoNorm)} · ${PRODUCTO_DEF[cfg.producto].label}: ${permitidas.length === 0 ? 'esta cobertura no lleva franquicia' : `franquicia ${eurTxt(Number(masFrq))} no válida`}`);
            continue;
        }
        cfg = { ...cfg, franquicia: Number(masFrq) };
      }
      if (cfg) cambios[f.g.key] = cfg;
    }
    if (Object.keys(cambios).length) guardar(cambios);
    setAviso(`Aplicado a ${nf(Object.keys(cambios).length)} ${Object.keys(cambios).length === 1 ? 'fila' : 'filas'}${omitidas.length ? ` · omitidas ${nf(omitidas.length)}: ${omitidas.join('; ')}` : ''}.`);
  };

  const copiarA = (origenKey: string) => {
    const o = porClave.get(origenKey); if (!o?.cfg) return;
    const cambios: Record<string, ConfigCobertura> = {};
    let omitidas = 0;
    for (const f of marcadas) {
      if (f.g.key === origenKey) continue;
      const n = normalizarConfig(f.tipo, { producto: o.cfg.producto, franquicia: o.cfg.franquicia, opciones: o.cfg.opciones });
      if (n) cambios[f.g.key] = n; else omitidas++;
    }
    if (Object.keys(cambios).length) guardar(cambios);
    setAviso(`Coberturas copiadas a ${nf(Object.keys(cambios).length)} ${Object.keys(cambios).length === 1 ? 'fila' : 'filas'}${omitidas ? ` · ${nf(omitidas)} omitidas (cobertura no válida para su tipología)` : ''}.`);
  };

  const fAbierta = abierto ? porClave.get(abierto) : null;
  const marcadasOtras = abierto ? marcadas.filter(f => f.g.key !== abierto).length : 0;

  const estadoTxt: Record<Estado, string> = { confirmada: 'Confirmada', propuesta: 'Propuesta', falta: 'Falta franquicia', no_admitida: 'No admitida' };

  if (grupos.length === 0) return null;

  return (
    <section className="cfgcob paper wide" aria-label="Coberturas por tipología">
      <div className="sh" style={{ marginBottom: 12 }}>
        <div>
          <h3 className="cfgh">Coberturas por tipología</h3>
          <p>Elige la cobertura y la franquicia de cada tipología. Lo que confirmes aquí es lo que verá la oferta y lo que se emitirá.</p>
        </div>
        <div className="acts">
          <button type="button" className="mini pri" onClick={confirmarTodas} disabled={!filas.some(f => f.estado === 'propuesta')}>Confirmar propuestas</button>
        </div>
      </div>

      <div className="cfgbar">
        <label className="cfgl">Marcar tipología
          <select aria-label="Marcar todas las filas de una tipología" value="" onChange={e => marcarTipologia(e.target.value)}>
            <option value="">Elegir…</option>
            {tiposPresentes.map(t => <option key={t} value={t}>{titulo(t)}</option>)}
          </select>
        </label>
        {marcadas.length > 0 && (
          <>
            <span className="cfgn">{nf(marcadas.length)} {marcadas.length === 1 ? 'fila marcada' : 'filas marcadas'}</span>
            <label className="cfgl">Cobertura
              <select aria-label="Cobertura para las filas marcadas" value={masProd} onChange={e => setMasProd(e.target.value)}>
                <option value="">Sin cambio</option>
                {opcionesMasProd.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            <label className="cfgl">Franquicia
              <select aria-label="Franquicia para las filas marcadas" value={masFrq} onChange={e => setMasFrq(e.target.value)} disabled={opcionesMasFrq.length === 0}>
                <option value="">Sin cambio</option>
                {opcionesMasFrq.map(n => <option key={n} value={n}>{eurTxt(n)}</option>)}
              </select>
            </label>
            <button type="button" className="mini pri" onClick={aplicarMasivo} disabled={!masProd && !masFrq}>Aplicar a las marcadas</button>
            <button type="button" className="mini" onClick={() => { setSel(new Set()); setAviso(''); }}>Quitar marcas</button>
          </>
        )}
      </div>
      {aviso && <div className="cfgaviso" role="status">{aviso}</div>}

      <div className="xwrap">
        <table className="xg cfgt">
          <thead>
            <tr>
              <th className="chk"><span className="sr">Marcar</span></th>
              <th>Tipología</th><th>Pidió el corredor</th><th className="n">Nº veh.</th>
              <th>Cobertura</th><th>Franquicia</th><th>Coberturas</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(f => {
              const permitidos = productosPermitidos(f.tipo);
              const frqs = f.cfg ? franquiciasPermitidas(f.tipo, f.cfg.producto) : [];
              const info = TIPO_INFO[f.tipo];
              const bloqueada = f.estado === 'no_admitida';
              return (
                <tr key={f.g.key} className={sel.has(f.g.key) ? 'sel' : ''}>
                  <td className="chk">
                    <input type="checkbox" aria-label={`Marcar ${f.g.tipoNorm} · ${f.g.cob}`} checked={sel.has(f.g.key)} onChange={() => alternar(f.g.key)} disabled={bloqueada} />
                  </td>
                  <td><b>{titulo(f.g.tipoNorm)}</b>{info && info.categoria > 0 ? <span className="cfgcat"> · {info.categoria}.ª cat.</span> : null}</td>
                  <td>{f.g.cob}</td>
                  <td className="n">{nf(f.g.count)}</td>
                  <td>
                    {bloqueada ? <span className="cfgmut">—</span> : (
                      <select aria-label={`Cobertura · ${f.g.tipoNorm} · ${f.g.cob}`} value={f.cfg?.producto ?? ''} onChange={e => setProducto(f.g.key, e.target.value as ProductoKey)}>
                        {!f.cfg && <option value="">Elegir…</option>}
                        {permitidos.map(p => <option key={p} value={p}>{PRODUCTO_DEF[p].label}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {bloqueada || frqs.length === 0 ? <span className="cfgmut">—</span> : (
                      <select aria-label={`Franquicia · ${f.g.tipoNorm} · ${f.g.cob}`} value={f.cfg?.franquicia ?? ''} onChange={e => setFranquicia(f.g.key, e.target.value)}>
                        <option value="">Elegir…</option>
                        {frqs.map(n => <option key={n} value={n}>{eurTxt(n)}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    {bloqueada ? <span className="cfgmut">{f.errs[0]}</span> : f.cfg ? (
                      <button type="button" className="cfglink" onClick={() => setAbierto(f.g.key)} title="Ver y editar las garantías de esta tipología">
                        {resumenConfig(f.tipo, f.cfg)}
                      </button>
                    ) : <span className="cfgmut">Elige cobertura</span>}
                  </td>
                  <td><span className={`cfgst ${f.estado}`}>{estadoTxt[f.estado]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="edtools">
        <span>{nf(nConfirmadas)} de {nf(filas.length)} confirmadas{nPendientes > 0 ? ` · ${nf(nPendientes)} por revisar` : ''}. Franquicias: 1.ª categoría de 120 a 1.200 €, 2.ª categoría 1.800 o 2.400 €, motos de 300 a 3.000 €.</span>
      </div>

      <DetailDrawer isOpen={!!fAbierta} onClose={() => setAbierto(null)} data={null}>
        {fAbierta && fAbierta.cfg && (() => {
          const { g, tipo, cfg } = fAbierta;
          const campos = camposDe(tipo, cfg.producto, cfg.franquicia);
          const grupoNombres: string[] = [];
          campos.forEach(c => { if (!grupoNombres.includes(c.grupo)) grupoNombres.push(c.grupo); });
          const frqs = franquiciasPermitidas(tipo, cfg.producto);
          const pend = pendientesEmision(tipo, cfg);
          const codigos = Object.entries(aEmision(tipo, cfg));
          return (
            <div className="cfgdr">
              <div className="over">Coberturas</div>
              <h3>{titulo(g.tipoNorm)}</h3>
              <p className="desc">{nf(g.count)} {g.count === 1 ? 'vehículo' : 'vehículos'} · el corredor pidió «{g.cob}».</p>

              <h4>Cobertura y franquicia</h4>
              <div className="cfrow">
                <label htmlFor="cfg-prod">Cobertura</label>
                <select id="cfg-prod" className="select" value={cfg.producto} onChange={e => setProducto(g.key, e.target.value as ProductoKey)}>
                  {productosPermitidos(tipo).map(p => <option key={p} value={p}>{PRODUCTO_DEF[p].label}</option>)}
                </select>
              </div>
              {frqs.length > 0 && (
                <div className="cfrow">
                  <label htmlFor="cfg-frq">Franquicia</label>
                  <select id="cfg-frq" className="select" value={cfg.franquicia ?? ''} onChange={e => setFranquicia(g.key, e.target.value)}>
                    <option value="">Elegir…</option>
                    {frqs.map(n => <option key={n} value={n}>{eurTxt(n)}</option>)}
                  </select>
                </div>
              )}

              {grupoNombres.map(gn => (
                <React.Fragment key={gn}>
                  <h4>{gn}</h4>
                  {campos.filter(c => c.grupo === gn).map(c => (
                    <div className="cfrow" key={c.id}>
                      <label htmlFor={`cfg-${c.id}`}>{c.label}</label>
                      {c.kind === 'fijo' ? (
                        <span className="cffix" id={`cfg-${c.id}`}>{c.fijo}</span>
                      ) : (
                        <select id={`cfg-${c.id}`} className="select" value={cfg.opciones[c.id] ?? c.defecto ?? ''} onChange={e => setOpcion(g.key, c.id, e.target.value)}>
                          {c.opciones?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {pend.length > 0 && (
                <>
                  <h4>Avisos para la emisión</h4>
                  <ul className="cfwarn">{pend.map(p => <li key={p}>{p}</li>)}</ul>
                </>
              )}

              <h4>Códigos que se emitirán</h4>
              <div className="kv">
                {codigos.map(([k, v]) => <div key={k}><label>{k.replace(/_/g, ' ')}</label><span>{v}</span></div>)}
              </div>

              {marcadasOtras > 0 && (
                <div className="dacts">
                  <button type="button" className="mini pri" onClick={() => copiarA(g.key)}>Copiar a las {nf(marcadasOtras)} filas marcadas</button>
                </div>
              )}
            </div>
          );
        })()}
      </DetailDrawer>
    </section>
  );
}
