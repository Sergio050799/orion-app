"use client";

import React from 'react';
import type { FlotaHeader } from './types';

interface Props {
  header: FlotaHeader;
  onChange: (h: FlotaHeader) => void;
}

const FIELDS: { key: keyof FlotaHeader; label: string; placeholder: string }[] = [
  { key: 'cif',       label: 'CIF',           placeholder: 'A12345678' },
  { key: 'tomador',   label: 'TOMADOR',        placeholder: 'Empresa S.L.' },
  { key: 'actividad', label: 'ACTIVIDAD',      placeholder: 'Transporte de mercancías' },
  { key: 'formaPago', label: 'FORMA DE PAGO',  placeholder: 'Anual' },
  { key: 'efecto',    label: 'EFECTO',         placeholder: 'DD/MM/YYYY' },
];

const HeaderBlock = React.memo(function HeaderBlock({ header, onChange }: Props) {
  const set = (key: keyof FlotaHeader, value: string) =>
    onChange({ ...header, [key]: value });

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 shrink-0 flex-wrap"
      style={{ background: 'rgba(18,64,204,0.08)', borderBottom: '1px solid rgba(18,64,204,0.2)' }}
    >
      {FIELDS.map(f => (
        <div key={f.key} className="flex flex-col gap-0.5 min-w-[120px]">
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(70,120,255,0.8)' }}>
            {f.label}
          </span>
          <input
            type="text"
            value={header[f.key]}
            onChange={e => set(f.key, e.target.value)}
            placeholder={f.placeholder}
            className="text-[13px] font-mono font-bold outline-none bg-transparent border-b"
            style={{ color: '#FFFFFF', borderColor: 'rgba(51,102,255,0.3)', width: '100%', padding: '1px 0' }}
            onFocus={e => (e.currentTarget.style.borderColor = '#3366FF')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(51,102,255,0.3)')}
          />
        </div>
      ))}
    </div>
  );
});

export default HeaderBlock;
