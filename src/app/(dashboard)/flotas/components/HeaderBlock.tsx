"use client";

import React from 'react';
import type { FlotaHeader } from './types';
import type { Periodicidad } from '@/core/flotas/corredor';

interface Props {
  header: FlotaHeader;
  onChange: (h: FlotaHeader) => void;
}

const TEXT_FIELDS: { key: keyof FlotaHeader; label: string; placeholder: string }[] = [
  { key: 'cif',       label: 'CIF',      placeholder: 'A12345678' },
  { key: 'tomador',   label: 'TOMADOR',  placeholder: 'Empresa S.L.' },
  { key: 'actividad', label: 'ACTIVIDAD', placeholder: 'Transporte de mercancías' },
  { key: 'efecto',    label: 'EFECTO',   placeholder: 'DD/MM/YYYY' },
];

const FORMA_PAGO_OPTS = ['INTERNA', 'EXTERNA'] as const;
const PERIODICIDAD_OPTS: { value: Periodicidad; label: string }[] = [
  { value: 'mensual',    label: 'MENSUAL' },
  { value: 'bimestral',  label: 'BIMESTRAL' },
  { value: 'trimestral', label: 'TRIMESTRAL' },
  { value: 'semestral',  label: 'SEMESTRAL' },
  { value: 'anual',      label: 'ANUAL' },
];

const selectStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(51,102,255,0.3)',
  color: '#FFFFFF',
  fontSize: 13,
  fontFamily: 'monospace',
  fontWeight: 700,
  outline: 'none',
  padding: '1px 0',
  cursor: 'pointer',
  width: '100%',
};

const HeaderBlock = React.memo(function HeaderBlock({ header, onChange }: Props) {
  const set = (key: keyof FlotaHeader, value: string) =>
    onChange({ ...header, [key]: value });

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 shrink-0 flex-wrap"
      style={{ background: 'rgba(18,64,204,0.08)', borderBottom: '1px solid rgba(18,64,204,0.2)' }}
    >
      {TEXT_FIELDS.map(f => (
        <div key={f.key} className="flex flex-col gap-0.5 min-w-[120px]">
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(70,120,255,0.8)' }}>
            {f.label}
          </span>
          <input
            type="text"
            value={(header[f.key] as string) ?? ''}
            onChange={e => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            className="text-[13px] font-mono font-bold outline-none bg-transparent border-b"
            style={{ color: '#FFFFFF', borderColor: 'rgba(51,102,255,0.3)', width: '100%', padding: '1px 0' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#3366FF')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(51,102,255,0.3)')}
          />
        </div>
      ))}

      {/* Forma de pago — INTERNA / EXTERNA */}
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(70,120,255,0.8)' }}>
          FORMA DE PAGO
        </span>
        <select
          value={header.formaPago ?? ''}
          onChange={e => set('formaPago', e.target.value)}
          style={selectStyle}
        >
          <option value="" style={{ background: '#030a2a' }}>— seleccionar —</option>
          {FORMA_PAGO_OPTS.map(o => (
            <option key={o} value={o} style={{ background: '#030a2a' }}>{o}</option>
          ))}
        </select>
      </div>

      {/* Periodicidad */}
      <div className="flex flex-col gap-0.5 min-w-[120px]">
        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(70,120,255,0.8)' }}>
          PERIODICIDAD
        </span>
        <select
          value={header.periodicidad ?? ''}
          onChange={e => onChange({ ...header, periodicidad: e.target.value as Periodicidad })}
          style={selectStyle}
        >
          <option value="" style={{ background: '#030a2a' }}>— seleccionar —</option>
          {PERIODICIDAD_OPTS.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#030a2a' }}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
});

export default HeaderBlock;
