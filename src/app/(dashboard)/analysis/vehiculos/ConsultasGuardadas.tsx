"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import { nf, pc } from '@/lib/fmt';
import { borrarConsulta, fechaHora, listarConsultas, type ConsultaResumen } from '@/lib/consultasVehiculos';

interface Props {
  /** abre la consulta en su pestaña (Identificar o Masivo) */
  onAbrir: (c: ConsultaResumen) => void;
  /** cambia cada vez que se guarda algo, para refrescar el directorio */
  refrescar?: number;
}

export default function ConsultasGuardadas({ onAbrir, refrescar }: Props) {
  const [lista, setLista] = useState<ConsultaResumen[] | null>(null);
  const [sel, setSel] = useState<ConsultaResumen | null>(null);
  const [confirmaBorrar, setConfirmaBorrar] = useState(false);
  const [filtro, setFiltro] = useState<'todas' | 'normal' | 'masiva'>('todas');

  const cargar = useCallback(async () => { setLista(await listarConsultas()); }, []);
  useEffect(() => {
    let vivo = true;
    listarConsultas().then(l => { if (vivo) setLista(l); });
    return () => { vivo = false; };
  }, [refrescar]);

  const visibles = (lista ?? []).filter(c => filtro === 'todas' || c.tipo === filtro);
  const totalVeh = visibles.reduce((s, c) => s + (c.n_vehiculos || 0), 0);
  const totalIdent = visibles.reduce((s, c) => s + (c.n_identificados || 0), 0);

  const cierra = () => { setSel(null); setConfirmaBorrar(false); };

  return (
    <div className="mwrap">
      <div className="pcount" style={{ marginTop: 0, marginBottom: 14 }}>
        <span><b>{nf(visibles.length)}</b> consulta{visibles.length === 1 ? '' : 's'} · <b>{nf(totalVeh)}</b> vehículos · <b>{nf(totalIdent)}</b> identificados</span>
        <div className="seg" role="tablist" aria-label="Tipo de consulta" style={{ marginLeft: 'auto' }}>
          {([['todas', 'Todas'], ['normal', 'Normales'], ['masiva', 'Masivas']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filtro === k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{l}</button>
          ))}
        </div>
      </div>

      {lista === null && <div className="empty">Cargando consultas…</div>}
      {lista !== null && visibles.length === 0 && (
        <div className="empty">Aún no hay consultas guardadas. Cada consulta que hagas, normal o masiva, se guarda sola y podrás reabrirla aquí.</div>
      )}

      {visibles.length > 0 && (
        <div className="tscroll">
          <table className="tbl">
            <thead>
              <tr>{['Consulta', 'Tipo', 'Última actualización', 'Vehículos', 'Identificados', 'Creada por'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {visibles.map(c => (
                <tr key={c.id} tabIndex={0} onClick={() => setSel(c)} onKeyDown={e => { if (e.key === 'Enter') setSel(c); }}>
                  <td>{c.nombre || 'Sin nombre'}{c.pendiente && <span className="muted"> · solo en este navegador</span>}</td>
                  <td>{c.tipo === 'masiva' ? 'Masiva' : 'Normal'}</td>
                  <td>{fechaHora(c.updated_at)}</td>
                  <td>{nf(c.n_vehiculos)}</td>
                  <td>{nf(c.n_identificados)}{c.n_vehiculos > 0 && <span className="muted"> · {pc(c.n_identificados / c.n_vehiculos * 100, 0)}</span>}</td>
                  <td>{c.creado_por || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer isOpen={sel !== null} onClose={cierra} data={null}>
        {sel && (
          <div className="cfgdr">
            <div className="over">Consulta guardada</div>
            <h3>{sel.nombre || 'Sin nombre'}</h3>
            <p className="desc">
              {sel.pendiente
                ? 'Esta consulta solo está guardada en este navegador. Se enviará al servidor en cuanto esté disponible.'
                : 'Guardada en el servidor. La puedes reabrir con todos sus datos, sin volver a consultar Silverdat.'}
            </p>
            {([
              ['Tipo', sel.tipo === 'masiva' ? 'Masiva' : 'Normal'],
              ['Creada', fechaHora(sel.created_at)],
              ['Última actualización', fechaHora(sel.updated_at)],
              ['Vehículos', nf(sel.n_vehiculos)],
              ['Identificados', `${nf(sel.n_identificados)}${sel.n_vehiculos > 0 ? ` · ${pc(sel.n_identificados / sel.n_vehiculos * 100, 0)}` : ''}`],
              ['Creada por', sel.creado_por || '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div className="cfrow" key={k}><label>{k}</label><span className="cffix">{v}</span></div>
            ))}
            <div className="dacts">
              <button type="button" className="mini pri" onClick={() => { const c = sel; cierra(); onAbrir(c); }}>Abrir consulta</button>
              {!confirmaBorrar
                ? <button type="button" className="mini" onClick={() => setConfirmaBorrar(true)}>Eliminar</button>
                : <>
                    <button type="button" className="mini danger" onClick={async () => { await borrarConsulta(sel.id); cierra(); cargar(); }}>Sí, eliminar</button>
                    <button type="button" className="mini" onClick={() => setConfirmaBorrar(false)}>No</button>
                  </>}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
