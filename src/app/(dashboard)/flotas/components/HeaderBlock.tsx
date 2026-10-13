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

const fieldLabel: React.CSSProperties = {
  display: 'block',
  color: 'var(--t-text-3)',
  textTransform: 'uppercase',
  fontSize: 10,
  letterSpacing: '0.07em',
  fontWeight: 750,
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  background: 'var(--t-bg)',
  border: '1px solid var(--t-line)',
  borderRadius: 5,
  padding: '7px 9px',
  color: 'var(--t-text)',
  fontSize: 13,
  fontFamily: 'monospace',
  fontWeight: 700,
  outline: 'none',
};

const HeaderBlock = React.memo(function HeaderBlock({ header, onChange }: Props) {
  const set = (key: keyof FlotaHeader, value: string) =>
    onChange({ ...header, [key]: value });

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 shrink-0 flex-wrap"
      style={{ background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)' }}
    >
      {TEXT_FIELDS.map(f => (
        <div key={f.key} style={{ minWidth: 120 }}>
          <span style={fieldLabel}>{f.label}</span>
          <input
            type="text"
            value={(header[f.key] as string) ?? ''}
            onChange={e => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            style={fieldInput}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--t-blue)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--t-line)')}
          />
        </div>
      ))}

      {/* Forma de pago — INTERNA / EXTERNA */}
      <div style={{ minWidth: 120 }}>
        <span style={fieldLabel}>FORMA DE PAGO</span>
        <select
          value={header.formaPago ?? ''}
          onChange={e => set('formaPago', e.target.value)}
          style={fieldInput}
        >
          <option value="">— seleccionar —</option>
          {FORMA_PAGO_OPTS.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Periodicidad */}
      <div style={{ minWidth: 120 }}>
        <span style={fieldLabel}>PERIODICIDAD</span>
        <select
          value={header.periodicidad ?? ''}
          onChange={e => onChange({ ...header, periodicidad: e.target.value as Periodicidad })}
          style={fieldInput}
        >
          <option value="">— seleccionar —</option>
          {PERIODICIDAD_OPTS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
});

export default HeaderBlock;
