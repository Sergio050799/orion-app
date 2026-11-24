'use client';

import React, { useMemo, useState } from 'react';
import { DetailDrawer } from '@/components/saas/DetailDrawer';
import type { CampoVehiculo, Discrepancia } from '@/core/silverdat/reconciliar';

/** matrícula → campos en los que el usuario se queda con la plantilla */
export type MantenerPorMatricula = Record<string, CampoVehiculo[]>;

interface Props {
  abierto: boolean;
  discrepancias: Discrepancia[];
  /** Se llama al aplicar (o al cerrar el panel: se aplica lo que esté marcado, por defecto Silverdat). */
  onAplicar: (mantener: MantenerPorMatricula) => void;
}

const clave = (d: Discrepancia) => `${d.matricula}|${d.campo}`;

/**
 * Alerta «Silverdat no coincide con la plantilla». Silverdat (DGT) manda por defecto; en cada dato se puede
 * mantener lo que dice la plantilla del corredor.
 */
export default function SilverdatDiscrepancias({ abierto, discrepancias, onAplicar }: Props) {
  const [mantener, setMantener] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    const m = new Map<string, Discrepancia[]>();
    for (const d of discrepancias) { const l = m.get(d.matricula) ?? []; l.push(d); m.set(d.matricula, l); }
    // primero los vehículos con discrepancias críticas (marca o tipo)
    return [...m.entries()].sort((a, b) => Number(b[1].some(d => d.critica)) - Number(a[1].some(d => d.critica)));
  }, [discrepancias]);
  const criticas = discrepancias.filter(d => d.critica).length;

  const aplicar = (sel: Set<string>) => {
    const out: MantenerPorMatricula = {};
    for (const d of discrepancias) if (sel.has(clave(d))) (out[d.matricula] ??= []).push(d.campo);
    setMantener(new Set());
    onAplicar(out);
  };
  const elegir = (d: Discrepancia, plantilla: boolean) => setMantener(prev => {
    const n = new Set(prev);
    if (plantilla) n.add(clave(d)); else n.delete(clave(d));
    return n;
  });

  const btn: React.CSSProperties = { padding: '9px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const opcion = (activa: boolean): React.CSSProperties => ({
    display: 'flex', gap: 8, alignItems: 'baseline', padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    border: `1px solid ${activa ? 'var(--blue-2)' : 'var(--line)'}`, background: activa ? 'rgba(51,102,255,0.08)' : 'transparent', color: 'var(--text)',
  });

  return (
    <DetailDrawer isOpen={abierto} onClose={() => aplicar(mantener)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--blue-2)', marginBottom: 8 }}>
            SILVERDAT · DGT
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.03em' }}>
            Silverdat no coincide con la plantilla
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)', lineHeight: 1.65 }}>
            {grupos.length === 1 ? 'En 1 vehículo' : `En ${grupos.length} vehículos`} la plantilla del corredor dice una cosa y Silverdat (datos oficiales de la DGT) otra.
            Por defecto se usa Silverdat. Marca «Plantilla» en lo que quieras mantener como lo envió el corredor.
            {criticas > 0 ? ` Hay ${criticas} ${criticas === 1 ? 'diferencia' : 'diferencias'} de marca o tipo de vehículo: revísalas, cambian la prima.` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => setMantener(new Set())}>Usar Silverdat en todo</button>
          <button type="button" style={btn} onClick={() => setMantener(new Set(discrepancias.map(clave)))}>Mantener plantilla en todo</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grupos.map(([mat, lista]) => (
            <div key={mat} style={{ flexShrink: 0, padding: '12px 14px', borderRadius: 8, border: `1px solid ${lista.some(d => d.critica) ? 'rgba(245,158,11,0.5)' : 'var(--line)'}` }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>{mat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lista.map(d => {
                  const plantilla = mantener.has(clave(d));
                  return (
                    <div key={d.campo} role="radiogroup" aria-label={`${mat} · ${d.etiqueta}`}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: d.critica ? '#d97706' : 'var(--quiet)', marginBottom: 5 }}>
                        {d.etiqueta}{d.critica ? ' · revisar' : ''}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <label style={opcion(!plantilla)}>
                          <input type="radio" name={clave(d)} checked={!plantilla} onChange={() => elegir(d, false)} />
                          <span><span style={{ color: 'var(--quiet)', fontSize: 11 }}>Silverdat</span><br /><b>{d.silverdat}</b></span>
                        </label>
                        <label style={opcion(plantilla)}>
                          <input type="radio" name={clave(d)} checked={plantilla} onChange={() => elegir(d, true)} />
                          <span><span style={{ color: 'var(--quiet)', fontSize: 11 }}>Plantilla</span><br /><b>{d.plantilla}</b></span>
                        </label>
                      </div>
                      {d.nota && <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--quiet)', lineHeight: 1.5 }}>{d.nota}.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => aplicar(mantener)}
          style={{ flexShrink: 0, padding: '13px 0', borderRadius: 8, background: 'linear-gradient(135deg,#1240CC,#3366FF)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Aplicar y continuar
        </button>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--quiet)', lineHeight: 1.5 }}>
          Lo que la plantilla traía vacío ya se ha rellenado con Silverdat. El uso, las coberturas y el resto de datos del seguro no se tocan.
        </p>
      </div>
    </DetailDrawer>
  );
}
