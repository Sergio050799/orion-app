"use client";

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { listarCarpetas, listarCorredores, cargarCarpetasDelServidor, cargarCorredoresDelServidor, type FlotaCarpeta, type Corredor } from '@/core/flotas';
import type { CatStats } from './components/VehiculosCategorias';
import { useAuth } from '@/context/AuthContext';

const DashboardCharts = dynamic(() => import('./components/DashboardCharts'), {
    loading: () => <div className="h-64 animate-pulse rounded-xl" style={{ background: 'rgba(8,22,72,0.3)' }} />,
    ssr: false,
});

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

function formatFecha(fechaStr: string): string {
  const d = parseFechaFlexible(fechaStr);
  if (!d) return fechaStr || '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const PERIODICIDAD_MESES: Record<string, number> = {
  mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function proximaRegularizacion(fechaVencimiento: string, periodicidad: string): Date | null {
  const vto = parseFechaFlexible(fechaVencimiento);
  if (!vto) return null;
  const meses = PERIODICIDAD_MESES[periodicidad.toLowerCase()];
  if (!meses) return null;
  const now = new Date();
  const candidate = new Date(vto);
  while (candidate > now) candidate.setMonth(candidate.getMonth() - meses);
  candidate.setMonth(candidate.getMonth() + meses);
  // Si coincide con el vencimiento es Renovación, no Regularización
  if (isSameDay(candidate, vto)) return null;
  return candidate;
}

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(61,112,255,0.12) inset',
};

function KpiCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div style={{ ...glass, padding: '24px 26px', position: 'relative', overflow: 'hidden' }}>
      {/* Corner glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 80, height: 80,
        background: 'radial-gradient(circle, rgba(51,102,255,0.22), transparent 70%)',
        filter: 'blur(20px)',
        pointerEvents: 'none',
      }} />
      <div className="grain-subtle" />
      <strong style={{
        fontFamily: 'var(--font-display), Inter, sans-serif',
        fontWeight: 700, fontSize: 28, color: color ?? '#FFFFFF',
        letterSpacing: '-0.01em', display: 'block',
      }}>
        {value}
      </strong>
      <em style={{
        fontStyle: 'normal',
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.10em',
        color: 'rgba(80,130,255,0.75)', fontWeight: 600,
        display: 'block', marginTop: 8,
      }}>
        {title}
      </em>
    </div>
  );
}

function UrgenciaBadge({ dias }: { dias: number }) {
  let cls: string, text: string;

  if (dias < 0) {
    cls = 'urg-red';
    text = 'Vencida';
  } else if (dias < 30) {
    cls = 'urg-orange';
    text = `${dias} días`;
  } else if (dias <= 60) {
    cls = 'urg-yellow';
    text = `${dias} días`;
  } else {
    cls = 'urg-green';
    text = `${dias} días`;
  }

  const styles: Record<string, React.CSSProperties> = {
    'urg-red': { color: '#fecaca', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)' },
    'urg-orange': { color: '#fed7aa', background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)' },
    'urg-yellow': { color: '#fef3c7', background: 'rgba(234,179,8,0.18)', border: '1px solid rgba(234,179,8,0.4)' },
    'urg-green': { color: '#bbf7d0', background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.4)' },
  };

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 500,
      ...styles[cls],
    }}>
      {text}
    </span>
  );
}

/** Extrae nombre legible del email: "sergio.garcia@..." → "Sergio" */
function displayName(email: string | null): string {
  if (!email) return 'Usuario';
  const local = email.split('@')[0]; // "sergio.garcia"
  const first = local.split(/[._-]/)[0]; // "sergio"
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Normaliza tipo de vehículo: singular, primera letra mayúscula */
const TIPO_NORMALIZE: Record<string, string> = {
  'furgoneta': 'Furgoneta',
  'furgonetas': 'Furgoneta',
  'furgon': 'Furgoneta',
  'furgones': 'Furgoneta',
  'turismo': 'Turismo',
  'turismos': 'Turismo',
  'cabeza tractora': 'Cabeza tractora',
  'cabezas tractoras': 'Cabeza tractora',
  'camion rigido': 'Camión rígido',
  'camión rígido': 'Camión rígido',
  'camiones rigidos': 'Camión rígido',
  'semirremolque': 'Semirremolque',
  'semirremolques': 'Semirremolque',
  'derivado de turismo': 'Derivado de turismo',
  'industrial matriculado': 'Industrial matriculado',
  'industrial no matriculado': 'Industrial no matriculado',
  'motocicleta': 'Motocicleta',
  'motocicletas': 'Motocicleta',
  'ciclomotor': 'Ciclomotor',
  'ciclomotores': 'Ciclomotor',
  'autobus': 'Autobús',
  'autobuses': 'Autobús',
};

function normalizeTipo(raw: string): string {
  const key = raw.toLowerCase().trim();
  return TIPO_NORMALIZE[key] ?? (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
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
    color: '#FFFFFF', outline: 'none', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ ...glass, padding: '24px 26px', position: 'relative', overflow: 'hidden' }}>
      <div className="grain-subtle" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(51,102,255,0.15)', border: '1px solid rgba(61,112,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(100,150,255,0.9)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <h3 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 15, margin: 0, color: '#FFFFFF' }}>
            Sugerencias de mejora
          </h3>
          <span style={{ fontSize: 11, color: 'rgba(178,206,255,0.5)', letterSpacing: '0.04em' }}>
            Cualquier idea que te parezca útil — se revisa en el panel de administración
          </span>
        </div>
      </div>

      {status === 'done' ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px',
          borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span style={{ fontSize: 13, color: '#34d399', fontWeight: 500 }}>Sugerencia enviada — gracias.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(80,130,255,0.75)', marginBottom: 5 }}>
                Título
              </label>
              <input
                type="text" value={titulo} maxLength={100}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Resumen breve de la mejora"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.6)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}
              />
            </div>
            <button
              onClick={send}
              disabled={status === 'sending' || !titulo.trim() || !desc.trim()}
              style={{
                padding: '10px 20px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                background: titulo.trim() && desc.trim() ? 'rgba(51,102,255,0.2)' : 'rgba(51,102,255,0.07)',
                border: `1px solid ${titulo.trim() && desc.trim() ? 'rgba(61,112,255,0.5)' : 'rgba(61,112,255,0.18)'}`,
                color: titulo.trim() && desc.trim() ? '#6699FF' : 'rgba(100,130,255,0.4)',
                transition: 'all 0.15s', alignSelf: 'flex-start',
              }}
              onMouseEnter={e => { if (titulo.trim() && desc.trim()) e.currentTarget.style.background = 'rgba(51,102,255,0.3)'; }}
              onMouseLeave={e => { if (titulo.trim() && desc.trim()) e.currentTarget.style.background = 'rgba(51,102,255,0.2)'; }}
            >
              {status === 'sending' ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(80,130,255,0.75)', marginBottom: 5 }}>
              Descripción
            </label>
            <textarea
              value={desc} maxLength={1000} rows={4}
              onChange={e => setDesc(e.target.value)}
              placeholder="Explica la mejora con detalle"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.6)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Vehículos por Categoría — clasificación ────────────────────────────────

const SUBTITULOS_CAT: Record<string, string> = {
  '1ª Categoría':   'Turismo · todoterreno · furgoneta',
  '2ª Categoría':   'Camión · tractocamión · autobús',
  '3ª Categoría':   'Moto · ciclomotor · microcar',
  'Sin clasificar': 'Tipo no identificado',
};

function getCategoria(raw: string): string {
  const l = raw.toLowerCase().trim();
  if (/moto(cicleta)?|ciclomotor|microcar|triciclo|cuadri/.test(l)) return '3ª Categoría';
  if (/\bcami[oó]n|tractocami|\btractor\b|cabeza\s*tractora|autob[uú]s|autobus|autocar|microb[uú]s|microbus|semirremolque|\bremolque\b|maquinaria|industrial\s+(?:no\s+)?matriculado|pesado/.test(l)) return '2ª Categoría';
  if (/furg[oó]n(?!eta)/.test(l)) return '2ª Categoría';
  if (/turismo|berlina|familiar|todoterreno|todo[\s-]terreno|furgoneta|derivado|coupe|cabri|monovolumen|hatchback/.test(l)) return '1ª Categoría';
  return 'Sin clasificar';
}

function getTipologia(raw: string): string {
  const MAP: Record<string, string> = {
    'furgoneta': 'Furgoneta', 'furgonetas': 'Furgoneta',
    'furgon': 'Furgón', 'furgones': 'Furgón', 'furgón': 'Furgón',
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
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>(() => listarCarpetas());
  const [corredores, setCorredores] = useState<Corredor[]>(() => listarCorredores());
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

  const flotasActivas = carpetas.filter(c => c.estado !== 'RECHAZADA').length;
  const totalVehiculos = carpetas.reduce((sum, c) => {
    const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
    return sum + (rows?.length ?? 0);
  }, 0);
  const totalCorredores = corredores.length;
  const contratadas = carpetas.filter(c => c.estado === 'CONTRATADA').length;
  const tasaContratacion = carpetas.length > 0
    ? Math.round((contratadas / carpetas.length) * 100) : null;
  const tasaColor = tasaContratacion === null ? '#fff' : tasaContratacion >= 50 ? '#34d399' : '#f87171';

  const flotasPorEstado = useMemo(() => {
    const counts: Record<string, number> = { 'EN ESTUDIO': 0, 'OFERTADA': 0, 'CONTRATADA': 0, 'RECHAZADA': 0 };
    carpetas.forEach(c => { counts[c.estado] = (counts[c.estado] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [carpetas]);

  const vehiculosPorTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    carpetas.forEach(c => {
      const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
      (rows ?? []).forEach(r => {
        const raw = r['tipo_vehiculo']?.trim();
        if (raw) {
          const tipo = normalizeTipo(raw);
          counts[tipo] = (counts[tipo] ?? 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [carpetas]);

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

  const alertas = useMemo(() => {
    const entries: { carpeta: FlotaCarpeta; dias: number; corredor: Corredor | null | undefined; tipo: 'vencimiento' | 'regularizacion'; fecha: Date }[] = [];

    for (const c of carpetas) {
      const corredor = c.corredor_id ? corredorMap.get(c.corredor_id) : null;

      // Próxima regularización (solo EXTERNA con fechaVencimiento + periodicidad)
      if (
        c.header?.formaPago?.toUpperCase() === 'EXTERNA' &&
        c.header?.fechaVencimiento &&
        c.header?.periodicidad
      ) {
        const proxima = proximaRegularizacion(c.header.fechaVencimiento, c.header.periodicidad);
        if (proxima) {
          const dias = diasHasta(proxima);
          if (dias >= 0 && dias <= 30) entries.push({ carpeta: c, dias, corredor, tipo: 'regularizacion', fecha: proxima });
        }
      }

      // Vencimiento de póliza
      if (c.header?.fechaVencimiento) {
        const fecha = parseFechaFlexible(c.header.fechaVencimiento);
        if (fecha) {
          const dias = diasHasta(fecha);
          if (dias >= 0 && dias <= 30) entries.push({ carpeta: c, dias, corredor, tipo: 'vencimiento', fecha });
        }
      }
    }

    return entries.sort((a, b) => a.dias - b.dias);
  }, [carpetas, corredorMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="animate-in fade-in duration-500">

      {/* Greeting */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display), Inter, sans-serif',
          fontWeight: 700, fontSize: 24, margin: 0, color: '#FFFFFF',
          letterSpacing: '-0.01em',
        }}>
          {(() => { const h = new Date().getHours(); return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; })()}, {displayName(user)}
        </h2>
        <span style={{ fontSize: 14, color: 'rgba(178,206,255,0.65)' }}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard title="Flotas activas" value={String(flotasActivas)} />
        <KpiCard title="Vehículos totales" value={totalVehiculos.toLocaleString('es-ES')} />
        <KpiCard title="Corredores" value={String(totalCorredores)} />
        <KpiCard title="Tasa contratación" value={tasaContratacion !== null ? `${tasaContratacion}%` : '—'} color={tasaColor} />
      </div>

      {/* Portfolio de flotas */}
      {(() => {
        const contratadas  = carpetas.filter(c => c.estado === 'CONTRATADA').length
          + historicas.filter(h => h.estado === 'CONTRATADA').length;
        const enEstudio    = carpetas.filter(c => c.estado === 'EN ESTUDIO').length
          + historicas.filter(h => h.estado === 'EN ESTUDIO').length;
        const ofertadas    = carpetas.filter(c => c.estado === 'OFERTADA').length
          + historicas.filter(h => h.estado === 'COTIZADA' || h.estado === 'OFERTADA').length;
        const rechazadas   = carpetas.filter(c => c.estado === 'RECHAZADA').length
          + historicas.filter(h => h.estado === 'RECHAZADA').length;
        const total = contratadas + enEstudio + ofertadas + rechazadas;
        const CHIPS: { label: string; count: number; color: string; bg: string; border: string }[] = [
          { label: 'Contratadas',  count: contratadas, color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
          { label: 'En estudio',   count: enEstudio,   color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.3)' },
          { label: 'Ofertadas',    count: ofertadas,   color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.3)' },
          { label: 'Rechazadas',   count: rechazadas,  color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.3)'  },
        ];
        return (
          <div style={{ ...glass, padding: '20px 26px', position: 'relative', overflow: 'hidden' }}>
            <div className="grain-subtle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 15, margin: 0, color: '#FFFFFF' }}>
                Portfolio de flotas
              </h3>
              <span style={{ fontSize: 11, color: 'rgba(178,206,255,0.5)', letterSpacing: '0.06em' }}>{total} flotas en total</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {CHIPS.map(({ label, count, color, bg, border }) => (
                <div key={label} style={{ padding: '14px 18px', borderRadius: 14, background: bg, border: `1px solid ${border}` }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'var(--font-display), Inter, sans-serif', letterSpacing: '-0.01em' }}>{count}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color, opacity: 0.8, marginTop: 6 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Charts */}
      <DashboardCharts
        flotasPorEstado={flotasPorEstado}
        vehiculosPorTipo={vehiculosPorTipo}
        hasCarpetas={carpetas.length > 0}
        vehiculosCatStats={vehiculosCatStats}
      />

      {/* Renewal alerts */}
      <div style={{ ...glass, padding: '24px 26px', position: 'relative', overflow: 'hidden' }}>
        <div className="grain-subtle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <h3 style={{
            fontFamily: 'var(--font-display), Inter, sans-serif',
            fontWeight: 600, fontSize: 17, margin: 0, color: '#FFFFFF',
          }}>
            Regularizaciones y renovaciones
          </h3>
          <span style={{ fontSize: 12, color: 'rgba(178,206,255,0.65)', letterSpacing: '0.06em' }}>
            Distribución actual
          </span>
        </div>

        {alertas.length === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '30px 0', margin: 0 }}>
            Sin regularizaciones ni renovaciones en los próximos 30 días.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Flota', 'Corredor', 'Fecha', 'Tipo', 'Estado'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.10em',
                    color: 'rgba(80,130,255,0.75)',
                    borderBottom: '1px solid rgba(61,112,255,0.22)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alertas.map(({ carpeta, dias, corredor, tipo, fecha }) => (
                <tr key={`${carpeta.id}_${tipo}`} style={{ transition: 'background 180ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '14px', fontSize: 13, borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    <Link href={`/flotas?id=${carpeta.id}`}
                      style={{ color: '#6699FF', fontWeight: 600, textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#FFFFFF')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#6699FF')}>
                      {carpeta.nombre}
                    </Link>
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: '#D0DFFF', borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    {corredor?.nombre ?? 'Sin corredor'}
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: '#D0DFFF', fontFamily: 'monospace', borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    {fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '14px', fontSize: 12, borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: 999, fontWeight: 600,
                      background: tipo === 'regularizacion' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.12)',
                      color: tipo === 'regularizacion' ? '#fbbf24' : '#f87171',
                      border: `1px solid ${tipo === 'regularizacion' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.25)'}`,
                    }}>
                      {tipo === 'regularizacion'
                        ? `Reg. ${carpeta.header?.periodicidad ?? ''}`
                        : 'Renovación'}
                    </span>
                  </td>
                  <td style={{ padding: '14px', borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    <UrgenciaBadge dias={dias} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sugerencias */}
      <SugerenciasSection user={user} />

    </div>
  );
}
