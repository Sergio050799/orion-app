"use client";

import React, { useState, useEffect } from 'react';
import { listarCorredores, guardarCarpeta, type FlotaCarpeta, type Corredor } from '@/core/flotas';
import type { FlotaHeader } from './types';

// ─── Badge próxima renovación ─────────────────────────────────────────────────

function proximaRenovacion(fechaStr?: string): boolean {
  if (!fechaStr) return false;
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  const diff = (fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

// ─── HojaDatosGenerales ───────────────────────────────────────────────────────

interface Props {
  carpetaActiva: FlotaCarpeta;
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  onCarpetaChange: (c: FlotaCarpeta) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 800,
  color: 'rgba(129,140,248,0.8)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '7px 10px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0',
  outline: 'none',
  fontFamily: 'inherit',
};

export default function HojaDatosGenerales({ carpetaActiva, header, onHeaderChange, onCarpetaChange }: Props) {
  const [corredores, setCorredores] = useState<Corredor[]>([]);

  useEffect(() => {
    setCorredores(listarCorredores());
  }, []);

  const set = (key: keyof FlotaHeader, value: string) => {
    onHeaderChange({ ...header, [key]: value });
  };

  const handleCorredorChange = (corredor_id: string) => {
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      corredor_id: corredor_id || undefined,
    };
    guardarCarpeta(updated);
    onCarpetaChange(updated);
  };

  const venceProximo = proximaRenovacion(header.fechaVencimiento);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Identificación ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Identificación
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>CIF Empresa</label>
              <input style={inputStyle} value={header.cif} onChange={e => set('cif', e.target.value)} placeholder="A12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>Tomador</label>
              <input style={inputStyle} value={header.tomador} onChange={e => set('tomador', e.target.value)} placeholder="Empresa S.L."
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>CIF Tomador</label>
              <input style={inputStyle} value={header.cifTomador ?? ''} onChange={e => set('cifTomador', e.target.value)} placeholder="B12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div style={{ gridColumn: '1 / 4' }}>
              <label style={labelStyle}>Actividad</label>
              <input style={inputStyle} value={header.actividad} onChange={e => set('actividad', e.target.value)} placeholder="Transporte de mercancías"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
        </section>

        {/* ── Corredor ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Corredor vinculado
          </p>
          <select
            value={carpetaActiva.corredor_id ?? ''}
            onChange={e => handleCorredorChange(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer', color: carpetaActiva.corredor_id ? '#e2e8f0' : 'rgba(255,255,255,0.35)' }}>
            <option value="">Sin corredor</option>
            {corredores.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre} · {c.porcentajeComision}%
              </option>
            ))}
          </select>
          {carpetaActiva.corredor_id && (() => {
            const c = corredores.find(x => x.id === carpetaActiva.corredor_id);
            if (!c) return null;
            return (
              <p style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                {c.email && <span>{c.email}</span>}
                {c.email && c.telefono && <span> · </span>}
                {c.telefono && <span>{c.telefono}</span>}
              </p>
            );
          })()}
        </section>

        {/* ── Póliza actual ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Póliza vigente
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Póliza actual</label>
              <input style={inputStyle} value={header.polizaActual ?? ''} onChange={e => set('polizaActual', e.target.value)} placeholder="Referencia de la póliza"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>Compañía actual</label>
              <input style={inputStyle} value={header.ciaActual ?? ''} onChange={e => set('ciaActual', e.target.value)} placeholder="Nombre de la compañía"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
        </section>

        {/* ── Vigencia ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Vigencia
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Forma de pago</label>
              <input style={inputStyle} value={header.formaPago} onChange={e => set('formaPago', e.target.value)} placeholder="Anual"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>Periodicidad</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={header.periodicidad ?? ''} onChange={e => set('periodicidad', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}>
                <option value="">Sin definir</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha inicio</label>
              <input type="date" style={inputStyle} value={header.fechaInicio ?? ''} onChange={e => set('fechaInicio', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                Fecha vencimiento
                {venceProximo && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>
                    ⚠ Próxima renovación
                  </span>
                )}
              </label>
              <input type="date" style={{ ...inputStyle, borderColor: venceProximo ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.1)' }}
                value={header.fechaVencimiento ?? ''} onChange={e => set('fechaVencimiento', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = venceProximo ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
        </section>

        {/* ── Efecto + Emisión ── */}
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Efecto</label>
              <input style={inputStyle} value={header.efecto} onChange={e => set('efecto', e.target.value)} placeholder="DD/MM/YYYY"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de emisi&oacute;n</label>
              <input type="date" style={inputStyle} value={header.fechaEmision ?? ''} onChange={e => set('fechaEmision', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
