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

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(61,112,255,0.12) inset',
};

function KpiCard({ title, value, color, sub }: { title: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ ...glass, padding: '26px 28px', position: 'relative', overflow: 'hidden' }}>
      <div className="grain-subtle" />
      <span className="dash-kpi-num" style={{ display: 'block', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: color ?? '#FFFFFF', marginBottom: 10 }}>
        {value}
      </span>
      <em style={{ fontStyle: 'normal', display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.13em', color: 'rgba(80,130,255,0.80)', marginBottom: 4 }}>
        {title}
      </em>
      {sub && <span style={{ display: 'block', fontSize: 12, color: 'rgba(178,198,245,0.55)' }}>{sub}</span>}
    </div>
  );
}

function RenovBadge({ dias, fecha }: { dias: number; fecha: Date }) {
  const s: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' };
  if (dias < 0 && fecha.getFullYear() < CURRENT_YEAR) {
    return <span style={{ ...s, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>Vencida {Math.abs(dias)}d</span>;
  }
  if (dias < 0) {
    return <span style={{ ...s, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', color: '#fcd34d' }}>−{Math.abs(dias)}d</span>;
  }
  if (dias <= 30) {
    return <span style={{ ...s, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}>{dias}d</span>;
  }
  if (dias <= 90) {
    return <span style={{ ...s, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', color: '#fcd34d' }}>{dias}d</span>;
  }
  return <span style={{ ...s, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', color: '#6ee7b7' }}>{dias}d</span>;
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(61,112,255,0.22)',
    color: '#FFFFFF', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s',
  };

  return (
    <div style={{ ...glass, padding: '24px 26px', position: 'relative', overflow: 'hidden' }}>
      <div className="grain-subtle" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: 'rgba(51,102,255,0.15)', border: '1px solid rgba(61,112,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(100,150,255,0.9)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 15, margin: 0, color: '#FFFFFF' }}>Sugerencias de mejora</h3>
          <span style={{ fontSize: 11, color: 'rgba(178,206,255,0.5)', letterSpacing: '0.04em' }}>Cualquier idea que te parezca útil — se revisa en el panel de administración</span>
        </div>
      </div>

      {status === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 13, color: '#34d399', fontWeight: 500 }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(80,130,255,0.75)', marginBottom: 5 }}>Título</label>
              <input type="text" value={titulo} maxLength={100} onChange={e => setTitulo(e.target.value)} placeholder="Resumen breve de la mejora" style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.6)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <button onClick={send} disabled={status === 'sending' || !titulo.trim() || !desc.trim()}
              style={{ padding: '10px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', background: titulo.trim() && desc.trim() ? 'rgba(51,102,255,0.2)' : 'rgba(51,102,255,0.07)', border: `1px solid ${titulo.trim() && desc.trim() ? 'rgba(61,112,255,0.5)' : 'rgba(61,112,255,0.18)'}`, color: titulo.trim() && desc.trim() ? '#6699FF' : 'rgba(100,130,255,0.4)', transition: 'all 0.15s', alignSelf: 'flex-start' }}
              onMouseEnter={e => { if (titulo.trim() && desc.trim()) e.currentTarget.style.background = 'rgba(51,102,255,0.3)'; }}
              onMouseLeave={e => { if (titulo.trim() && desc.trim()) e.currentTarget.style.background = 'rgba(51,102,255,0.2)'; }}>
              {status === 'sending' ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(80,130,255,0.75)', marginBottom: 5 }}>Descripción</label>
            <textarea value={desc} maxLength={1000} rows={4} onChange={e => setDesc(e.target.value)} placeholder="Explica la mejora con detalle"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.6)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
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
  const [historicas, setHistoricas] = useState<{ estado: string }[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    cargarCarpetasDelServidor(ac.signal).then(setCarpetas).catch(() => {});
    cargarCorredoresDelServidor(ac.signal).then(setCorredores).catch(() => {});
    fetch('/api/flotas/historicas', { signal: ac.signal })
      .then(r => r.ok ? r.json() : [])
      .then(d => setHistoricas(Array.isArray(d) ? d : []))
      .catch(() => {});
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
    historicas.forEach(h => {
      const estado = h.estado === 'COTIZADA' ? 'OFERTADA' : h.estado;
      if (estado in counts) counts[estado] = (counts[estado] ?? 0) + 1;
    });
    return counts;
  }, [carpetas, historicas]);

  // Usar totales del donut (incluye historicas) para que KPIs y donut cuadren
  const totalPortfolio = Object.values(flotasEstadoCounts).reduce((s, v) => s + v, 0);
  const contratadas = flotasEstadoCounts['CONTRATADA'] ?? 0;
  const tasaContratacion = totalPortfolio > 0 ? Math.round((contratadas / totalPortfolio) * 100) : null;

  const donutData = useMemo(() => {
    const total = Object.values(flotasEstadoCounts).reduce((s, v) => s + v, 0);
    if (total === 0) return null;
    const SEGS = [
      { key: 'CONTRATADA', label: 'Contratadas', color: '#10b981' },
      { key: 'EN ESTUDIO',  label: 'En estudio',  color: '#3b82f6' },
      { key: 'OFERTADA',    label: 'Ofertadas',   color: '#8b5cf6' },
      { key: 'RECHAZADA',   label: 'Rechazadas',  color: '#ef4444' },
    ];
    let acc = 0;
    const segments = SEGS.map(({ key, label, color }) => {
      const val = flotasEstadoCounts[key] ?? 0;
      const pct = (val / total) * 100;
      const start = acc;
      acc += pct;
      return { key, label, color, val, pct, start, end: acc };
    });
    const gradient = segments
      .filter(s => s.val > 0)
      .map(s => `${s.color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`)
      .join(', ');
    return { total, segments, gradient };
  }, [flotasEstadoCounts]);

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
      .sort((a, b) => a.dias - b.dias);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-in fade-in duration-500">
      <style>{`
        .dash-kpi-grid  { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .dash-main-grid { display: grid; grid-template-columns: 380px 1fr; gap: 14px; }
        .dash-kpi-num   { font-size: 52px; }
        @keyframes orion-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .dash-alert-dot { animation: orion-blink 2s ease-in-out infinite; }
        @media (max-width: 960px) {
          .dash-main-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 700px) {
          .dash-kpi-grid { grid-template-columns: 1fr 1fr; }
          .dash-kpi-num  { font-size: 38px; }
        }
        @media (max-width: 440px) {
          .dash-kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Greeting ── */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 700, fontSize: 24, margin: 0, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
          {saludo}, {displayName(user)}
        </h2>
        <span style={{ fontSize: 14, color: 'rgba(178,206,255,0.65)' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* ── Alert banner (solo si hay vencidas reales de año anterior) ── */}
      {vencidasUrgentes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
          <div className="dash-alert-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
          {vencidasUrgentes.length === 1
            ? `${vencidasUrgentes[0].carpeta.nombre} — póliza vencida, pendiente de renovación`
            : `${vencidasUrgentes.length} pólizas vencidas pendientes de renovación`}
        </div>
      )}

      {/* ── 3 KPI cards ── */}
      <div className="dash-kpi-grid">
        <KpiCard
          title="Renovaciones urgentes"
          value={String(vencidasUrgentes.length)}
          color={vencidasUrgentes.length > 0 ? '#ef4444' : '#FFFFFF'}
          sub={vencidasUrgentes.length > 0
            ? `${vencidasUrgentes.length === 1 ? 'Póliza vencida' : 'Pólizas vencidas'} de año anterior`
            : 'Sin vencidas urgentes'}
        />
        <KpiCard
          title="Tasa de éxito"
          value={tasaContratacion !== null ? `${tasaContratacion}%` : '—'}
          color="#3b82f6"
          sub={`${contratadas} contratadas / ${totalPortfolio} portfolio`}
        />
        <KpiCard
          title="Corredores activos"
          value={String(corredores.length)}
          sub="Gestionando cartera"
        />
      </div>

      {/* ── Main grid: donut | renovaciones ── */}
      <div className="dash-main-grid">

        {/* Donut card */}
        <div style={{ ...glass, padding: '26px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Distribución cartera</span>
            <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)' }}>{donutData?.total ?? 0} flotas</span>
          </div>

          {!donutData ? (
            <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>Sin datos</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
              {/* Ring */}
              <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
                <div style={{
                  width: 180, height: 180, borderRadius: '50%',
                  background: `conic-gradient(${donutData.gradient})`,
                  filter: 'drop-shadow(0 0 18px rgba(51,102,255,0.18))',
                }} />
                {/* Hole */}
                <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: 'rgba(6,16,60,0.97)' }} />
                {/* Center text */}
                <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{donutData.total}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(178,198,245,0.55)', marginTop: 4 }}>flotas</span>
                </div>
              </div>

              {/* Legend */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {donutData.segments.map(seg => (
                  <div key={seg.key} style={{ display: 'grid', gridTemplateColumns: '10px 1fr 44px 40px', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'rgba(178,198,245,0.75)' }}>{seg.label}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: seg.color }}>{seg.val}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(178,198,245,0.55)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(seg.pct)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Renovaciones card */}
        <div style={{ ...glass, padding: '26px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Renovaciones próximas</span>
            <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)' }}>Contratadas activas · {contratadas}</span>
          </div>

          {renovaciones.length === 0 ? (
            <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>
              Sin flotas contratadas con fecha de vencimiento.
            </p>
          ) : (
            <div style={{ overflowY: 'auto' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[{ label: 'Flota', align: 'left' }, { label: 'Vencimiento', align: 'left' }, { label: '', align: 'right' }].map(h => (
                      <th key={h.label} style={{ textAlign: h.align as 'left' | 'right', padding: '0 14px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(80,130,255,0.80)', borderBottom: '1px solid rgba(61,112,255,0.20)' }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {renovaciones.map(({ carpeta, corredor, fecha, dias }) => {
                    const isVencidaVieja = dias < 0 && fecha.getFullYear() < CURRENT_YEAR;
                    const fechaColor = isVencidaVieja ? '#fca5a5' : dias < 0 ? '#fcd34d' : dias <= 90 ? '#fcd34d' : '#6ee7b7';
                    return (
                      <tr key={carpeta.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '13px 14px', borderBottom: '1px solid rgba(61,112,255,0.07)', verticalAlign: 'middle' }}>
                          <Link href={`/flotas?id=${carpeta.id}`}
                            style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', textDecoration: 'none', display: 'block' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#6699FF')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#FFFFFF')}>
                            {carpeta.nombre}
                          </Link>
                          <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.55)', marginTop: 3, display: 'block' }}>
                            {corredor?.nombre ?? 'Sin corredor'}
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', borderBottom: '1px solid rgba(61,112,255,0.07)', verticalAlign: 'middle' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', color: fechaColor }}>
                            {fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', borderBottom: '1px solid rgba(61,112,255,0.07)', textAlign: 'right', verticalAlign: 'middle' }}>
                          <RenovBadge dias={dias} fecha={fecha} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Vehículos por categoría ── */}
      <VehiculosCategorias stats={vehiculosCatStats} />

      {/* ── Sugerencias ── */}
      <SugerenciasSection user={user} />
    </div>
  );
}
