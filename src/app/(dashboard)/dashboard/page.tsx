"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cargarCarpetasDelServidor, cargarCorredoresDelServidor, type FlotaCarpeta, type Corredor } from '@/core/flotas';
import type { CatStats } from './components/VehiculosCategorias';
import VehiculosCategorias from './components/VehiculosCategorias';
import { useAuth } from '@/context/AuthContext';

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

const CURRENT_YEAR = new Date().getFullYear();

// ─── Sub-components ───────────────────────────────────────────────────────────

function RenovPill({ dias, fecha }: { dias: number; fecha: Date }) {
  const base: React.CSSProperties = {
    minWidth: 72, height: 26, padding: '0 10px', borderRadius: 999, border: '1px solid',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, whiteSpace: 'nowrap',
  };
  if (dias < 0 && fecha.getFullYear() < CURRENT_YEAR) {
    return <span style={{ ...base, borderColor: 'rgba(239,77,90,0.4)', background: 'rgba(239,77,90,0.10)', color: 'var(--t-red)' }}>Vencida {Math.abs(dias)}d</span>;
  }
  if (dias < 0) {
    return <span style={{ ...base, borderColor: 'var(--t-amber-border)', background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>−{Math.abs(dias)}d</span>;
  }
  if (dias <= 30) {
    return <span style={{ ...base, borderColor: 'rgba(239,77,90,0.4)', background: 'rgba(239,77,90,0.10)', color: 'var(--t-red)' }}>{dias} Días</span>;
  }
  return <span style={{ ...base, borderColor: 'var(--t-amber-border)', background: 'var(--t-amber-bg)', color: 'var(--t-amber)' }}>{dias} Días</span>;
}

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

  const iS: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--t-surface)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ paddingTop: 28, borderTop: '1px solid var(--t-line)' }}>
      <h2 style={{ fontSize: 16, fontWeight: 620, color: 'var(--t-text)', margin: '0 0 20px' }}>Sugerencias de mejora</h2>
      <p style={{ fontSize: 12, color: 'var(--t-text-2)', marginBottom: 16 }}>
        Cualquier idea que te parezca útil — se revisa en el panel de administración.
      </p>
      {status === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 8, background: 'rgba(32,201,130,0.08)', border: '1px solid rgba(32,201,130,0.25)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t-green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 13, color: 'var(--t-green)' }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-text-3)', marginBottom: 5 }}>Título</label>
              <input type="text" value={titulo} maxLength={100} onChange={e => setTitulo(e.target.value)} placeholder="Resumen breve" style={iS} />
            </div>
            <button
              onClick={send}
              disabled={status === 'sending' || !titulo.trim() || !desc.trim()}
              style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                background: titulo.trim() && desc.trim() ? 'var(--t-blue)' : 'transparent',
                border: '1px solid var(--t-line)',
                color: titulo.trim() && desc.trim() ? '#fff' : 'var(--t-text-3)',
                transition: 'all 0.15s', alignSelf: 'flex-start',
                opacity: status === 'sending' ? 0.6 : 1,
              }}
            >
              {status === 'sending' ? 'Enviando…' : 'Enviar sugerencia'}
            </button>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-text-3)', marginBottom: 5 }}>Descripción</label>
            <textarea value={desc} maxLength={1000} rows={4} onChange={e => setDesc(e.target.value)} placeholder="Explica la mejora con detalle"
              style={{ ...iS, resize: 'vertical', minHeight: 90 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category classification ───────────────────────────────────────────────────

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

// ─── Cartera segments ─────────────────────────────────────────────────────────

const SEGS = [
  { key: 'CONTRATADA', label: 'Contratadas', color: '#20c982' },
  { key: 'EN ESTUDIO',  label: 'En estudio',  color: '#4387ff' },
  { key: 'OFERTADA',    label: 'Ofertadas',   color: '#7c5cfc' },
  { key: 'RECHAZADA',   label: 'Rechazadas',  color: '#ef4d5a' },
];

// ─── Cartera donut ────────────────────────────────────────────────────────────

function CarteraDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const r   = 88;
  const C   = 2 * Math.PI * r;
  const GAP = 1.5;

  let cumulative = 0;
  const segments = SEGS
    .map(s => {
      const count       = counts[s.key] ?? 0;
      const arc         = total > 0 ? (count / total) * C : 0;
      const startOffset = cumulative;
      cumulative += arc;
      return { ...s, count, arc, startOffset };
    })
    .filter(s => s.count > 0);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg viewBox="0 0 220 220" width={200} height={200} aria-hidden="true">
        {total === 0 ? (
          <circle cx={110} cy={110} r={r} fill="none" stroke="rgba(128,128,128,0.12)" strokeWidth={16} />
        ) : (
          <g transform="rotate(-90 110 110)">
            {segments.map(s => {
              const fill = Math.max(0, s.arc - GAP);
              return (
                <circle
                  key={s.key}
                  cx={110} cy={110} r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={16}
                  strokeDasharray={`${fill} ${C - fill}`}
                  strokeDashoffset={C - s.startOffset}
                />
              );
            })}
          </g>
        )}
        <text x={110} y={107} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 36, fontWeight: 560, fill: 'var(--t-text)', letterSpacing: '-0.05em', fontFamily: 'inherit' }}>
          {total}
        </text>
        <text x={110} y={126} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 9, fill: 'var(--t-text-3)', letterSpacing: '0.12em', fontFamily: 'inherit' }}>
          FLOTAS
        </text>
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [carpetas, setCarpetas]     = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [carteraView, setCarteraView] = useState<'bar' | 'donut'>('bar');

  useEffect(() => {
    const ac = new AbortController();
    cargarCarpetasDelServidor(ac.signal).then(setCarpetas).catch(() => {});
    cargarCorredoresDelServidor(ac.signal).then(setCorredores).catch(() => {});
    return () => ac.abort();
  }, []);

  const corredorMap = useMemo(() => {
    const map = new Map<string, Corredor>();
    corredores.forEach(c => map.set(c.id, c));
    return map;
  }, [corredores]);

  const flotasEstadoCounts = useMemo(() => {
    const counts: Record<string, number> = { 'EN ESTUDIO': 0, 'OFERTADA': 0, 'CONTRATADA': 0, 'RECHAZADA': 0 };
    carpetas.forEach(c => { counts[c.estado] = (counts[c.estado] ?? 0) + 1; });
    return counts;
  }, [carpetas]);

  const totalPortfolio     = Object.values(flotasEstadoCounts).reduce((s, v) => s + v, 0);
  const contratadas        = flotasEstadoCounts['CONTRATADA'] ?? 0;
  const tasaContratacion   = totalPortfolio > 0 ? Math.round((contratadas / totalPortfolio) * 100) : null;

  const renovaciones = useMemo(() => {
    return carpetas
      .filter(c => c.estado === 'CONTRATADA' && c.header?.fechaVencimiento)
      .flatMap(c => {
        const fecha = parseFechaFlexible(c.header!.fechaVencimiento!);
        if (!fecha) return [];
        const dias     = diasHasta(fecha);
        const corredor = c.corredor_id ? (corredorMap.get(c.corredor_id) ?? null) : null;
        return [{ carpeta: c, corredor, fecha, dias }];
      })
      .sort((a, b) => a.dias - b.dias)
      .filter(r => r.dias <= 90);
  }, [carpetas, corredorMap]);

  const vencidasUrgentes = renovaciones.filter(
    r => r.dias < 0 && r.fecha.getFullYear() < CURRENT_YEAR,
  );

  const vehiculosCatStats = useMemo((): CatStats[] => {
    const acc: Record<string, Record<string, Record<string, number>>> = {
      '1ª Categoría': {}, '2ª Categoría': {}, '3ª Categoría': {}, 'Sin clasificar': {},
    };
    for (const carpeta of carpetas) {
      const rows  = carpeta.trabajo?.length > 0 ? carpeta.trabajo : carpeta.original;
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
        const tipMap    = acc[cat];
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
          estudio:    tipologias.reduce((s, t) => s + t.estudio, 0),
          ofertada:   tipologias.reduce((s, t) => s + t.ofertada, 0),
          contratada: tipologias.reduce((s, t) => s + t.contratada, 0),
          total:      tipologias.reduce((s, t) => s + t.total, 0),
        };
      })
      .filter(c => c.total > 0);
  }, [carpetas]);

  const hora   = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
  const fecha  = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="animate-in fade-in duration-500">
      <style>{`
        .dash-metrics   { display: grid; grid-template-columns: 1fr 1.15fr 1fr; align-items: start; }
        .dash-workspace { display: grid; grid-template-columns: 300px 1fr; gap: 56px; }
        .dash-alert     { animation: orion-blink 2s ease-in-out infinite; }
        .cartera-fade   { transition: opacity 0.25s ease; }
        @keyframes orion-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @media (prefers-reduced-motion: reduce) { .cartera-fade { transition: none !important; } }
        @media (max-width: 960px) {
          .dash-workspace { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .dash-metrics { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 420px) {
          .dash-metrics { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Alert banner — only when there are actually overdue policies */}
      {vencidasUrgentes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 28, borderRadius: 6, background: 'rgba(239,77,90,0.07)', border: '1px solid rgba(239,77,90,0.22)', fontSize: 12, color: 'var(--t-red)' }}>
          <div className="dash-alert" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--t-red)', flexShrink: 0 }} />
          {vencidasUrgentes.length === 1
            ? `${vencidasUrgentes[0].carpeta.nombre} — póliza vencida, pendiente de renovación`
            : `${vencidasUrgentes.length} pólizas vencidas pendientes de renovación`}
        </div>
      )}

      {/* Greeting */}
      <section style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 0.95, color: 'var(--t-text)', margin: 0 }}>
          {saludo}, {displayName(user)}
        </h1>
        <p style={{ marginTop: 6, color: 'var(--t-text-2)', fontSize: 14 }}>{fecha}</p>
      </section>

      {/* Metrics strip */}
      <section
        className="dash-metrics"
        aria-label="Resumen"
        style={{ paddingBottom: 28, borderBottom: '1px solid var(--t-line)', marginBottom: 28 }}
      >
        {/* Renovaciones urgentes */}
        <div>
          <b style={{ display: 'block', fontSize: 64, fontWeight: 560, letterSpacing: '-0.045em', lineHeight: 0.95, color: vencidasUrgentes.length > 0 ? 'var(--t-red)' : 'var(--t-text)' }}>
            {vencidasUrgentes.length}
          </b>
          <small style={{ display: 'block', marginTop: 12, color: 'var(--t-text-2)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Renovaciones urgentes
          </small>
        </div>

        {/* Tasa de éxito */}
        <div style={{ textAlign: 'center' }}>
          <b style={{ display: 'block', fontSize: 64, fontWeight: 560, letterSpacing: '-0.045em', lineHeight: 0.95, color: 'var(--t-text)' }}>
            {tasaContratacion !== null ? `${tasaContratacion}%` : '—'}
          </b>
          <small style={{ display: 'block', marginTop: 12, color: 'var(--t-text-2)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Tasa de éxito
          </small>
          <em style={{ display: 'block', marginTop: 4, color: 'var(--t-text-3)', fontStyle: 'normal', fontSize: 13 }}>
            {contratadas} contratadas / {totalPortfolio} portfolio
          </em>
        </div>

        {/* Corredores activos */}
        <div style={{ textAlign: 'right' }}>
          <b style={{ display: 'block', fontSize: 64, fontWeight: 560, letterSpacing: '-0.045em', lineHeight: 0.95, color: 'var(--t-text)' }}>
            {corredores.length}
          </b>
          <small style={{ display: 'block', marginTop: 12, color: 'var(--t-text-2)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Corredores activos
          </small>
        </div>
      </section>

      {/* Workspace */}
      <section className="dash-workspace">

        {/* Left — Distribución cartera */}
        <section aria-label="Distribución cartera">
          <button
            onClick={() => setCarteraView(v => v === 'bar' ? 'donut' : 'bar')}
            aria-label={carteraView === 'bar' ? 'Cambiar a vista circular' : 'Cambiar a vista de barra'}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 620, color: 'var(--t-text)', margin: 0, pointerEvents: 'none' }}>
              Distribución cartera
            </h2>
            {carteraView === 'bar' ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--t-text-3)', flexShrink: 0, opacity: 0.6 }}>
                <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8"/>
                <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--t-text-3)', flexShrink: 0, opacity: 0.6 }}>
                <rect x="1" y="6" width="3.5" height="7" rx="0.8"/>
                <rect x="6.3" y="3" width="3.5" height="10" rx="0.8"/>
                <rect x="11.5" y="8" width="3.5" height="5" rx="0.8"/>
              </svg>
            )}
          </button>

          {/* Views container — both rendered; inactive is absolute so only active controls height */}
          <div style={{ position: 'relative', marginTop: 28, minHeight: 300 }}>

            {/* Bar view */}
            <div className="cartera-fade" style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: carteraView === 'bar' ? 1 : 0, pointerEvents: carteraView === 'bar' ? 'auto' : 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ display: 'block', fontSize: 84, fontWeight: 560, letterSpacing: '-0.05em', lineHeight: 0.9, color: 'var(--t-text)' }}>
                  {totalPortfolio}
                </strong>
                <span style={{ display: 'block', marginTop: 10, color: 'var(--t-text-2)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Flotas en cartera
                </span>
              </div>

              {totalPortfolio > 0 && (
                <div aria-hidden="true" style={{ margin: '28px 8px 22px', height: 8, display: 'flex', gap: 3, borderRadius: 999, overflow: 'hidden' }}>
                  {SEGS.map(({ key, color }) => {
                    const count = flotasEstadoCounts[key] ?? 0;
                    if (count === 0) return null;
                    return <i key={key} style={{ display: 'block', height: '100%', flex: count, background: color }} />;
                  })}
                </div>
              )}

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {SEGS.map(({ key, label, color }) => {
                  const count = flotasEstadoCounts[key] ?? 0;
                  const pct   = totalPortfolio > 0 ? Math.round((count / totalPortfolio) * 100) : 0;
                  return (
                    <li key={key} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto auto', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--t-text)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {label}
                      <b style={{ fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{count}</b>
                      <span style={{ color: 'var(--t-text-2)', minWidth: 36, textAlign: 'right', fontSize: 13 }}>{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Donut view */}
            <div className="cartera-fade" style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity: carteraView === 'donut' ? 1 : 0, pointerEvents: carteraView === 'donut' ? 'auto' : 'none' }}>
              <CarteraDonut counts={flotasEstadoCounts} total={totalPortfolio} />

              <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {SEGS.map(({ key, label, color }) => {
                  const count = flotasEstadoCounts[key] ?? 0;
                  const pct   = totalPortfolio > 0 ? Math.round((count / totalPortfolio) * 100) : 0;
                  return (
                    <li key={key} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto auto', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--t-text)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                      {label}
                      <b style={{ fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{count}</b>
                      <span style={{ color: 'var(--t-text-2)', minWidth: 36, textAlign: 'right', fontSize: 13 }}>{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>

          </div>
        </section>

        {/* Right — Renovaciones próximas */}
        <section aria-label="Renovaciones próximas">
          <h2 style={{ fontSize: 16, fontWeight: 620, color: 'var(--t-text)', margin: 0 }}>Renovaciones próximas</h2>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 168px', gap: 16, marginTop: 22, color: 'var(--t-text-3)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span>Flota</span>
            <span style={{ textAlign: 'right' }}>Vencimiento</span>
          </div>

          {renovaciones.length === 0 ? (
            <p style={{ marginTop: 32, color: 'var(--t-text-3)', fontSize: 13 }}>
              Sin flotas contratadas con fecha de vencimiento próxima.
            </p>
          ) : (
            renovaciones.map(({ carpeta, corredor, fecha: fVcto, dias }) => (
              <article
                key={carpeta.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 168px', gap: 16, alignItems: 'center', minHeight: 62, borderTop: '1px solid var(--t-line-soft)', padding: '10px 0' }}
              >
                <div>
                  <Link
                    href={`/flotas?id=${carpeta.id}`}
                    style={{ display: 'block', fontSize: 14, fontWeight: 650, letterSpacing: '0.01em', color: 'var(--t-text)', textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-blue)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--t-text)')}
                  >
                    {carpeta.nombre}
                  </Link>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--t-text-2)', fontSize: 12 }}>
                    {corredor?.nombre ?? 'Sin corredor'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
                  <span style={{ color: 'var(--t-text)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                    {fVcto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <RenovPill dias={dias} fecha={fVcto} />
                </div>
              </article>
            ))
          )}
        </section>
      </section>

      {/* Vehículos por categoría */}
      <div style={{ marginTop: 40 }}>
        <VehiculosCategorias stats={vehiculosCatStats} />
      </div>

      {/* Sugerencias */}
      <div style={{ marginTop: 40 }}>
        <SugerenciasSection user={user} />
      </div>
    </div>
  );
}
