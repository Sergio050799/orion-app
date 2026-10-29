"use client";

import React from 'react';
import type { FlotaCarpeta, Corredor } from '@/core/flotas';

interface Props {
  carpeta: FlotaCarpeta;
  corredor?: Corredor;
  onAbrirEstudio: () => void;
}

const sTitle: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.45)',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, margin: '0 0 12px',
};

const fLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'rgba(70,120,255,0.75)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, margin: '0 0 4px',
};

function Field({ label, value }: { label: string; value?: string | null }) {
  const hasValue = !!value?.trim();
  return (
    <div>
      <p style={fLabel}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, color: hasValue ? '#FFFFFF' : 'rgba(178,198,245,0.3)', fontStyle: hasValue ? 'normal' : 'italic', fontWeight: hasValue ? 500 : 400 }}>
        {hasValue ? value : '—'}
      </p>
    </div>
  );
}

export default function FichaContratada({ carpeta, corredor, onAbrirEstudio }: Props) {
  const h = carpeta.header;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Banner contratada */}
        <div style={{
          padding: '18px 22px', borderRadius: 14,
          background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Flota contratada
            </p>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFFFFF' }}>{carpeta.nombre}</h2>
          </div>
          <button onClick={onAbrirEstudio} style={{
            fontSize: 11, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            background: 'rgba(18,64,204,0.18)', color: '#3D7BFF',
            border: '1px solid rgba(51,102,255,0.3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Abrir en estudio
          </button>
        </div>

        {/* Identificación */}
        <section>
          <p style={sTitle}>Identificación</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="CIF Empresa" value={h.cif} />
            <Field label="Tomador" value={h.tomador} />
            <Field label="CIF Tomador" value={h.cifTomador} />
            <div style={{ gridColumn: '1 / 4' }}>
              <Field label="Actividad" value={h.actividad} />
            </div>
          </div>
        </section>

        {/* Corredor */}
        <section>
          <p style={sTitle}>Corredor vinculado</p>
          {corredor ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 14 }}>
                <Field label="Corredor" value={[corredor.nombre, corredor.comercial].filter(Boolean).join(' · ')} />
                <Field label="Comisión" value={`${carpeta.porcentajeComision ?? corredor.porcentajeComision}%`} />
              </div>
              {(corredor.email || corredor.telefono) && (
                <p style={{ marginTop: 8, fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>
                  {corredor.email}{corredor.email && corredor.telefono ? ' · ' : ''}{corredor.telefono}
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.3)', fontStyle: 'italic' }}>Sin corredor asignado</p>
          )}
        </section>

        {/* Póliza vigente */}
        <section>
          <p style={sTitle}>Póliza vigente</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Póliza actual" value={h.polizaActual} />
            <Field label="Compañía actual" value={h.ciaActual} />
          </div>
        </section>

        {/* Vigencia */}
        <section>
          <p style={sTitle}>Vigencia</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <Field label="Forma de pago" value={h.formaPago} />
            <Field label="Periodicidad" value={h.periodicidad} />
            <Field label="Efecto" value={h.efecto} />
            <Field label="Fecha vencimiento" value={h.fechaVencimiento} />
          </div>
          {h.fechaEmision && (
            <div style={{ marginTop: 14 }}>
              <Field label="Fecha de emisión" value={h.fechaEmision} />
            </div>
          )}
        </section>

        {/* Observaciones */}
        {carpeta.observaciones?.trim() && (
          <section>
            <p style={sTitle}>Observaciones</p>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(178,198,245,0.8)', lineHeight: 1.65 }}>
              {carpeta.observaciones}
            </p>
          </section>
        )}

        {/* Tarifa acordada */}
        {(carpeta.tarifaFlota ?? []).length > 0 && (
          <section>
            <p style={sTitle}>Tarifa acordada</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(carpeta.tarifaFlota ?? []).map((t, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 110px', gap: 12, alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(61,112,255,0.1)',
                }}>
                  <span style={{ fontSize: 12, color: '#FFFFFF' }}>{t.tipo || '—'}</span>
                  <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.65)' }}>{t.cobertura || '—'}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#10b981', textAlign: 'right' }}>
                    {t.precio ? `${t.precio.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
