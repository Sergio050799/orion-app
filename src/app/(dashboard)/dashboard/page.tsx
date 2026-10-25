"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor, type EstadoFlota,
} from '@/core/flotas';
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

function tiempoRelativo(isoStr: string): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hs = Math.floor(mins / 60);
  if (hs < 24) return `hace ${hs} h`;
  const ds = Math.floor(hs / 24);
  if (ds < 7) return `hace ${ds} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

const CURRENT_YEAR = new Date().getFullYear();

// ─── Sub-components ───────────────────────────────────────────────────────────

function RenovPill({ dias, fecha }: { dias: number; fecha: Date }) {
  const base: React.CSSProperties = {
    minWidth: 68, height: 24, padding: '0 9px', borderRadius: 999, border: '1px solid',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, whiteSpace: 'nowrap',
  };
  if (dias < 0 && fecha.getFullYear() < CURRENT_YEAR) {
    return <span style={{ ...base, borderColor: 'rgba(224,92,92,.3)', background: 'rgba(224,92,92,.07)', color: 'var(--danger)' }}>Vencida {Math.abs(dias)}d</span>;
  }
  if (dias < 0) {
    return <span style={{ ...base, borderColor: 'rgba(227,169,106,.3)', background: 'rgba(227,169,106,.07)', color: 'var(--warn)' }}>−{Math.abs(dias)}d</span>;
  }
  if (dias <= 15) {
    return <span style={{ ...base, borderColor: 'rgba(224,92,92,.3)', background: 'rgba(224,92,92,.07)', color: 'var(--danger)' }}>{dias} días</span>;
  }
  return <span style={{ ...base, borderColor: 'rgba(227,169,106,.3)', background: 'rgba(227,169,106,.07)', color: 'var(--warn)' }}>{dias} días</span>;
}

function SugerenciasSection({ user }: { user: string | null }) {
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
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
    width: '100%', padding: '9px 12px', borderRadius: 5, fontSize: 13,
    background: 'var(--soft)', border: '1px solid var(--line)',
    color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ paddingTop: 28, borderTop: '1px solid var(--line)' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', color: 'var(--text)', margin: '0 0 6px' }}>Sugerencias de mejora</h2>
      <p style={{ fontSize: 13, color: 'var(--sub)', margin: '0 0 16px' }}>
        Cualquier idea que te parezca útil. Se revisa en el panel de administración.
      </p>
      {status === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 5, background: 'rgba(76,175,133,.07)', border: '1px solid rgba(76,175,133,.22)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          <span style={{ fontSize: 13, color: 'var(--ok)' }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) minmax(220px,2fr) auto', gap: 10, maxWidth: 920 }}>
          <input type="text" value={titulo} maxLength={100} onChange={e => setTitulo(e.target.value)} placeholder="Título" style={iS} />
          <input type="text" value={desc} maxLength={350} onChange={e => setDesc(e.target.value)} placeholder="Descripción" style={iS} />
          <button
            onClick={send}
            disabled={status === 'sending' || !titulo.trim() || !desc.trim()}
            style={{
              padding: '9px 18px', borderRadius: 5, fontSize: 13, fontWeight: 600,
              cursor: titulo.trim() && desc.trim() ? 'pointer' : 'default',
              background: 'var(--soft)', border: '1px solid var(--line)',
              color: titulo.trim() && desc.trim() ? 'var(--text)' : 'var(--quiet)',
              transition: 'border-color .16s', opacity: status === 'sending' ? 0.6 : 1, whiteSpace: 'nowrap',
            }}
          >
            {status === 'sending' ? 'Enviando…' : 'Enviar sugerencia'}
          </button>
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

// ─── SEGS ─────────────────────────────────────────────────────────────────────

type SegDef = { key: EstadoFlota; label: string; color: string };
const SEGS: SegDef[] = [
  { key: 'CONTRATADA', label: 'Contratadas', color: 'var(--st-contratada)' },
  { key: 'EN ESTUDIO', label: 'En estudio',  color: 'var(--st-estudio)'    },
  { key: 'OFERTADA',   label: 'Ofertadas',   color: 'var(--st-ofertada)'   },
  { key: 'RECHAZADA',  label: 'Rechazadas',  color: 'var(--st-rechazada)'  },
];

const ESTADO_LABELS: Record<string, string> = {
  'CONTRATADA': 'Contratada', 'EN ESTUDIO': 'En estudio',
  'OFERTADA':   'Ofertada',   'RECHAZADA':  'Rechazada',
};
const ESTADO_COLORS: Record<string, string> = {
  'CONTRATADA': 'var(--st-contratada)', 'EN ESTUDIO': 'var(--st-estudio)',
  'OFERTADA':   'var(--st-ofertada)',   'RECHAZADA':  'var(--st-rechazada)',
};

// ─── CarteraDonut ─────────────────────────────────────────────────────────────

function CarteraDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const r = 82;
  const C = 2 * Math.PI * r;
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
      <svg viewBox="0 0 220 220" width={180} height={180} aria-hidden="true">
        <circle cx={110} cy={110} r={r} fill="none" stroke="var(--soft)" strokeWidth={24} />
        {total > 0 && (
          <g transform="rotate(-90 110 110)">
            {segments.map(s => {
              const fill = Math.max(0, s.arc - GAP);
              return (
                <circle key={s.key} cx={110} cy={110} r={r} fill="none"
                  stroke={s.color} strokeWidth={24}
                  strokeDasharray={`${fill} ${C - fill}`}
                  strokeDashoffset={C - s.startOffset}
                />
              );
            })}
          </g>
        )}
        <text x={110} y={108} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 32, fontWeight: 600, fill: 'var(--text)', letterSpacing: '-0.05em', fontFamily: 'var(--font-display)', pointerEvents: 'none' }}>
          {total}
        </text>
        <text x={110} y={127} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 9, fill: 'var(--quiet)', letterSpacing: '0.12em', fontFamily: 'inherit', pointerEvents: 'none' }}>
          FLOTAS
        </text>
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ActEntry = { fecha: string; accion: string; carpeta: FlotaCarpeta; estadoNuevo?: EstadoFlota };

export default function DashboardPage() {
  const { user } = useAuth();
  const [carpetas, setCarpetas]     = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [scope, setScope]           = useState<string>('all');

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

  const scopedCarpetas = useMemo(
    () => scope === 'all' ? carpetas : carpetas.filter(c => c.estado === (scope as EstadoFlota)),
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
  const tasaContratacion = totalCartera > 0 ? Math.round((contratadas / totalCartera) * 100) : null;

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
      .sort((a, b) => a.dias - b.dias)
      .filter(r => r.dias <= 60);
  }, [carpetas, scope, corredorMap]);

  const vencidasUrgentes = renovaciones.filter(r => r.dias < 0 && r.fecha.getFullYear() < CURRENT_YEAR);
  const renovacionesUrgentes = renovaciones.filter(r => r.dias >= 0 && r.dias <= 15);

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
    return Array.from(counts.values()).sort((a, b) => b.total - a.total).slice(0, 7);
  }, [scopedCarpetas, corredorMap]);

  const actividadReciente = useMemo((): ActEntry[] => {
    const entries: ActEntry[] = [];
    for (const c of carpetas) {
      for (const h of (c.historico ?? [])) {
        entries.push({ fecha: h.fecha, accion: h.accion, carpeta: c, estadoNuevo: h.estadoNuevo });
      }
    }
    if (entries.length < 3) {
      const sorted = [...carpetas].sort((a, b) =>
        new Date(b.actualizadaEn).getTime() - new Date(a.actualizadaEn).getTime()
      );
      for (const c of sorted.slice(0, 6)) {
        if (!entries.find(e => e.carpeta.id === c.id)) {
          entries.push({ fecha: c.actualizadaEn, accion: 'Actualizado', carpeta: c, estadoNuevo: c.estado });
        }
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
          estudio:    tipologias.reduce((s, t) => s + t.estudio, 0),
          ofertada:   tipologias.reduce((s, t) => s + t.ofertada, 0),
          contratada: tipologias.reduce((s, t) => s + t.contratada, 0),
          total:      tipologias.reduce((s, t) => s + t.total, 0),
        };
      })
      .filter(c => c.total > 0);
  }, [scopedCarpetas]);

  const hora     = new Date().getHours();
  const saludo   = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';
  const fechaHoy = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const maxBroker = corredoresStats.length > 0 ? corredoresStats[0].total : 1;

  const donutCounts = scope === 'all'
    ? flotasEstadoCounts
    : Object.fromEntries(SEGS.map(s => [s.key, s.key === (scope as EstadoFlota) ? totalPortfolio : 0]));

  const thStyle = (left: boolean): React.CSSProperties => ({
    textAlign: left ? 'left' : 'center',
    fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
    color: 'var(--quiet)', paddingBottom: 10, paddingRight: 0,
    textTransform: 'uppercase',
  });

  return (
    <div className="animate-in fade-in duration-500">
      <style>{`
        .db-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
        .db-kpi{display:flex;flex-direction:column;justify-content:flex-start;padding:20px 14px 20px 0;min-width:0}
        .db-kpi+.db-kpi{padding-left:clamp(12px,1.8cqw,20px);border-left:1px solid var(--line)}
        .db-grid2{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);border-bottom:1px solid var(--line)}
        .db-grid2.r40{grid-template-columns:minmax(0,2fr) minmax(0,3fr)}
        .db-grid2>section{padding:26px 0 28px;min-width:0}
        .db-grid2>section:first-child{padding-right:clamp(18px,3cqw,36px)}
        .db-grid2>section+section{padding-left:clamp(18px,3cqw,36px);border-left:1px solid var(--line)}
        .db-srow{display:grid;grid-template-columns:10px 1fr auto auto;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line);font-size:14px}
        .db-srow:last-child{border-bottom:0}
        .db-bar{display:grid;grid-template-columns:minmax(80px,140px) 1fr 36px;gap:12px;align-items:center;padding:8px 4px;border-radius:3px}
        .db-bar:hover{background:var(--hover)}
        .dash-alert{animation:orion-blink 2s ease-in-out infinite}
        @keyframes orion-blink{0%,100%{opacity:1}50%{opacity:.25}}
        @media(prefers-reduced-motion:reduce){.dash-alert{animation:none!important}}
      `}</style>

      {/* Alert */}
      {vencidasUrgentes.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', marginBottom: 24, borderRadius: 5, background: 'rgba(224,92,92,.06)', border: '1px solid rgba(224,92,92,.2)', fontSize: 13, color: 'var(--danger)' }}>
          <div className="dash-alert" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
          {vencidasUrgentes.length === 1
            ? `${vencidasUrgentes[0].carpeta.nombre} — póliza vencida, pendiente de renovación`
            : `${vencidasUrgentes.length} pólizas vencidas pendientes de renovación`}
        </div>
      )}

      {/* Intro */}
      <section style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,3cqw,36px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.1, margin: '0 0 7px', fontFamily: 'var(--font-display)' }}>
            {saludo}, {displayName(user)}
          </h1>
          <p style={{ margin: 0, color: 'var(--sub)', fontSize: 14 }}>{fechaHoy}</p>
        </div>
        <div>
          <select
            value={scope}
            onChange={e => setScope(e.target.value)}
            aria-label="Filtrar dashboard por estado de la cartera"
            style={{
              appearance: 'none', WebkitAppearance: 'none',
              background: 'var(--soft)', border: '1px solid var(--line)', borderRadius: 5,
              padding: '10px 36px 10px 13px', fontSize: 13, color: 'var(--text)',
              cursor: 'pointer', minWidth: 170, fontFamily: 'inherit',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23909db4' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M2 4h12M4 8h8M6.5 12h3'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
            }}
          >
            <option value="all">Toda la cartera</option>
            <option value="EN ESTUDIO">En estudio</option>
            <option value="OFERTADA">Ofertadas</option>
            <option value="CONTRATADA">Contratadas</option>
            <option value="RECHAZADA">Rechazadas</option>
          </select>
        </div>
      </section>

      {/* KPIs */}
      <section className="db-kpis" aria-label="Indicadores principales">
        {([
          {
            label: scope === 'all' ? 'Flotas en cartera' : `Flotas · ${ESTADO_LABELS[scope] ?? scope}`,
            value: totalPortfolio.toLocaleString('es-ES'),
            note:  scope === 'all' ? 'Total de expedientes' : `${totalCartera.toLocaleString('es-ES')} en total`,
          },
          {
            label: 'Vehículos',
            value: totalVehiculos.toLocaleString('es-ES'),
            note:  totalVehiculos > 0 ? 'Flotas con detalle cargado' : 'Sin vehículos asociados',
          },
          {
            label: 'Tasa de contratación',
            value: tasaContratacion !== null ? `${tasaContratacion} %` : '—',
            note:  `${contratadas} contratadas de ${totalCartera.toLocaleString('es-ES')}`,
          },
          {
            label: 'Corredores activos',
            value: corredoresActivos.toLocaleString('es-ES'),
            note:  scope === 'all' ? 'Con flotas asociadas' : 'En este ámbito',
          },
          {
            label: 'Renovaciones · 60 días',
            value: renovaciones.length.toLocaleString('es-ES'),
            note:  renovacionesUrgentes.length > 0 ? `${renovacionesUrgentes.length} vencen en ≤ 15 días` : 'Solo flotas contratadas',
            urgent: renovacionesUrgentes.length > 0,
          },
        ] as Array<{ label: string; value: string; note: string; urgent?: boolean }>).map((kpi, i) => (
          <div key={i} className="db-kpi">
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--sub)', textTransform: 'uppercase', letterSpacing: '0.07em', lineHeight: 1.4 }}>{kpi.label}</span>
            <span style={{
              fontSize: 'clamp(24px,3cqw,40px)', fontWeight: 600, letterSpacing: '-0.055em',
              lineHeight: 1.05, margin: '10px 0 7px', fontVariantNumeric: 'tabular-nums',
              fontFamily: 'var(--font-display)',
              color: kpi.urgent ? 'var(--danger)' : 'var(--text)',
            }}>
              {kpi.value}
            </span>
            <span style={{ fontSize: 13, color: 'var(--quiet)', lineHeight: 1.5 }}>{kpi.note}</span>
          </div>
        ))}
      </section>

      {/* Grid 1: Distribución | Donut */}
      <div className="db-grid2">
        <section aria-label="Distribución de cartera">
          <h2 style={{ fontSize: 'clamp(16px,1.5cqw,20px)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 18px', fontFamily: 'var(--font-display)' }}>
            Distribución de cartera
          </h2>
          <div style={{ marginBottom: 14 }}>
            <strong style={{ display: 'block', fontSize: 'clamp(32px,4cqw,50px)', fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 0.95, fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
              {totalPortfolio.toLocaleString('es-ES')}
            </strong>
            <span style={{ display: 'block', marginTop: 8, color: 'var(--sub)', fontSize: 13, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              {scope === 'all' ? 'Flotas en cartera' : `Flotas ${ESTADO_LABELS[scope] ?? ''}`}
            </span>
          </div>
          {totalPortfolio > 0 && (
            <div aria-hidden="true" style={{ height: 6, display: 'flex', gap: 2, borderRadius: 999, overflow: 'hidden', margin: '18px 0 16px' }}>
              {SEGS.map(({ key, color }) => {
                const count = scope === 'all' ? (flotasEstadoCounts[key] ?? 0) : (key === scope ? totalPortfolio : 0);
                if (count === 0) return null;
                return <i key={key} style={{ display: 'block', height: '100%', flex: count, background: color }} />;
              })}
            </div>
          )}
          <div>
            {SEGS.map(({ key, label, color }) => {
              const count = scope === 'all' ? (flotasEstadoCounts[key] ?? 0) : (key === scope ? totalPortfolio : 0);
              const pct   = totalCartera > 0 ? Math.round((count / totalCartera) * 100) : 0;
              return (
                <div key={key} className="db-srow" style={{ opacity: scope !== 'all' && key !== scope ? 0.3 : 1 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'block' }} />
                  <span>{label}</span>
                  <b style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 26, textAlign: 'right' }}>{count}</b>
                  <span style={{ color: 'var(--quiet)', fontSize: 13, minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct} %</span>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-label="Situación de la cartera">
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 'clamp(16px,1.5cqw,20px)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
              Situación de la cartera
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>Estado actual de las flotas</p>
          </div>
          <CarteraDonut counts={donutCounts} total={totalPortfolio} />
          <p style={{ fontSize: 13, color: 'var(--quiet)', lineHeight: 1.6, marginTop: 12 }}>
            Contratadas sin vehículos: flotas anteriores a la carga de detalle.
          </p>
        </section>
      </div>

      {/* Grid 2: Vehículos cats | Corredores */}
      <div className="db-grid2">
        <section>
          <VehiculosCategorias stats={vehiculosCatStats} noBorder />
        </section>
        <section aria-label="Flotas por corredor">
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 'clamp(16px,1.5cqw,20px)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
              Flotas por corredor
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>
              {corredoresStats.length > 0
                ? `${scope === 'all' ? 'Toda la cartera' : ESTADO_LABELS[scope] ?? scope} · ${corredoresStats.length} corredores`
                : 'Intermediarios con más cartera'}
            </p>
          </div>
          {corredoresStats.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--quiet)', padding: '20px 0', borderTop: '1px solid var(--line)' }}>
              Sin corredores en este ámbito.
            </p>
          ) : (
            <div>
              {corredoresStats.map((b, i) => (
                <div key={b.nombre} className="db-bar">
                  <span style={{ fontSize: 13, color: 'var(--sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nombre}</span>
                  <span style={{ display: 'block', height: 8, background: 'var(--soft)', borderRadius: 2, overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(b.total / maxBroker) * 100}%`, background: 'var(--blue)', borderRadius: 2, opacity: i === 0 ? 1 : 0.55 }} />
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{b.total}</span>
                </div>
              ))}
              <p style={{ fontSize: 13, color: 'var(--quiet)', marginTop: 12 }}>Una flota se asigna a un único corredor.</p>
            </div>
          )}
        </section>
      </div>

      {/* Grid 3: Renovaciones | Actividad */}
      <div className="db-grid2 r40" style={{ borderBottom: 0 }}>
        <section aria-label="Renovaciones próximas">
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 'clamp(16px,1.5cqw,20px)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
              Renovaciones próximas
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>Vencimientos en los siguientes 60 días</p>
          </div>
          {renovaciones.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--quiet)', padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              {scope !== 'all' && scope !== 'CONTRATADA'
                ? `Las renovaciones son de flotas contratadas, no de «${ESTADO_LABELS[scope] ?? scope}».`
                : 'Sin flotas contratadas con vencimiento en los próximos 60 días.'}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle(true)}>Flota</th>
                  <th style={{ ...thStyle(false), textAlign: 'center' }}>Vehículos</th>
                  <th style={{ ...thStyle(false), textAlign: 'right' }}>Vence en</th>
                </tr>
              </thead>
              <tbody>
                {renovaciones.map(({ carpeta, corredor, fecha: fVcto, dias }) => (
                  <tr key={carpeta.id}>
                    <td style={{ padding: '12px 8px 12px 0', borderTop: '1px solid var(--line)', verticalAlign: 'top' }}>
                      <Link href={`/flotas?id=${carpeta.id}`}
                        style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}>
                        {carpeta.nombre}
                      </Link>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginTop: 1 }}>
                        {corredor?.nombre ?? 'Sin corredor'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', borderTop: '1px solid var(--line)', textAlign: 'center', fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                      {((carpeta.trabajo?.length ?? 0) > 0 ? carpeta.trabajo.length : (carpeta.original?.length ?? 0)).toLocaleString('es-ES')}
                    </td>
                    <td style={{ padding: '12px 0 12px 8px', borderTop: '1px solid var(--line)', textAlign: 'right', verticalAlign: 'middle' }}>
                      <RenovPill dias={dias} fecha={fVcto} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-label="Actividad reciente">
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 'clamp(16px,1.5cqw,20px)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
              Actividad reciente
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>Últimas operaciones en ORION</p>
          </div>
          {actividadReciente.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--quiet)', padding: '16px 0', borderTop: '1px solid var(--line)' }}>
              Sin actividad registrada.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle(true)}>Operación</th>
                  <th style={{ ...thStyle(false), textAlign: 'center' }}>Estado</th>
                  <th style={{ ...thStyle(false), textAlign: 'right' }}>Hace</th>
                </tr>
              </thead>
              <tbody>
                {actividadReciente.map((a, i) => (
                  <tr key={i}>
                    <td style={{ padding: '11px 8px 11px 0', borderTop: '1px solid var(--line)', verticalAlign: 'top' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{a.accion}</span>
                      <Link href={`/flotas?id=${a.carpeta.id}`}
                        style={{ display: 'block', fontSize: 12, color: 'var(--sub)', marginTop: 1, textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--sub)')}>
                        {a.carpeta.nombre}
                      </Link>
                    </td>
                    <td style={{ padding: '11px 8px', borderTop: '1px solid var(--line)', textAlign: 'center', verticalAlign: 'middle' }}>
                      {a.estadoNuevo ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                          <i style={{ width: 6, height: 6, borderRadius: '50%', background: ESTADO_COLORS[a.estadoNuevo] ?? 'var(--sub)', display: 'inline-block', flexShrink: 0 }} />
                          {ESTADO_LABELS[a.estadoNuevo] ?? a.estadoNuevo}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '11px 0 11px 8px', borderTop: '1px solid var(--line)', textAlign: 'right', verticalAlign: 'middle', color: 'var(--quiet)', whiteSpace: 'nowrap' }}>
                      {tiempoRelativo(a.fecha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* Sugerencias */}
      <div style={{ marginTop: 36 }}>
        <SugerenciasSection user={user} />
      </div>
    </div>
  );
}
