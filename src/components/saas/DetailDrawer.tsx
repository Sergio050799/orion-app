'use client';
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DetailDrawerData {
  over?: string;
  title: string;
  desc?: string;
  stats?: Array<[string, string]>;
  head?: string[];
  rows?: Array<Array<string | number>>;
  fx?: Array<[string, string]>;
  note?: string;
  keep?: boolean;
}

const calcF = ([, f]: [string, string]) =>
  /[÷×Σ]|SUMA\(|PROMEDIO\(|CONTARA\(|\d\s*[−+]\s*\d|\d\s*=\s*\d/.test(f);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data?: DetailDrawerData | null;
  children?: React.ReactNode;
}

export function DetailDrawer({ isOpen, onClose, data, children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      ref.current?.focus({ preventScroll: true });
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  const fx = data?.fx ?? [];
  const annexFx = data?.keep ? fx : fx.filter(calcF);

  return createPortal(
    <>
      <div className={`dr-scrim${isOpen ? ' open' : ''}`} onClick={onClose} />
      <aside
        ref={ref}
        className={`dr-drawer${isOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        tabIndex={-1}
      >
        <button className="dr-x" onClick={onClose} aria-label="Cerrar">×</button>
        {data ? (
          <>
            {data.over && <div className="dr-over">{data.over}</div>}
            <h3>{data.title}</h3>
            {data.desc && <p className="dr-desc">{data.desc}</p>}
            {data.stats && data.stats.length > 0 && (
              <div className="dr-stats">
                {data.stats.map(([lbl, val], i) => (
                  <div key={i}><label>{lbl}</label><strong>{val}</strong></div>
                ))}
              </div>
            )}
            {data.head && data.rows && data.rows.length > 0 && (
              <>
                <h4>Desglose</h4>
                <div className="dr-scroll">
                  <table className="dr-tbl">
                    <thead><tr>{data.head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                    <tbody>{data.rows.map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
            {annexFx.length > 0 && (
              <>
                <h4>Anexo · cómo calcula ORION</h4>
                <div className="dr-annex">
                  {annexFx.map(([lbl, code], i) => (
                    <div className="dr-fx" key={i}><b>{lbl}</b><code>{code}</code></div>
                  ))}
                </div>
              </>
            )}
            {data.note && <p className="dr-note">{data.note}</p>}
          </>
        ) : children}
      </aside>
    </>,
    document.body
  );
}
