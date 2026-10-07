"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cargarCarpetasDelServidor, cargarCorredoresDelServidor, type FlotaCarpeta, type Corredor } from '@/core/flotas';
import type { CatStats } from './components/VehiculosCategorias';
import VehiculosCategorias from './components/VehiculosCategorias';
import { useAuth } from '@/context/AuthContext';

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

// ─── KpiCard ─────────────────────────────────────────────────────────────────
// variant='bare'    → flotando sobre fondo, sin contenedor (dashboard superior)
// variant='surface' → con contenedor elevado (para reuso en otros módulos)

function KpiCard({ title, value, color, sub, variant = 'bare', textAlign = 'left' }: {
  title: string;
  value: string;
  color?: string;
  sub?: string;
  variant?: 'bare' | 'surface';
  textAlign?: 'left' | 'center' | 'right';
}) {
  const inner = (
    <>
      <b
        className="dash-kpi-num"
        style={{ display: 'block', fontWeight: 560, letterSpacing: '-0.045em', lineHeight: 0.95, color: color ?? '#F4F4F5' }}
      >
        {value}
      </b>
      <small style={{ display: 'block', marginTop: 12, color: '#8d9198', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {title}
      </small>
      {sub && <em style={{ display: 'block', marginTop: 4, color: '#6d727a', fontStyle: 'normal', fontSize: 13 }}>{sub}</em>}
    </>
  );

  if (variant === 'surface') {
    return (
      <div style={{ background: '#0D0F12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '22px 24px', textAlign }}>
        {inner}
      </div>
    );
  }

  return <div style={{ textAlign }}>{inner}</div>;
}

// ─── RenovBadge ──────────────────────────────────────────────────────────────

function RenovBadge({ dias, fecha }: { dias: number; fecha: Date }) {
  const s: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 72, height: 26, padding: '0 10px', borderRadius: 999,
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
  };
  const isVencidaVieja = dias < 0 && fecha.getFullYear() < CURRENT_YEAR;
  if (isVencidaVieja) {
    return <span style={{ ...s, background: 'rgba(239,77,90,0.10)', border: '1px solid rgba(239,77,90,0.25)', color: '#EF4D5A' }}>
      Vencida {Math.abs(dias)}d
    </span>;
  }
  const label = dias < 0 ? `−${Math.abs(dias)} Días` : `${dias} Días`;
  return <span style={{ ...s, background: 'rgba(240,185,77,0.12)', border: '1px solid rgba(240,185,77,0.38)', color: '#F0B94D' }}>
    {label}
  </span>;
}

// ─── DistribucionBarra ────────────────────────────────────────────────────────

const ESTADOS_BAR = [
  { key: 'CONTRATADA', label: 'Contratadas', color: '#20C982' },
  { key: 'EN ESTUDIO',  label: 'En estudio',  color: '#4387FF' },
  { key: 'OFERTADA',    label: 'Ofertadas',   color: '#7C5CFC' },
  { key: 'RECHAZADA',   label: 'Rechazadas',  color: '#EF4D5A' },
];

function DistribucionBarra({ counts, total }: { counts: Record<string, number>; total: number }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 620, color: '#F4F4F5', margin: 0 }}>Distribución cartera</h2>

      {total === 0 ? (
        <p style={{ color: '#6d727a', fontSize: 13, marginTop: 28 }}>Sin datos</p>
      ) : (
        <>
          {/* Total grande centrado */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <strong style={{
              display: 'block', fontSize: 84, fontWeight: 560,
              letterSpacing: '-0.05em', lineHeight: 0.9, color: '#F4F4F5',
            }}>
              {total}
            </strong>
            <span style={{
              display: 'block', marginTop: 10, color: '#8d9198',
              fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              FLOTAS EN CARTERA
            </span>
          </div>

          {/* Barra segmentada */}
          <div style={{
            margin: '28px 8px 22px', height: 8,
            display: 'flex', gap: 3, borderRadius: 999, overflow: 'hidden',
          }}>
            {ESTADOS_BAR.map(seg => {
              const val = counts[seg.key] ?? 0;
              if (val === 0) return null;
              return (
                <div key={seg.key} style={{ flex: val, background: seg.color, minWidth: 4 }} title={`${seg.label}: ${val}`} />
              );
            })}
          </div>

          {/* Leyenda */}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ESTADOS_BAR.map(seg => {
              const val = counts[seg.key] ?? 0;
              const pct = total > 0 ? Math.round((val / total) * 100) : 0;
              return (
                <li key={seg.key} style={{
                  display: 'grid', gridTemplateColumns: '14px 1fr auto auto',
                  alignItems: 'center', gap: 10,
                  color: '#d5d8de', fontSize: 14,
                }}>
                  <i style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'block' }} />
                  {seg.label}
                  <b style={{ fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{val}</b>
                  <span style={{ color: '#8d9198', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── SugerenciasSection ───────────────────────────────────────────────────────

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

  const canSend = titulo.trim() && desc.trim();

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: '#0D0F12', border: '1px solid rgba(255,255,255,0.08)',
    color: '#F4F4F5', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s',
  };

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 620, color: '#F4F4F5', margin: 0 }}>Sugerencias de mejora</h2>
        <span style={{ display: 'block', marginTop: 4, fontSize: 13, color: '#8d9198' }}>Cualquier idea útil — se revisa en el panel de administración</span>
      </div>

      {status === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, background: 'rgba(32,201,130,0.08)', border: '1px solid rgba(32,201,130,0.20)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#20C982" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 13, color: '#20C982', fontWeight: 500 }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#70747B', marginBottom: 5 }}>Título</label>
              <input type="text" value={titulo} maxLength={100} onChange={e => setTitulo(e.target.value)} placeholder="Resumen breve" style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(67,135,255,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
            </div>
            <button onClick={send} disabled={status === 'sending' || !canSend}
              style={{
                padding: '9px 18px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.07em', cursor: canSend ? 'pointer' : 'default',
                background: canSend ? 'rgba(67,135,255,0.10)' : 'transparent',
                border: `1px solid ${canSend ? 'rgba(67,135,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                color: canSend ? '#4387FF' : '#70747B', transition: 'all 0.15s', alignSelf: 'flex-start',
              }}
              onMouseEnter={e => { if (canSend) e.currentTarget.style.background = 'rgba(67,135,255,0.18)'; }}
              onMouseLeave={e => { if (canSend) e.currentTarget.style.background = 'rgba(67,135,255,0.10)'; }}>
              {status === 'sending' ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#70747B', marginBottom: 5 }}>Descripción</label>
            <textarea value={desc} maxLength={1000} rows={4} onChange={e => setDesc(e.target.value)} placeholder="Explica la mejora con detalle"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 88 }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(67,135,255,0.5)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
          </div>
        </div>
      )}
    </div>
  );
}

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

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);

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

  const totalPortfolio = Object.values(flotasEstadoCounts).reduce((s, v) => s + v, 0);
  const contratadas = flotasEstadoCounts['CONTRATADA'] ?? 0;
  const tasaContratacion = totalPortfolio > 0 ? Math.round((contratadas / totalPortfolio) * 100) : null;

  const renovaciones = useMemo(() => {
    return carpetas
      .filter(c => c.estado === 'CONTRATADA' && c.header?.fechaVencimiento)
      .flatMap(c => {
        const fecha = parseFechaFlexible(c.header!.fechaVencimiento!);
        if (!fecha) return [];
        const dias = diasHasta(fecha);
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
      const rows = carpeta.trabajo?.length > 0 ? carpeta.trabajo : carpeta.original;
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
        const tipMap = acc[cat];
        const tipologias = Object.entries(tipMap)
          .map(([tip, estadoMap]) => ({
            tipologia: tip,
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

  const hora = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="animate-in fade-in duration-500">
      <style>{`
        .dash-kpi-num   { font-size: 64px; }
        .dash-main-grid { display: grid; grid-template-columns: 300px 1fr; gap: 56px; }
        @keyframes orion-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .dash-alert-dot { animation: orion-blink 2s ease-in-out infinite; }
        @media (max-width: 960px) {
          .dash-main-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
        }
        @media (max-width: 700px) {
          .dash-kpi-num  { font-size: 48px; }
        }
      `}</style>

      {/* ── Greeting ── */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-0.03em', color: '#F4F4F5', margin: 0 }}>
          {saludo}, {displayName(user)}
        </h1>
        <p style={{ margin: '6px 0 0', color: '#8d9198', fontSize: 14 }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── Alert banner ── */}
      {vencidasUrgentes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, background: 'rgba(239,77,90,0.08)', border: '1px solid rgba(239,77,90,0.20)', fontSize: 12, color: '#EF4D5A', fontWeight: 500, marginTop: 20 }}>
          <div className="dash-alert-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4D5A', flexShrink: 0 }} />
          {vencidasUrgentes.length === 1
            ? `${vencidasUrgentes[0].carpeta.nombre} — póliza vencida, pendiente de renovación`
            : `${vencidasUrgentes.length} pólizas vencidas pendientes de renovación`}
        </div>
      )}

      {/* ── 3 KPIs ── */}
      <div style={{
        marginTop: 36,
        display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr',
        alignItems: 'start',
        paddingBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <KpiCard
          title="Renovaciones urgentes"
          value={String(vencidasUrgentes.length)}
          color={vencidasUrgentes.length > 0 ? '#EF4D5A' : '#F4F4F5'}
          sub={vencidasUrgentes.length > 0
            ? `${vencidasUrgentes.length === 1 ? 'Póliza vencida' : 'Pólizas vencidas'} de año anterior`
            : undefined}
        />
        <KpiCard
          title="Tasa de éxito"
          value={tasaContratacion !== null ? `${tasaContratacion}%` : '—'}
          color="#F4F4F5"
          sub={`${contratadas} contratadas / ${totalPortfolio} portfolio`}
          textAlign="center"
        />
        <KpiCard
          title="Corredores activos"
          value={String(corredores.length)}
          textAlign="right"
        />
      </div>

      {/* ── 2 columnas: distribución | renovaciones ── */}
      <div className="dash-main-grid" style={{ marginTop: 28, marginBottom: 40 }}>

        {/* Izquierda — Distribución cartera */}
        <div>
          <DistribucionBarra counts={flotasEstadoCounts} total={totalPortfolio} />
        </div>

        {/* Derecha — Renovaciones próximas */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 620, color: '#F4F4F5', margin: 0 }}>Renovaciones próximas</h2>

          {/* Cabecera de lista */}
          <div style={{
            marginTop: 22,
            display: 'grid', gridTemplateColumns: '1fr 168px',
            alignItems: 'center', gap: 16,
            color: '#6d727a', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            <span>Flota</span>
            <span style={{ textAlign: 'right' }}>Vencimiento</span>
          </div>

          {renovaciones.length === 0 ? (
            <p style={{ color: '#6d727a', fontSize: 13, margin: '40px 0 0' }}>
              Sin flotas contratadas con vencimiento próximo.
            </p>
          ) : (
            renovaciones.map(({ carpeta, corredor, fecha, dias }) => (
              <article key={carpeta.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 168px',
                alignItems: 'center', gap: 16,
                minHeight: 62, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 0',
              }}>
                <div>
                  <Link href={`/flotas?id=${carpeta.id}`} style={{ textDecoration: 'none' }}
                    onMouseEnter={e => { const s = e.currentTarget.querySelector('strong') as HTMLElement | null; if (s) s.style.color = '#4387FF'; }}
                    onMouseLeave={e => { const s = e.currentTarget.querySelector('strong') as HTMLElement | null; if (s) s.style.color = '#F4F4F5'; }}>
                    <strong style={{ display: 'block', fontSize: 14, fontWeight: 650, letterSpacing: '0.01em', color: '#F4F4F5', transition: 'color 120ms' }}>
                      {carpeta.nombre}
                    </strong>
                  </Link>
                  <span style={{ display: 'block', marginTop: 2, color: '#8d9198', fontSize: 12 }}>
                    {corredor?.nombre ?? 'Sin corredor'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 18, color: '#e7e8ea', fontSize: 14 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </span>
                  <RenovBadge dias={dias} fecha={fecha} />
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* ── Vehículos por categoría ── */}
      <VehiculosCategorias stats={vehiculosCatStats} />

      {/* ── Sugerencias ── */}
      <div style={{ marginTop: 32 }}>
        <SugerenciasSection user={user} />
      </div>
    </div>
  );
}
