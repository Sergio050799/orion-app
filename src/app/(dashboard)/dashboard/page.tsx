"use client";

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type EstadoFlota,
} from '@/core/flotas';
import type { CatStats } from './components/VehiculosCategorias';
import { useAuth } from '@/context/AuthContext';
import { DetailDrawer, type DetailDrawerData } from '@/components/saas/DetailDrawer';

// ─── Formatters ───────────────────────────────────────────────────────────────

function dec(n: number, d = 1): string {
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
}
const nf  = (n: number) => dec(Math.round(n), 0);
const eur = (n: number) => nf(n) + ' €';
const pc  = (n: number, d = 1) => dec(n, d) + ' %';
const sgn = (n: number) => (n >= 0 ? '+' : '−') + pc(Math.abs(n));
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// ─── Utils ────────────────────────────────────────────────────────────────────

function parseFechaFlexible(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function diasHasta(fecha: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.floor((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function displayName(email: string | null): string {
  if (!email) return 'Usuario';
  const local = email.split('@')[0];
  const first = local.split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function tiempoRelativo(isoStr: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const ds = Math.floor(hs / 24);
  if (ds < 7) return `hace ${ds} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

// ─── Monotone cubic spline ────────────────────────────────────────────────────

function monotone(pts: [number, number][]): string {
  const n = pts.length;
  const x = pts.map(p => p[0]);
  const y = pts.map(p => p[1]);
  const h: number[] = [], s: number[] = [], t = new Array<number>(n);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; s[i] = (y[i + 1] - y[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    t[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0;
  }
  t[0] = (3 * s[0] - t[1]) / 2;
  t[n - 1] = (3 * s[n - 2] - t[n - 2]) / 2;
  let d = `M${x[0]},${y[0]}`;
  for (let i = 0; i < n - 1; i++)
    d += ` C${x[i] + h[i] / 3},${y[i] + t[i] * h[i] / 3} ${x[i + 1] - h[i] / 3},${y[i + 1] - t[i + 1] * h[i] / 3} ${x[i + 1]},${y[i + 1]}`;
  return d;
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const c = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].find(v => f <= v + 1e-9)!;
  return c * p;
}

// ─── Chart data ───────────────────────────────────────────────────────────────

const MONTHS = ['Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];
const CHART_DATA = {
  flotas:    { name: 'Flotas',    what: 'Flotas dadas de alta',  fmt: nf,  now: [3,5,1,6,4,2,7,3,2,5,3,3],  prev: [2,3,2,4,2,3,5,2,3,2,3,3]  },
  vehiculos: { name: 'Vehículos', what: 'Vehículos incorporados', fmt: nf, now: [112,148,96,205,176,230,168,141,251,198,165,165], prev: [95,121,110,150,142,170,139,118,190,160,131,129], note: 'El año anterior se estima a partir de flotas históricas por tramos de tamaño.' },
  primas:    { name: 'Primas',    what: 'Prima ofertada',         fmt: eur, now: [88000,96000,71000,118000,109000,142000,126000,98000,151000,132000,94000,91000], prev: [74000,82000,69000,98000,91000,118000,104000,86000,121000,103000,81000,79000] },
};
type MetricKey = keyof typeof CHART_DATA;

// ─── Category classification ──────────────────────────────────────────────────

const SUBTITULOS_CAT: Record<string, string> = {
  '1ª Categoría':   'Turismo · todoterreno · furgoneta',
  '2ª Categoría':   'Camión · tractocamión · autobús',
  '3ª Categoría':   'Moto · ciclomotor · microcar',
  'Sin clasificar': 'Tipo no identificado',
};

function getCategoria(raw: string): string {
  const l = raw.toLowerCase().trim();
  if (/moto(cicleta)?|ciclomotor|microcar|triciclo|cuadri/.test(l)) return '3ª Categoría';
  if (/\bcami[oó]n|tractocami|\btractor\b|cabeza\s*tractora|autob[uú]s|autobus|autocar|microb[uú]s|microbus|semirremolque|\bremolque\b|maquinaria|industrial\s+(?:no\s+)?matriculado|pesado|v\.?\s*industrial|veh[ií]culo\s*industrial/.test(l)) return '2ª Categoría';
  if (/fug[oó]n(?!eta)|furg[oó]n(?!eta)/.test(l)) return '2ª Categoría';
  if (/turismo|berlina|familiar|todoterreno|todo[\s-]terreno|furgoneta|derivado|coupe|cabri|monovolumen|hatchback/.test(l)) return '1ª Categoría';
  return 'Sin clasificar';
}

function getTipologia(raw: string): string {
  const MAP: Record<string, string> = {
    'furgoneta': 'Furgoneta', 'furgonetas': 'Furgoneta',
    'furgon': 'Furgón', 'furgones': 'Furgón', 'furgón': 'Furgón',
    'fugon': 'Furgón', 'fugones': 'Furgón', 'fugón': 'Furgón',
    'v.industrial': 'Industrial', 'v industrial': 'Industrial', 'vindustrial': 'Industrial',
    'vehiculo industrial': 'Industrial', 'vehículo industrial': 'Industrial',
    'turismo': 'Turismo', 'turismos': 'Turismo',
    'berlina': 'Berlina', 'familiar': 'Familiar',
    'todoterreno': 'Todoterreno', 'todo terreno': 'Todoterreno', 'todo-terreno': 'Todoterreno',
    'motocicleta': 'Motocicleta', 'motocicletas': 'Motocicleta', 'moto': 'Motocicleta', 'motos': 'Motocicleta',
    'ciclomotor': 'Ciclomotor', 'ciclomotores': 'Ciclomotor',
    'microcar': 'Microcar',
    'camion rigido': 'Camión rígido', 'camión rígido': 'Camión rígido', 'camiones rigidos': 'Camión rígido',
    'cabeza tractora': 'Cabeza tractora', 'cabezas tractoras': 'Cabeza tractora',
    'tractocamion': 'Tractocamión', 'tractocamión': 'Tractocamión',
    'semirremolque': 'Semirremolque', 'semirremolques': 'Semirremolque',
    'autobus': 'Autobús', 'autobuses': 'Autobús', 'autobús': 'Autobús',
    'autocar': 'Autocar', 'autocares': 'Autocar',
    'microbus': 'Microbús', 'microbús': 'Microbús',
    'maquinaria': 'Maquinaria',
    'derivado de turismo': 'Derivado de turismo',
    'industrial matriculado': 'Industrial matriculado',
    'industrial no matriculado': 'Industrial no matriculado',
  };
  const l = raw.toLowerCase().trim();
  return MAP[l] ?? (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
}

// ─── Estado definitions ───────────────────────────────────────────────────────

type SegDef = { key: EstadoFlota; label: string; color: string };
const SEGS: SegDef[] = [
  { key: 'CONTRATADA', label: 'Contratadas', color: 'var(--st-contratada)' },
  { key: 'EN ESTUDIO', label: 'En estudio',  color: 'var(--st-estudio)'    },
  { key: 'OFERTADA',   label: 'Ofertadas',   color: 'var(--st-ofertada)'   },
  { key: 'RECHAZADA',  label: 'Rechazadas',  color: 'var(--st-rechazada)'  },
];

const ESTADO_LABELS: Record<string, string> = {
  'CONTRATADA': 'Contratada', 'EN ESTUDIO': 'En estudio',
  'ESTUDIADA':  'Estudiada',  'OFERTADA':   'Ofertada', 'RECHAZADA': 'Rechazada',
};
const ESTADO_COLORS: Record<string, string> = {
  'CONTRATADA': 'var(--st-contratada)', 'EN ESTUDIO': 'var(--st-estudio)',
  'ESTUDIADA':  'var(--st-estudiada)',  'OFERTADA':   'var(--st-ofertada)', 'RECHAZADA': 'var(--st-rechazada)',
};

// ─── Drawer types ─────────────────────────────────────────────────────────────

type DrawerData = DetailDrawerData;

// ─── Sugerencias ──────────────────────────────────────────────────────────────

function SugerenciasSection({ user }: { user: string | null }) {
  const [titulo, setTitulo] = useState('');
  const [desc,   setDesc]   = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');

  const send = useCallback(async () => {
    if (!titulo.trim() || !desc.trim()) return;
    setStatus('sending');
    try {
      const me = await fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null);
      await fetch('/api/admin/mejoras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: me?.username || user || '', titulo: titulo.trim(), descripcion: desc.trim() }),
      });
      setStatus('done');
      setTimeout(() => { setStatus('idle'); setTitulo(''); setDesc(''); }, 2500);
    } catch {
      setStatus('idle');
    }
  }, [titulo, desc, user]);

  return (
    <div style={{ paddingTop: 36, borderTop: '1px solid var(--line)', marginTop: 8 }}>
      <h2 className="db-h2" style={{ marginBottom: 6 }}>Sugerencias de mejora</h2>
      <p style={{ fontSize: 14, color: 'var(--sub)', margin: '0 0 20px' }}>
        Cualquier idea que te parezca útil. Se revisa en el panel de administración.
      </p>
      {status === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 5, background: 'rgba(76,175,133,.07)', border: '1px solid rgba(76,175,133,.22)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          <span style={{ fontSize: 13, color: 'var(--ok)' }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(220px,2fr) auto', gap: 12, maxWidth: 1100 }}>
          <input className="db-input" type="text" value={titulo} maxLength={100} onChange={e => setTitulo(e.target.value)} placeholder="Título" />
          <input className="db-input" type="text" value={desc}   maxLength={350} onChange={e => setDesc(e.target.value)}   placeholder="Descripción" />
          <button
            onClick={send}
            disabled={status === 'sending' || !titulo.trim() || !desc.trim()}
            className="db-go"
          >
            {status === 'sending' ? 'Enviando…' : 'Enviar sugerencia'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Evolution Chart ──────────────────────────────────────────────────────────

function EvolutionChart({
  metric, period, onDetailClick,
}: {
  metric: MetricKey;
  period: number;
  onDetailClick: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const [tipContent, setTipContent] = useState('');
  const [tipPos, setTipPos]         = useState({ left: 0, top: 8 });
  const [crosshair, setCrosshair]   = useState<{ x: number; pn: [number,number]; pp: [number,number] } | null>(null);
  const [dims, setDims] = useState({ W: 780, H: 312 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) {
        const W = Math.max(300, Math.min(900, Math.round(w)));
        const H = Math.round(W * (W < 520 ? 0.7 : 0.4));
        setDims({ W, H });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const S    = CHART_DATA[metric];
  const now  = S.now.slice(-period);
  const prev = S.prev.slice(-period);
  const labels = MONTHS.slice(-period);

  const { W, H } = dims;
  const L = W < 520 ? 40 : 52;
  const R = W < 520 ? 12 : 18;
  const T = 18;
  const B = 34;
  const iw = W - L - R;
  const ih = H - T - B;

  const raw  = Math.max(...now, ...prev, 4);
  const step = niceStep(raw * 1.05 / 4);
  const max  = step * 4;

  const X = (i: number) => L + iw * i / (now.length - 1);
  const Y = (v: number) => T + ih - ih * v / max;

  const pn: [number, number][] = now.map((v, i) => [X(i), Y(v)]);
  const pp: [number, number][] = prev.map((v, i) => [X(i), Y(v)]);
  const dn = monotone(pn);
  const dp = monotone(pp);

  const axisLbl = (v: number) => metric === 'primas'
    ? (v ? (Number.isInteger(v / 1000) ? nf(v / 1000) : dec(v / 1000, 1)) + ' k' : '0')
    : (Number.isInteger(v) ? nf(v) : dec(v, 1));

  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const v = max * i / 4;
    const yv = Y(v);
    return { v, yv };
  });

  const last = pn[pn.length - 1];
  const atIdx = (clientX: number, svgRect: DOMRect) => {
    const sx = (clientX - svgRect.left) / svgRect.width * W;
    return Math.max(0, Math.min(now.length - 1, Math.round((sx - L) / iw * (now.length - 1))));
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const svgRect = svg.getBoundingClientRect();
    const containerRect = containerRef.current!.getBoundingClientRect();
    const idx = atIdx(e.clientX, svgRect);
    const k = svgRect.width / W;
    const tx = X(idx) * k + (svgRect.left - containerRect.left);
    const flip = tx > containerRect.width - 200;
    setCrosshair({ x: X(idx), pn: pn[idx], pp: pp[idx] });
    const d = prev[idx] ? ((now[idx] - prev[idx]) / prev[idx] * 100) : null;
    setTipContent(`<b>${labels[idx]}</b><br><span class="db-tip-k"></span>${S.fmt(now[idx])}<br><span class="db-tip-k db-tip-kp"></span>${S.fmt(prev[idx])}<br><span style="color:var(--quiet)">${d === null ? '—' : sgn(d)} interanual</span>`);
    setTipPos({ left: flip ? tx - 180 : tx + 14, top: 8 });
    setTipVisible(true);
  }, [now, prev, pn, pp, labels, S, W, X]);

  const handleMouseLeave = useCallback(() => {
    setCrosshair(null);
    setTipVisible(false);
  }, []);

  const totalNow  = sum(now);
  const totalPrev = sum(prev);
  const delta     = totalPrev ? (totalNow - totalPrev) / totalPrev * 100 : null;

  return (
    <div>
      <div className="db-hero">
        <div>
          <div className="db-big">{S.fmt(totalNow)}</div>
          <div className="db-cap">{S.what} · {period} meses</div>
        </div>
        <div>
          <div className="db-big">{delta === null ? '—' : sgn(delta)}</div>
          <div className="db-cap">frente al año anterior</div>
        </div>
      </div>

      <div ref={containerRef} className="db-chart" onClick={onDetailClick} style={{ cursor: 'pointer' }}>
        <div
          className={`db-tip${tipVisible ? ' on' : ''}`}
          style={{ left: tipPos.left, top: tipPos.top }}
          dangerouslySetInnerHTML={{ __html: tipContent }}
        />
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
          role="img" aria-label={`Evolución de ${S.name.toLowerCase()}`}>
          <defs>
            <linearGradient id="dbGradA" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--blue)" stopOpacity="0.26" />
              <stop offset="1" stopColor="var(--blue)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map(({ v, yv }) => (
            <g key={v}>
              <line className="db-grid-l" x1={L} x2={W - R} y1={yv} y2={yv} />
              <text className="db-ax" x={L - 10} y={yv + 4} textAnchor="end">{axisLbl(v)}</text>
            </g>
          ))}
          {labels.map((m, i) => (
            (period > 6 && i % 2 === 0) ? null :
            <text key={i} className="db-ax" x={X(i)} y={H - 8} textAnchor="middle">{m.toUpperCase()}</text>
          ))}

          <path d={`${dn} L${last[0]},${T + ih} L${pn[0][0]},${T + ih}Z`} fill="url(#dbGradA)" />
          <path d={dp} fill="none" stroke="var(--prev)" strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />
          <path className="db-draw" pathLength={1} d={dn} fill="none" stroke="var(--blue)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />

          {pn.map((p, i) => i === pn.length - 1 ? null : (
            <circle key={i} cx={p[0]} cy={p[1]} r="3.6" fill="var(--bg)" stroke="var(--blue)" strokeWidth="2" />
          ))}
          <circle cx={last[0]} cy={last[1]} r="5.5" fill="var(--blue)" stroke="var(--bg)" strokeWidth="2" />

          {crosshair && (
            <>
              <line x1={crosshair.x} x2={crosshair.x} y1={T} y2={T + ih} stroke="var(--quiet)" strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
              <circle cx={crosshair.pn[0]} cy={crosshair.pn[1]} r="5.5" fill="var(--blue)" stroke="var(--bg)" strokeWidth="2" />
              <circle cx={crosshair.pp[0]} cy={crosshair.pp[1]} r="4.5" fill="var(--prev)" stroke="var(--bg)" strokeWidth="2" />
            </>
          )}

          <rect
            x={L} y={T} width={iw} height={ih}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
        </svg>
      </div>

      <div className="db-legend">
        <span><i className="db-ln" /> Periodo actual</span>
        <span><i className="db-ln db-ln-p" /> Mismo periodo del año anterior</span>
      </div>
      {metric === 'vehiculos' && CHART_DATA.vehiculos.note && (
        <p className="db-note">{CHART_DATA.vehiculos.note}</p>
      )}
    </div>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────────

function CarteraDonut({
  counts, total, onSegClick, onTotalClick,
}: {
  counts: Record<string, number>;
  total:  number;
  onSegClick:   (key: string) => void;
  onTotalClick: () => void;
}) {
  const r   = 84;
  const C   = 2 * Math.PI * r;
  const gap = 2.5;
  let off   = 0;

  const segs = SEGS
    .map(s => {
      const count  = counts[s.key] ?? 0;
      const len    = total > 0 ? (count / total) * C : 0;
      const dash   = Math.max(len - gap, 0);
      const segOff = -off;
      off += len;
      return { ...s, count, dash, segOff };
    })
    .filter(s => s.count > 0);

  return (
    <svg viewBox="0 0 220 220" style={{ display: 'block', width: '100%', height: 'auto', cursor: 'pointer' }}
      onClick={onTotalClick} aria-label="Situación de la cartera">
      <circle r={r} cx={110} cy={110} fill="none" stroke="var(--soft)" strokeWidth={26} />
      {segs.map(s => (
        <circle key={s.key}
          className="db-seg"
          r={r} cx={110} cy={110}
          fill="none" stroke={s.color} strokeWidth={26}
          strokeDasharray={`${s.dash} ${C - s.dash}`}
          strokeDashoffset={`${s.segOff}`}
          transform="rotate(-90 110 110)"
          onClick={e => { e.stopPropagation(); onSegClick(s.key); }}
          tabIndex={0} role="button" aria-label={`${s.label}: ${s.count} flotas`}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSegClick(s.key)}
        />
      ))}
      <text x={110} y={110} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 38, fontWeight: 600, fill: 'var(--text)', letterSpacing: '-0.05em', fontFamily: 'var(--font-display)', pointerEvents: 'none' }}>
        {total}
      </text>
      <text x={110} y={136} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: 9, fill: 'var(--quiet)', letterSpacing: '0.12em', fontFamily: 'inherit', pointerEvents: 'none' }}>
        FLOTAS
      </text>
    </svg>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`db-toast${visible ? ' on' : ''}`} role="status">
      {message}
    </div>
  );
}

// ─── Stacked bar animation ────────────────────────────────────────────────────

function StackedBar({ segments }: { segments: { color: string; pct: number }[] }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="db-stack">
      {segments.map((s, i) => (
        <span key={i} style={{ background: s.color, width: animated ? `${s.pct}%` : '0%' }} />
      ))}
    </div>
  );
}

// ─── Bar fill animation ───────────────────────────────────────────────────────

function AnimBar({ pct, dim }: { pct: number; dim: boolean }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <span className="db-bar-t">
      <span className={`db-bar-f${dim ? ' d' : ''}`} style={{ width: animated ? `${pct}%` : '0%' }} />
    </span>
  );
}

// ─── Alert banner ─────────────────────────────────────────────────────────────

function AlertBanner({ count, nombre }: { count: number; nombre?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', marginBottom: 24, borderRadius: 5, background: 'rgba(224,92,92,.06)', border: '1px solid rgba(224,92,92,.2)', fontSize: 13, color: 'var(--danger)' }}>
      <div className="db-blink" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
      {count === 1 ? `${nombre} — póliza vencida, pendiente de renovación` : `${count} pólizas vencidas pendientes de renovación`}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

export default function DashboardPage() {
  const { user } = useAuth();
  const [carpetas,   setCarpetas]   = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [scope,      setScope]      = useState<string>('all');
  const [metric,     setMetric]     = useState<MetricKey>('vehiculos');
  const [period,     setPeriod]     = useState<number>(12);
  const [drawer,     setDrawer]     = useState<DrawerData | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast,      setToast]      = useState('');
  const [toastVis,   setToastVis]   = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const ac = new AbortController();
    cargarCarpetasDelServidor(ac.signal).then(setCarpetas).catch(() => {});
    cargarCorredoresDelServidor(ac.signal).then(setCorredores).catch(() => {});
    return () => ac.abort();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVis(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVis(false), 2800);
  }, []);

  const openDrawer = useCallback((data: DrawerData) => {
    setDrawer(data);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const corredorMap = useMemo(() => {
    const map = new Map<string, Corredor>();
    corredores.forEach(c => map.set(c.id, c));
    return map;
  }, [corredores]);

  const scopedCarpetas = useMemo(
    () => scope === 'all' ? carpetas : carpetas.filter(c => c.estado === scope),
    [carpetas, scope],
  );

  const flotasEstadoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    carpetas.forEach(c => { counts[c.estado] = (counts[c.estado] ?? 0) + 1; });
    return counts;
  }, [carpetas]);

  const totalCartera   = carpetas.length;
  const totalPortfolio = scopedCarpetas.length;
  const contratadas    = flotasEstadoCounts['CONTRATADA'] ?? 0;
  const tasaContratacion = totalCartera > 0 ? (contratadas / totalCartera) * 100 : 0;

  const totalVehiculos = useMemo(() => {
    let total = 0;
    for (const c of scopedCarpetas) {
      const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
      total += (rows ?? []).length;
    }
    return total;
  }, [scopedCarpetas]);

  const corredoresActivos = useMemo(() => {
    const ids = new Set<string>();
    scopedCarpetas.forEach(c => { if (c.corredor_id) ids.add(c.corredor_id); });
    return ids.size;
  }, [scopedCarpetas]);

  const renovaciones = useMemo(() => {
    const source = (scope === 'all' || scope === 'CONTRATADA')
      ? carpetas.filter(c => c.estado === 'CONTRATADA')
      : [];
    return source
      .filter(c => c.header?.fechaVencimiento)
      .flatMap(c => {
        const fecha = parseFechaFlexible(c.header!.fechaVencimiento!);
        if (!fecha) return [];
        const dias     = diasHasta(fecha);
        const corredor = c.corredor_id ? (corredorMap.get(c.corredor_id) ?? null) : null;
        return [{ carpeta: c, corredor, fecha, dias }];
      })
      .sort((a, b) => a.dias - b.dias);
  }, [carpetas, scope, corredorMap]);

  // Solo pendientes de vencer (aparecen en la tabla del dashboard)
  const renovacionesProximas = renovaciones.filter(r => r.dias >= 0 && r.dias <= 60);
  // Ya vencidas: solo visibles en el drawer / informe
  const flotasVencidas       = renovaciones.filter(r => r.dias < 0);
  const vencidasUrgentes     = flotasVencidas.filter(r => r.fecha.getFullYear() < CURRENT_YEAR);
  const renovacionesUrgentes = renovacionesProximas.filter(r => r.dias <= 15);

  const corredoresStats = useMemo(() => {
    const counts = new Map<string, { nombre: string; total: number }>();
    for (const c of scopedCarpetas) {
      if (!c.corredor_id) continue;
      const cor = corredorMap.get(c.corredor_id);
      if (!cor) continue;
      const ex = counts.get(c.corredor_id);
      if (ex) ex.total++;
      else counts.set(c.corredor_id, { nombre: cor.nombre, total: 1 });
    }
    return Array.from(counts.values()).sort((a, b) => b.total - a.total);
  }, [scopedCarpetas, corredorMap]);

  const actividadReciente = useMemo(() => {
    type ActEntry = { fecha: string; accion: string; carpeta: FlotaCarpeta; estadoNuevo?: EstadoFlota; modulo: string; usuario: string };

    function derivarModulo(accion: string, estado?: EstadoFlota): string {
      const l = accion.toLowerCase();
      if (/vehículo|vehíc|matrícula|importó|importa/.test(l)) return 'Vehículos';
      if (/corredor|intermediario|comercial/.test(l)) return 'Corredores';
      if (/contratad|emisión|emite|póliza/.test(l) || estado === 'CONTRATADA') return 'Flotas';
      if (/ofertad|oferta/.test(l) || estado === 'OFERTADA') return 'Estudio';
      return 'Estudio';
    }

    const entries: ActEntry[] = [];
    for (const c of carpetas) {
      for (const h of (c.historico ?? [])) {
        entries.push({
          fecha: h.fecha, accion: h.accion, carpeta: c, estadoNuevo: h.estadoNuevo,
          modulo:  derivarModulo(h.accion, h.estadoNuevo),
          usuario: c.creado_por ?? '—',
        });
      }
    }
    if (entries.length < 3) {
      const sorted = [...carpetas].sort((a, b) =>
        new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()
      );
      for (const c of sorted.slice(0, 6)) {
        if (!entries.find(e => e.carpeta.id === c.id))
          entries.push({
            fecha: c.actualizadaEn, accion: 'Actualizado', carpeta: c, estadoNuevo: c.estado,
            modulo: derivarModulo('Actualizado', c.estado),
            usuario: c.creado_por ?? '—',
          });
      }
    }
    return entries.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 6);
  }, [carpetas]);

  const vehiculosCatStats = useMemo((): CatStats[] => {
    const acc: Record<string, Record<string, Record<string, number>>> = {
      '1ª Categoría': {}, '2ª Categoría': {}, '3ª Categoría': {}, 'Sin clasificar': {},
    };
    for (const carpeta of scopedCarpetas) {
      const rows   = carpeta.trabajo?.length > 0 ? carpeta.trabajo : carpeta.original;
      const estado = carpeta.estado;
      for (const row of (rows ?? [])) {
        const raw = row['tipo_vehiculo']?.trim();
        if (!raw) continue;
        const cat = getCategoria(raw);
        const tip = getTipologia(raw);
        if (!acc[cat][tip]) acc[cat][tip] = {};
        acc[cat][tip][estado] = (acc[cat][tip][estado] ?? 0) + 1;
      }
    }
    const ORDERED = ['1ª Categoría', '2ª Categoría', '3ª Categoría', 'Sin clasificar'];
    return ORDERED
      .map(cat => {
        const tipMap     = acc[cat];
        const tipologias = Object.entries(tipMap)
          .map(([tip, estadoMap]) => ({
            tipologia:  tip,
            estudio:    estadoMap['EN ESTUDIO']  ?? 0,
            ofertada:   estadoMap['OFERTADA']    ?? 0,
            contratada: estadoMap['CONTRATADA']  ?? 0,
            total: Object.values(estadoMap).reduce((s, v) => s + v, 0),
          }))
          .sort((a, b) => b.total - a.total);
        return {
          categoria:  cat,
          subtitulo:  SUBTITULOS_CAT[cat] ?? '',
          tipologias,
          estudio:    tipologias.reduce((s, t) => s + t.estudio,    0),
          ofertada:   tipologias.reduce((s, t) => s + t.ofertada,   0),
          contratada: tipologias.reduce((s, t) => s + t.contratada, 0),
          total:      tipologias.reduce((s, t) => s + t.total,      0),
        };
      })
      .filter(c => c.total > 0);
  }, [scopedCarpetas]);

  // ── Detail drawer builder ───────────────────────────────────────────────────

  const sName = scope === 'all' ? 'Toda la cartera' : (ESTADO_LABELS[scope] ?? scope);
  const ctx   = scope === 'all' ? '' : ` · ${sName}`;

  const buildDetail = useCallback((key: string): DrawerData | null => {
    const totalCat = sum(vehiculosCatStats.map(c => c.total));

    if (key === 'flotas') return {
      over: 'Resumen' + ctx,
      title: 'Flotas en cartera',
      desc: 'Expedientes de flota registrados en ORION, repartidos por estado.',
      stats: [['Seleccionadas', nf(totalPortfolio)], ['Total cartera', nf(totalCartera)]],
      head: ['Estado', 'Flotas', '% del total'],
      rows: SEGS.map(s => [s.label, nf(flotasEstadoCounts[s.key] ?? 0), totalCartera > 0 ? pc((flotasEstadoCounts[s.key] ?? 0) / totalCartera * 100) : '—']),
      fx: [
        ['Flotas en cartera', `${totalCartera} expedientes en total`],
        ['Peso del estado', 'flotas del estado ÷ total × 100'],
        ['Ámbito actual', `${sName} = ${nf(totalPortfolio)} flotas`],
      ],
    };

    if (key === 'vehiculos') return {
      over: 'Resumen' + ctx,
      title: 'Vehículos',
      desc: 'Vehículos identificados dentro de los expedientes con detalle cargado.',
      stats: [['En el ámbito', nf(totalVehiculos)], ['Categorías', nf(vehiculosCatStats.length)]],
      head: ['Categoría', 'Vehículos', '% del ámbito'],
      rows: vehiculosCatStats.map(c => [c.categoria, nf(c.total), totalCat > 0 ? pc(c.total / totalCat * 100) : '—']),
      fx: [
        ['Vehículos totales', `Σ vehículos de las flotas con detalle = ${nf(totalVehiculos)}`],
        ['% del ámbito', 'vehículos de la categoría ÷ total × 100'],
      ],
      note: 'Las flotas contratadas históricas no tienen vehículos asociados.',
    };

    if (key === 'tasa') {
      const contRate = (scope === 'all' || scope === 'CONTRATADA') ? contratadas : 0;
      return {
        over: 'Resultado' + ctx,
        title: 'Tasa de contratación',
        desc: 'Proporción de flotas contratadas sobre las flotas del ámbito.',
        stats: [['Contratadas', nf(contRate)], ['Flotas del ámbito', nf(totalPortfolio)], ['Tasa', totalPortfolio > 0 ? pc(contRate / totalPortfolio * 100, 0) : '—']],
        head: ['Estado', 'Flotas', '% del total'],
        rows: SEGS.map(s => [s.label, nf(flotasEstadoCounts[s.key] ?? 0), totalCartera > 0 ? pc((flotasEstadoCounts[s.key] ?? 0) / totalCartera * 100) : '—']),
        fx: [['Tasa de contratación', `contratadas ÷ flotas del ámbito × 100 = ${contRate} ÷ ${totalPortfolio} × 100 = ${totalPortfolio > 0 ? pc(contRate / totalPortfolio * 100, 0) : '—'}`]],
      };
    }

    if (key === 'corredores') return {
      over: 'Corredores' + ctx,
      title: 'Corredores activos',
      desc: 'Corredores con al menos una flota en el ámbito seleccionado.',
      stats: [['Corredores', String(corredoresActivos)], ['Flotas', nf(totalPortfolio)]],
      head: ['Corredor', 'Flotas', '% del ámbito'],
      rows: corredoresStats.map(b => [b.nombre, nf(b.total), totalPortfolio > 0 ? pc(b.total / totalPortfolio * 100) : '—']),
      fx: [
        ['Corredores activos', `recuento de corredores con ≥ 1 flota = ${corredoresActivos}`],
        ['Participación', 'flotas del corredor ÷ flotas del ámbito × 100'],
      ],
    };

    if (key === 'renovaciones') {
      const vehProx  = sum(renovacionesProximas.map(r => (r.carpeta.trabajo?.length ?? 0) > 0 ? r.carpeta.trabajo.length : (r.carpeta.original?.length ?? 0)));
      const vencRows = flotasVencidas.map(r => {
        const fechaStr = r.fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return [r.carpeta.nombre, r.corredor?.nombre ?? 'Sin corredor', `Venció ${fechaStr}`];
      });
      const proxRows = renovacionesProximas.map(r => [r.carpeta.nombre, r.corredor?.nombre ?? 'Sin corredor', `${r.dias} días`]);
      return {
        over: 'Renovaciones' + ctx,
        title: 'Renovaciones próximas',
        desc: 'Flotas contratadas con vencimiento en los próximos 60 días. Las flotas ya vencidas se muestran al final para seguimiento.',
        stats: [['Próximas (60d)', String(renovacionesProximas.length)], ['Urgentes (≤15d)', String(renovacionesUrgentes.length)], ['Vencidas', String(flotasVencidas.length)], ['Vehículos', nf(vehProx)]],
        head: ['Flota', 'Corredor', 'Vence en'],
        rows: [
          ...proxRows,
          ...(vencRows.length > 0 ? [['── Vencidas / renovar ──', '', '']] : []),
          ...vencRows,
        ],
        fx: [
          ['Días hasta vencimiento', 'fecha de vencimiento − fecha actual'],
          ['Próxima', '0 ≤ días ≤ 60 (aparece en la tabla del dashboard)'],
          ['Urgente', '0 ≤ días ≤ 15'],
          ['Vencida', 'días < 0 (solo en este detalle e informe)'],
        ],
      };
    }

    if (key === 'evolucion') {
      const S    = CHART_DATA[metric];
      const D    = S;
      const now  = D.now.slice(-period);
      const prev = D.prev.slice(-period);
      const labels = MONTHS.slice(-period);
      const A    = sum(now);
      const B    = sum(prev);
      const dd   = B ? (A - B) / B * 100 : null;
      return {
        over: `Serie histórica · ${S.name}${ctx}`,
        title: `Evolución de ${S.name.toLowerCase()}`,
        desc: `${S.what} cada mes, comparado con el mismo periodo del año anterior.`,
        stats: [['Periodo actual', S.fmt(A)], ['Año anterior', S.fmt(B)], ['Variación', dd === null ? '—' : sgn(dd)]],
        head: ['Mes', 'Actual', 'Anterior', 'Variación'],
        rows: labels.map((m, j) => [m, S.fmt(now[j]), S.fmt(prev[j]), prev[j] ? sgn((now[j] - prev[j]) / prev[j] * 100) : '—']),
        fx: [
          ['Total del periodo', `Σ valor mensual = ${S.fmt(A)}`],
          ['Variación interanual', dd === null ? 'sin datos del año anterior' : `(${S.fmt(A)} − ${S.fmt(B)}) ÷ ${S.fmt(B)} × 100 = ${sgn(dd)}`],
          ['Variación mensual', '(mes actual − mismo mes del año anterior) ÷ mismo mes del año anterior × 100'],
        ],
        note: 'La curva se dibuja con interpolación monótona: suaviza el trazo pero nunca supera ni baja de los valores reales de cada mes.',
      };
    }

    if (key === 'estados') return {
      over: 'Estados',
      title: 'Situación de la cartera',
      desc: 'Reparto de las flotas según su estado actual.',
      stats: [['Total', nf(totalCartera)], ['Contratadas', nf(contratadas)]],
      head: ['Estado', 'Flotas', '% del total'],
      rows: SEGS.map(s => [s.label, nf(flotasEstadoCounts[s.key] ?? 0), totalCartera > 0 ? pc((flotasEstadoCounts[s.key] ?? 0) / totalCartera * 100) : '—']),
      fx: SEGS.map(s => [`${s.label}`, `${(flotasEstadoCounts[s.key] ?? 0)} ÷ ${totalCartera} × 100 = ${totalCartera > 0 ? pc((flotasEstadoCounts[s.key] ?? 0) / totalCartera * 100) : '—'}`]),
    };

    if (key.startsWith('estado:')) {
      const estadoKey = key.slice(7).toUpperCase() as EstadoFlota;
      const seg = SEGS.find(s => s.key === estadoKey);
      if (!seg) return null;
      const count = flotasEstadoCounts[estadoKey] ?? 0;
      return {
        over: 'Estado',
        title: seg.label,
        desc: 'Flotas en este estado.',
        stats: [['Flotas', nf(count)], ['Peso', totalCartera > 0 ? pc(count / totalCartera * 100) : '—']],
        head: ['Categoría', 'Vehículos'],
        rows: vehiculosCatStats.map(c => [c.categoria, nf(c.total)]),
        fx: [['Participación', `flotas del estado ÷ total = ${count} ÷ ${totalCartera} × 100 = ${totalCartera > 0 ? pc(count / totalCartera * 100) : '—'}`]],
      };
    }

    if (key === 'categorias' || key.startsWith('cat:')) {
      const idx = key.startsWith('cat:') ? parseInt(key.slice(4)) : -1;
      const sel = idx >= 0 ? [vehiculosCatStats[idx]].filter(Boolean) : vehiculosCatStats;
      if (sel.length === 0) return null;
      const tot = sel.reduce((o, c) => ({ e: o.e + c.estudio, o: o.o + c.ofertada, c: o.c + c.contratada, t: o.t + c.total }), { e: 0, o: 0, c: 0, t: 0 });
      return {
        over: (idx >= 0 ? 'Categoría' : 'Vehículos') + ctx,
        title: idx >= 0 ? sel[0].categoria : 'Vehículos por categoría',
        desc: (idx >= 0 ? (sel[0].subtitulo + '. ') : '') + 'Vehículos de cada categoría según el estado de su expediente.',
        stats: [['En estudio', nf(tot.e)], ['Ofertados', nf(tot.o)], ['Contratados', nf(tot.c)], ['Total', nf(tot.t)]],
        head: ['Categoría', 'Estudio', 'Ofert.', 'Contrat.', 'Total', '% contrat.'],
        rows: sel.map(c => [c.categoria, nf(c.estudio), nf(c.ofertada), nf(c.contratada), nf(c.total), c.total > 0 ? pc(c.contratada / c.total * 100) : '—']),
        fx: [
          ['Total por categoría', 'en estudio + ofertados + contratados + resto'],
          ['Tasa de contratación', `contratados ÷ total × 100 = ${tot.c} ÷ ${tot.t} × 100 = ${tot.t > 0 ? pc(tot.c / tot.t * 100) : '—'}`],
        ],
      };
    }

    if (key.startsWith('broker:')) {
      const idx = parseInt(key.slice(7));
      const b   = corredoresStats[idx];
      if (!b) return null;
      return {
        over: 'Corredor' + ctx,
        title: b.nombre,
        desc: 'Flotas vinculadas a este corredor.',
        stats: [['Flotas', String(b.total)], ['Participación', totalPortfolio > 0 ? pc(b.total / totalPortfolio * 100) : '—']],
        head: ['Corredor', 'Flotas'],
        rows: [[b.nombre, nf(b.total)]],
        fx: [['Participación', `${b.total} ÷ ${totalPortfolio} × 100 = ${totalPortfolio > 0 ? pc(b.total / totalPortfolio * 100, 2) : '—'}`]],
      };
    }

    if (key === 'corredores_otros') return {
      over: 'Corredores' + ctx,
      title: 'Otros corredores',
      desc: 'Corredores con menor número de flotas en el ámbito.',
      stats: [['Corredores', String(Math.max(0, corredoresStats.length - 7))], ['Flotas', nf(sum(corredoresStats.slice(7).map(b => b.total)))]],
      head: ['Corredor', 'Flotas'],
      rows: corredoresStats.slice(7).map(b => [b.nombre, nf(b.total)]),
      fx: [],
    };

    if (key.startsWith('ren:')) {
      const idx = parseInt(key.slice(4));
      const r   = renovacionesProximas[idx];
      if (!r) return null;
      const veh = (r.carpeta.trabajo?.length ?? 0) > 0 ? r.carpeta.trabajo.length : (r.carpeta.original?.length ?? 0);
      return {
        over: 'Renovación',
        title: r.carpeta.nombre,
        desc: 'Próximo vencimiento de la flota.',
        stats: [['Vence en', `${r.dias} días`], ['Vehículos', String(veh)]],
        head: ['Concepto', 'Valor'],
        rows: [
          ['Corredor', r.corredor?.nombre ?? 'Sin corredor'],
          ['Vehículos', String(veh)],
          ['Vencimiento', `En ${r.dias} días`],
        ],
        fx: [['Días hasta vencimiento', `fecha de vencimiento − fecha actual = ${r.dias} días`]],
      };
    }

    if (key.startsWith('act:')) {
      const idx = parseInt(key.slice(4));
      const a   = actividadReciente[idx];
      if (!a) return null;
      return {
        over: `Actividad · ${a.modulo}`,
        title: a.accion,
        desc:  `${a.usuario} · ${tiempoRelativo(a.fecha)} · ${a.carpeta.nombre}`,
        stats: [['Usuario', a.usuario], ['Módulo', a.modulo], ['Hora', tiempoRelativo(a.fecha)]],
        head: ['Campo', 'Antes', 'Después'],
        rows: [
          ['Carpeta',  '—', a.carpeta.nombre],
          ['Estado',   '—', a.estadoNuevo ? (ESTADO_LABELS[a.estadoNuevo] ?? a.estadoNuevo) : '—'],
          ['Acción',   '—', a.accion],
        ],
        fx: [['Dónde ocurrió', `${a.modulo} · ${a.carpeta.nombre}`]],
      };
    }

    return null;
  }, [scope, metric, period, totalPortfolio, totalCartera, contratadas, totalVehiculos, corredoresActivos, corredoresStats, renovaciones, renovacionesUrgentes, actividadReciente, vehiculosCatStats, flotasEstadoCounts, sName, ctx]);

  const handleDetail = useCallback((key: string) => {
    const data = buildDetail(key);
    if (data) openDrawer(data);
    else showToast('Detalle no disponible para este elemento.');
  }, [buildDetail, openDrawer, showToast]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const hora     = new Date().getHours();
  const saludo   = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
  const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const TOPB    = 7;
  const maxBrok = corredoresStats.length > 0 ? corredoresStats[0].total : 1;
  const brokerRows = corredoresStats.length > TOPB + 1
    ? [...corredoresStats.slice(0, TOPB), { nombre: `Otros corredores (${corredoresStats.length - TOPB})`, total: sum(corredoresStats.slice(TOPB).map(b => b.total)), isAgg: true }]
    : corredoresStats.map(b => ({ ...b, isAgg: false }));

  const catCols: { id: string; var: string }[] = [
    { id: 'estudio',    var: '--st-estudio'    },
    { id: 'ofertada',   var: '--st-ofertada'   },
    { id: 'contratada', var: '--st-contratada' },
    { id: 'rechazada',  var: '--st-rechazada'  },
  ];

  const catMax = vehiculosCatStats.reduce((m, c) => Math.max(m, c.total), 1);

  return (
    <div className="animate-in fade-in duration-500">
      <style>{`
        /* ── Dashboard scoped styles ── */
        .db-h2{font:600 clamp(18px,1.5cqw,22px)/1.25 var(--font-display);letter-spacing:-.03em;margin:0}
        .db-h2-link{cursor:pointer;transition:color .16s}
        .db-h2-link:hover{color:var(--blue)}
        .db-shead{margin-bottom:20px}
        .db-note{font-size:13px;color:var(--quiet);line-height:1.6;margin-top:14px}
        .db-sub{font-size:14px;color:var(--sub);margin:6px 0 0}

        /* KPI strip */
        .db-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
        .db-kpi{all:unset;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;cursor:pointer;padding:24px 18px 24px 0;min-width:0;transition:background .16s}
        .db-kpi+.db-kpi{padding-left:clamp(12px,1.8cqw,22px);border-left:1px solid var(--line)}
        .db-kpi:hover{background:var(--hover)}
        .db-kpi:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
        .db-kpi .l{font-size:12px;font-weight:500;color:var(--sub);text-transform:uppercase;letter-spacing:.07em}
        .db-kpi .v{font:600 clamp(28px,3.1cqw,44px)/1.05 var(--font-display);letter-spacing:-.055em;margin:10px 0 8px;font-variant-numeric:tabular-nums;transition:color .16s}
        .db-kpi:hover .v{color:var(--blue-2)}
        .db-kpi .n{font-size:13px;color:var(--quiet);line-height:1.5}
        .db-kpi .n b{color:var(--blue-2);font-weight:600}

        /* Grids */
        .db-grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);border-bottom:1px solid var(--line)}
        .db-grid2.r40{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}
        .db-grid2>section{padding:28px 0 30px;min-width:0}
        .db-grid2>section:first-child{padding-right:clamp(18px,3cqw,40px)}
        .db-grid2>section+section{padding-left:clamp(18px,3cqw,40px);border-left:1px solid var(--line)}

        /* Pills */
        .db-ctrl{display:flex;gap:14px 22px;flex-wrap:wrap;align-items:center;margin-bottom:20px}
        .db-pills{display:flex;gap:8px;flex-wrap:wrap}
        .db-pill{border:1px solid var(--line);background:none;border-radius:20px;padding:6px 14px;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--sub);cursor:pointer;transition:border-color .16s,color .16s,background .16s}
        .db-pill:hover{color:var(--text)}
        .db-pill[aria-pressed=true]{border-color:var(--blue);color:var(--text);background:color-mix(in srgb,var(--blue) 14%,transparent)}

        /* Hero */
        .db-hero{display:flex;gap:clamp(18px,3cqw,44px);align-items:flex-end;flex-wrap:wrap;margin-bottom:8px;min-height:80px}
        .db-big{font:600 clamp(32px,3.5cqw,50px)/1 var(--font-display);letter-spacing:-.05em;font-variant-numeric:tabular-nums}
        .db-cap{font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--quiet);margin-top:8px}
        .db-cap .up{color:var(--blue-2);font-weight:600}

        /* Chart */
        .db-chart{position:relative;width:100%;margin-top:4px;cursor:pointer}
        .db-ax{fill:var(--quiet);font:500 11.5px var(--font-body);letter-spacing:.05em}
        .db-grid-l{stroke:var(--line);stroke-width:1}
        .db-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:db-draw 1.05s cubic-bezier(.2,.8,.2,1) forwards}
        @keyframes db-draw{to{stroke-dashoffset:0}}
        .db-tip{position:absolute;pointer-events:none;z-index:5;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:10px 14px;font-size:13.5px;line-height:1.7;box-shadow:0 18px 50px rgba(0,0,0,.3);opacity:0;transform:translateY(4px);transition:opacity .12s,transform .12s;white-space:nowrap}
        .db-tip.on{opacity:1;transform:none}
        .db-tip b{font-weight:600}
        .db-tip-k{display:inline-block;width:14px;height:0;border-top:2.5px solid var(--blue);margin-right:7px;vertical-align:middle}
        .db-tip-kp{border-top:2px dotted var(--prev)}
        .db-legend{display:flex;gap:8px 20px;flex-wrap:wrap;font-size:13px;color:var(--sub);margin-top:14px}
        .db-ln{display:inline-block;width:16px;height:0;border-top:2.5px solid var(--blue);margin-right:7px;vertical-align:middle}
        .db-ln-p{border-top:2px dotted var(--prev)}
        .db-ln-sq{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:7px;vertical-align:baseline}

        /* Donut */
        .db-state{display:grid;grid-template-columns:minmax(130px,.95fr) minmax(0,1.05fr);gap:clamp(14px,2cqw,28px);align-items:center}
        .db-donut{display:block;width:100%;max-width:230px;margin:0 auto}
        .db-seg{cursor:pointer;transition:stroke-width .2s,opacity .2s}
        .db-seg:hover{stroke-width:31}
        .db-seg:focus-visible{outline:none;stroke-width:31}
        .db-srow{all:unset;box-sizing:border-box;display:grid;grid-template-columns:10px 1fr auto auto;gap:10px;align-items:center;width:100%;padding:13px 6px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14.5px;transition:background .16s}
        .db-srow:last-child{border-bottom:0}
        .db-srow:hover{background:var(--hover)}
        .db-srow:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
        .db-srow i{width:9px;height:9px;border-radius:2px}
        .db-srow .c{font-weight:600;font-variant-numeric:tabular-nums}
        .db-srow .p{color:var(--quiet);font-size:13px;width:50px;text-align:right;font-variant-numeric:tabular-nums}
        .db-dim{opacity:.35}

        /* Categories */
        .db-ctable{display:grid;gap:0}
        .db-crow,.db-chead{display:grid;grid-template-columns:minmax(130px,1.3fr) repeat(5,minmax(60px,.7fr));gap:8px;align-items:end}
        .db-chead{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--quiet);padding-bottom:10px}
        .db-chead span:not(:first-child),.db-crow .db-num{text-align:center}
        .db-cbtn{all:unset;box-sizing:border-box;display:block;width:100%;cursor:pointer;padding:14px 0 15px;border-top:1px solid var(--line);transition:background .16s}
        .db-cbtn:hover{background:var(--hover)}
        .db-cbtn:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
        .db-crow .db-nm{font-size:14.5px;font-weight:500}
        .db-crow .db-nm small{display:block;font-size:12.5px;color:var(--quiet);font-weight:400;margin-top:2px}
        .db-crow .db-num{font-size:14.5px;font-variant-numeric:tabular-nums;color:var(--sub);align-self:center}
        .db-crow .db-num.t{font-weight:700;color:var(--text)}
        .db-stack{display:flex;gap:2px;height:9px;margin-top:10px;background:var(--soft);border-radius:2px;overflow:hidden}
        .db-stack span{display:block;height:100%;width:0;transition:width .85s cubic-bezier(.2,.8,.2,1)}

        /* Broker bars */
        .db-bars{display:grid;gap:3px}
        .db-bar{all:unset;box-sizing:border-box;display:grid;grid-template-columns:minmax(86px,140px) 1fr 42px;gap:13px;align-items:center;width:100%;padding:10px 4px;cursor:pointer;font-size:14.5px;border-radius:3px;transition:background .16s}
        .db-bar:hover{background:var(--hover)}
        .db-bar:focus-visible{outline:2px solid var(--blue);outline-offset:-2px}
        .db-bar .n{color:var(--sub);transition:color .16s;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .db-bar:hover .n{color:var(--blue-2)}
        .db-bar-t{display:block;height:9px;background:var(--soft);border-radius:2px;overflow:hidden}
        .db-bar-f{display:block;height:100%;width:0;background:var(--blue);border-radius:2px;transition:width .85s cubic-bezier(.2,.8,.2,1)}
        .db-bar-f.d{opacity:.5}
        .db-bar.agg .n{color:var(--quiet)}
        .db-bar.agg .db-bar-t{background:repeating-linear-gradient(90deg,var(--line) 0 4px,transparent 4px 8px);height:2px;opacity:.9}
        .db-bar .db-bv{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}

        /* Tables */
        .db-tbl{width:100%;border-collapse:collapse;font-size:14px}
        .db-tbl th{text-align:left;font-size:11.5px;font-weight:600;letter-spacing:.07em;color:var(--quiet);padding:0 8px 12px 0;text-transform:uppercase}
        .db-tbl td{padding:13px 8px 13px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums;vertical-align:top}
        .db-tbl th:not(:first-child),.db-tbl td:not(:first-child){text-align:center}
        .db-tbl th:last-child,.db-tbl td:last-child{padding-right:0}
        .db-tbl tbody tr{cursor:pointer;transition:background .14s}
        .db-tbl tbody tr:hover td{color:var(--blue-2)}
        .db-tbl-static tbody tr{cursor:default}
        .db-tbl-static tbody tr:hover td{color:inherit}
        .db-muted{color:var(--quiet);font-size:12.5px;margin-top:2px}
        .db-tag{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600}
        .db-tag::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c,var(--blue))}
        .db-empty{padding:24px 0;color:var(--quiet);font-size:13.5px;border-top:1px solid var(--line)}


        /* Toast */
        .db-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);z-index:60;background:var(--text);color:var(--bg);padding:12px 18px;border-radius:6px;font-size:13.5px;font-weight:500;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:calc(100% - 32px);white-space:nowrap}
        .db-toast.on{opacity:1;transform:translate(-50%,0)}

        /* Alert */
        .db-blink{animation:db-blink 2s ease-in-out infinite}
        @keyframes db-blink{0%,100%{opacity:1}50%{opacity:.22}}
        @media(prefers-reduced-motion:reduce){.db-blink,.db-draw{animation:none!important}.db-draw{stroke-dashoffset:0}.db-stack span,.db-bar-f{transition:none!important}}

        /* Form inputs */
        .db-input{min-width:0;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:13px 15px;font-size:14.5px;color:var(--text);outline:none;font-family:inherit;transition:border-color .16s}
        .db-input::placeholder{color:var(--quiet)}
        .db-input:focus{border-color:var(--blue)}
        .db-go{border:1px solid var(--line);background:var(--soft);border-radius:5px;padding:13px 22px;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--text);transition:border-color .16s,background .16s;white-space:nowrap}
        .db-go:hover{border-color:var(--blue);background:var(--hover)}
        .db-go:disabled{opacity:.5;cursor:default}
      `}</style>

      {/* Alert vencidas */}
      {vencidasUrgentes.length > 0 && (
        <AlertBanner count={vencidasUrgentes.length} nombre={vencidasUrgentes[0]?.carpeta.nombre} />
      )}

      {/* Intro */}
      <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 'clamp(22px,3cqw,38px)' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(26px,3.2cqw,44px)', fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1.1, margin: '0 0 7px', fontFamily: 'var(--font-display)' }}>
            {saludo}, {displayName(user)}
          </h1>
          <p style={{ margin: 0, color: 'var(--sub)', fontSize: 14 }}>{fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={scope} onChange={e => setScope(e.target.value)}
            aria-label="Filtrar dashboard por estado de la cartera"
            style={{
              appearance: 'none', WebkitAppearance: 'none',
              background: `var(--soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23909db4' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M2 4h12M4 8h8M6.5 12h3'/%3E%3C/svg%3E") no-repeat right 12px center`,
              border: '1px solid var(--line)', borderRadius: 5,
              padding: '11px 38px 11px 14px', fontSize: 13.5, color: 'var(--text)',
              cursor: 'pointer', minWidth: 186, fontFamily: 'inherit',
            }}
          >
            <option value="all">Toda la cartera</option>
            <option value="EN ESTUDIO">En estudio</option>
            <option value="OFERTADA">Ofertadas</option>
            <option value="CONTRATADA">Contratadas</option>
            <option value="RECHAZADA">Rechazadas</option>
          </select>
          <button
            onClick={() => showToast('El informe descargable se diseña en la fase de informes.')}
            style={{ border: 'none', background: 'var(--blue)', color: '#fff', borderRadius: 5, padding: '12px 20px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'transform .16s,filter .16s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.1)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = ''; (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
          >
            Descargar informe
          </button>
        </div>
      </section>

      {/* KPIs */}
      <section className="db-kpis" aria-label="Indicadores principales">
        {([
          {
            id: 'flotas',
            l: scope === 'all' ? 'Flotas en cartera' : `Flotas · ${sName}`,
            v: nf(totalPortfolio),
            n: scope === 'all' ? 'Total de expedientes' : `<b>${nf(totalCartera)}</b> en cartera total`,
          },
          {
            id: 'vehiculos',
            l: 'Vehículos',
            v: nf(totalVehiculos),
            n: totalVehiculos > 0 ? 'Flotas con detalle cargado' : 'Sin vehículos asociados',
          },
          {
            id: 'tasa',
            l: 'Tasa de contratación',
            v: totalCartera > 0 ? pc(tasaContratacion, 0) : '—',
            n: `<b>${nf(contratadas)}</b> contratadas de ${nf(totalCartera)} flotas`,
          },
          {
            id: 'corredores',
            l: 'Corredores activos',
            v: String(corredoresActivos),
            n: scope === 'all' ? 'Con flotas asociadas' : 'En este ámbito',
          },
          {
            id: 'renovaciones',
            l: 'Renovaciones · 60 días',
            v: String(renovacionesProximas.length),
            n: renovacionesUrgentes.length > 0 ? `<b>${renovacionesUrgentes.length}</b> vencen en ≤ 15 días` : 'Solo flotas contratadas',
            urgent: renovacionesUrgentes.length > 0,
          },
        ] as Array<{ id: string; l: string; v: string; n: string; urgent?: boolean }>).map(kpi => (
          <button key={kpi.id} className="db-kpi" onClick={() => handleDetail(kpi.id)} tabIndex={0}>
            <div className="l">{kpi.l}</div>
            <div className="v" style={{ color: kpi.urgent ? 'var(--danger)' : undefined }}>{kpi.v}</div>
            <div className="n" dangerouslySetInnerHTML={{ __html: kpi.n }} />
          </button>
        ))}
      </section>

      {/* Grid 1: Evolución | Cartera donut */}
      <div className="db-grid2">
        <section>
          <div className="db-ctrl">
            <div className="db-pills" role="group" aria-label="Magnitud">
              {(['flotas', 'vehiculos', 'primas'] as MetricKey[]).map(m => (
                <button key={m} className="db-pill" aria-pressed={metric === m}
                  onClick={() => setMetric(m)}>
                  {CHART_DATA[m].name}
                </button>
              ))}
            </div>
            <div className="db-pills" role="group" aria-label="Periodo">
              {[6, 12].map(p => (
                <button key={p} className="db-pill" aria-pressed={period === p}
                  onClick={() => setPeriod(p)}>
                  {p}M
                </button>
              ))}
            </div>
          </div>
          <EvolutionChart metric={metric} period={period} onDetailClick={() => handleDetail('evolucion')} />
        </section>

        <section>
          <div className="db-shead">
            <h2 className="db-h2">Situación de la cartera</h2>
            <p className="db-sub">Estado actual de las flotas</p>
          </div>
          <div className="db-state">
            <div className="db-donut">
              <CarteraDonut
                counts={flotasEstadoCounts}
                total={totalCartera}
                onSegClick={key => handleDetail(`estado:${key.toLowerCase().replace(' ', '_')}`)}
                onTotalClick={() => handleDetail('estados')}
              />
            </div>
            <div>
              {SEGS.map(s => {
                const count = flotasEstadoCounts[s.key] ?? 0;
                const pct   = totalCartera > 0 ? count / totalCartera * 100 : 0;
                const inSc  = scope === 'all' || scope === s.key;
                return (
                  <button
                    key={s.key}
                    className={`db-srow${!inSc ? ' db-dim' : ''}`}
                    onClick={() => handleDetail(`estado:${s.key.toLowerCase().replace(' ', '_')}`)}
                    tabIndex={0}
                  >
                    <i style={{ background: s.color }} />
                    <span>{s.label}</span>
                    <span className="c">{count}</span>
                    <span className="p">{pc(pct)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="db-note">Contratadas sin vehículos: históricas anteriores a la carga de detalle.</p>
        </section>
      </div>

      {/* Grid 2: Categorías | Corredores */}
      <div className="db-grid2">
        <section>
          <div className="db-shead">
            <h2
              className="db-h2 db-h2-link"
              onClick={() => handleDetail('categorias')}
              title="Ver detalle de todas las categorías"
            >
              Vehículos por categoría
            </h2>
            <p className="db-sub">{sName} · {nf(sum(vehiculosCatStats.map(c => c.total)))} vehículos</p>
          </div>
          <div className="db-legend" style={{ margin: '0 0 16px' }}>
            <span><i className="db-ln-sq" style={{ background: 'var(--st-estudio)' }} /> En estudio</span>
            <span><i className="db-ln-sq" style={{ background: 'var(--st-ofertada)' }} /> Ofertados</span>
            <span><i className="db-ln-sq" style={{ background: 'var(--st-contratada)' }} /> Contratados</span>
            <span><i className="db-ln-sq" style={{ background: 'var(--st-rechazada)' }} /> Rechazados</span>
          </div>
          {vehiculosCatStats.length === 0 ? (
            <div className="db-empty">Sin vehículos en este ámbito.</div>
          ) : (
            <div className="db-ctable">
              <div className="db-chead">
                <span>Categoría</span>
                <span>En estudio</span>
                <span>Ofertados</span>
                <span>Contratados</span>
                <span>Rechazados</span>
                <span>Total</span>
              </div>
              {vehiculosCatStats.map((cat, i) => {
                const stackSegs = catCols.map(col => ({
                  color: `var(${col.var})`,
                  pct:   catMax > 0 ? ((cat as unknown as Record<string, number>)[col.id] / catMax) * 100 : 0,
                }));
                return (
                  <button key={cat.categoria} className="db-cbtn" onClick={() => handleDetail(`cat:${i}`)}>
                    <div className="db-crow">
                      <div className="db-nm">{cat.categoria}<small>{cat.subtitulo}</small></div>
                      <span className="db-num">{nf(cat.estudio)}</span>
                      <span className="db-num">{nf(cat.ofertada)}</span>
                      <span className="db-num">{nf(cat.contratada)}</span>
                      <span className="db-num">{nf((cat as unknown as Record<string, number>)['rechazada'] ?? 0)}</span>
                      <span className="db-num t">{nf(cat.total)}</span>
                    </div>
                    <StackedBar segments={stackSegs} />
                  </button>
                );
              })}
            </div>
          )}
          {vehiculosCatStats.length > 0 && (
            <p className="db-note">
              {sum(vehiculosCatStats.map(c => c.contratada)) > 0
                ? `Contratados: ${nf(sum(vehiculosCatStats.map(c => c.contratada)))} de ${nf(sum(vehiculosCatStats.map(c => c.total)))} vehículos.`
                : 'Ningún vehículo figura como contratado: flotas contratadas sin detalle cargado.'}
            </p>
          )}
        </section>

        <section>
          <div className="db-shead">
            <h2
              className="db-h2 db-h2-link"
              onClick={() => handleDetail('corredores')}
              title="Ver detalle de todos los corredores"
            >
              Flotas por corredor
            </h2>
            <p className="db-sub">{sName} · {corredoresStats.length} corredores</p>
          </div>
          {corredoresStats.length === 0 ? (
            <div className="db-empty">Sin corredores en este ámbito.</div>
          ) : (
            <>
              <div className="db-bars">
                {brokerRows.map((b, i) => {
                  const isAgg = (b as { isAgg?: boolean }).isAgg;
                  const detKey = isAgg ? 'corredores_otros' : `broker:${i}`;
                  return (
                    <button
                      key={b.nombre}
                      className={`db-bar${isAgg ? ' agg' : ''}`}
                      onClick={() => handleDetail(detKey)}
                    >
                      <span className="n">{b.nombre}</span>
                      {isAgg
                        ? <span className="db-bar-t" style={{ background: 'repeating-linear-gradient(90deg,var(--line) 0 4px,transparent 4px 8px)', height: 2, opacity: 0.9 }} />
                        : <AnimBar pct={(b.total / maxBrok) * 100} dim={i > 0} />
                      }
                      <span className="db-bv">{nf(b.total)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="db-note">Una flota se asigna a un único corredor.</p>
            </>
          )}
        </section>
      </div>

      {/* Grid 3: Renovaciones | Actividad */}
      <div className="db-grid2 r40" style={{ borderBottom: 0 }}>
        <section>
          <div className="db-shead">
            <h2 className="db-h2">Renovaciones próximas</h2>
            <p className="db-sub">Vencimientos en los siguientes 60 días</p>
          </div>
          {renovacionesProximas.length === 0 ? (
            <div className="db-empty">
              {scope !== 'all' && scope !== 'CONTRATADA'
                ? `Las renovaciones son de flotas contratadas, no de «${sName}».`
                : 'Sin flotas contratadas con vencimiento en los próximos 60 días.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="db-tbl">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Flota</th>
                    <th>Vehículos</th>
                    <th style={{ textAlign: 'right' }}>Vence en</th>
                  </tr>
                </thead>
                <tbody>
                  {renovacionesProximas.map((r, idx) => {
                    const veh = (r.carpeta.trabajo?.length ?? 0) > 0 ? r.carpeta.trabajo.length : (r.carpeta.original?.length ?? 0);
                    return (
                      <tr key={r.carpeta.id} tabIndex={0} onClick={() => handleDetail(`ren:${idx}`)}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleDetail(`ren:${idx}`)}>
                        <td style={{ paddingLeft: 0, paddingRight: 8 }}>
                          <span style={{ display: 'block', fontWeight: 500 }}>{r.carpeta.nombre}</span>
                          <div className="db-muted">{r.corredor?.nombre ?? 'Sin corredor'}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{nf(veh)}</td>
                        <td style={{ textAlign: 'right', paddingRight: 0 }}>
                          <span className="db-tag" style={{ ['--c' as string]: r.dias <= 15 ? 'var(--warn)' : 'var(--blue)' }}>
                            {r.dias} días
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="db-shead">
            <h2 className="db-h2">Actividad reciente</h2>
            <p className="db-sub">Últimas operaciones en ORION</p>
          </div>
          {actividadReciente.length === 0 ? (
            <div className="db-empty">Sin actividad registrada.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="db-tbl">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Operación</th>
                    <th style={{ textAlign: 'left' }}>Módulo</th>
                    <th style={{ textAlign: 'left' }}>Usuario</th>
                    <th style={{ textAlign: 'right' }}>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {actividadReciente.map((a, idx) => (
                    <tr key={idx} tabIndex={0} onClick={() => handleDetail(`act:${idx}`)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleDetail(`act:${idx}`)}>
                      <td style={{ paddingLeft: 0, paddingRight: 8 }}>
                        <span style={{ display: 'block', fontWeight: 500 }}>{a.accion}</span>
                        <div className="db-muted">{a.carpeta.nombre}</div>
                      </td>
                      <td style={{ textAlign: 'left', paddingRight: 8 }}>
                        <span style={{ fontSize: 13 }}>{a.modulo}</span>
                      </td>
                      <td style={{ textAlign: 'left', paddingRight: 8, color: 'var(--sub)' }}>
                        <span style={{ fontSize: 13 }}>{a.usuario}</span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 0, color: 'var(--quiet)', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {tiempoRelativo(a.fecha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Sugerencias */}
      <SugerenciasSection user={user} />

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', color: 'var(--quiet)', fontSize: 12.5, paddingTop: 24, marginTop: 8, borderTop: '1px solid var(--line)' }}>
        <span>ORION · Dashboard</span>
        <span>Datos en tiempo real</span>
      </div>

      {/* Drawer */}
      <DetailDrawer data={drawer} isOpen={drawerOpen} onClose={closeDrawer} />

      {/* Toast */}
      <Toast message={toast} visible={toastVis} />
    </div>
  );
}
