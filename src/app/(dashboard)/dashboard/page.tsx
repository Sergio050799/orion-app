"use client";

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { listarCarpetas, listarCorredores, cargarCarpetasDelServidor, cargarCorredoresDelServidor, type FlotaCarpeta, type Corredor } from '@/core/flotas';
import { useAuth } from '@/context/AuthContext';

const DashboardCharts = dynamic(() => import('./components/DashboardCharts'), {
    loading: () => <div className="h-64 animate-pulse rounded-xl" style={{ background: 'rgba(8,22,72,0.3)' }} />,
    ssr: false,
});

function diasHastaVencimiento(fechaStr: string): number {
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return Infinity;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.floor((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function formatFecha(fechaStr: string): string {
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
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

export default function DashboardPage() {
  const { user } = useAuth();
  const [carpetas, setCarpetas] = useState<FlotaCarpeta[]>(() => listarCarpetas());
  const [corredores, setCorredores] = useState<Corredor[]>(() => listarCorredores());

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

  const flotasActivas = carpetas.filter(c => c.estado !== 'RECHAZADA').length;
  const totalVehiculos = carpetas.reduce((sum, c) => {
    const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
    return sum + (rows?.length ?? 0);
  }, 0);
  const totalCorredores = corredores.length;
  const contratadas = carpetas.filter(c => c.estado === 'CONTRATADA').length;
  const rechazadas = carpetas.filter(c => c.estado === 'RECHAZADA').length;
  const tasaContratacion = (contratadas + rechazadas) > 0
    ? Math.round((contratadas / (contratadas + rechazadas)) * 100) : null;
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

  const alertas = useMemo(() => {
    return carpetas
      .filter(c => c.header?.fechaVencimiento)
      .map(c => {
        const dias = diasHastaVencimiento(c.header.fechaVencimiento!);
        const corredor = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
        return { carpeta: c, dias, corredor };
      })
      .filter(a => a.dias <= 90)
      .sort((a, b) => a.dias - b.dias);
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

      {/* Charts */}
      <DashboardCharts
        flotasPorEstado={flotasPorEstado}
        vehiculosPorTipo={vehiculosPorTipo}
        hasCarpetas={carpetas.length > 0}
      />

      {/* Renewal alerts */}
      <div style={{ ...glass, padding: '24px 26px', position: 'relative', overflow: 'hidden' }}>
        <div className="grain-subtle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <h3 style={{
            fontFamily: 'var(--font-display), Inter, sans-serif',
            fontWeight: 600, fontSize: 17, margin: 0, color: '#FFFFFF',
          }}>
            Próximas renovaciones
          </h3>
          <span style={{ fontSize: 12, color: 'rgba(178,206,255,0.65)', letterSpacing: '0.06em' }}>
            Distribución actual
          </span>
        </div>

        {alertas.length === 0 ? (
          <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '30px 0', margin: 0 }}>
            Sin renovaciones próximas en los siguientes 90 días.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Flota', 'Corredor', 'Vencimiento', 'Periodicidad', 'Estado'].map(h => (
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
              {alertas.map(({ carpeta, dias, corredor }) => (
                <tr key={carpeta.id} style={{ transition: 'background 180ms' }}
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
                    {formatFecha(carpeta.header.fechaVencimiento!)}
                  </td>
                  <td style={{ padding: '14px', fontSize: 13, color: 'rgba(188,216,255,0.7)', borderBottom: '1px solid rgba(51,102,255,0.08)' }}>
                    {corredor?.periodicidad ? corredor.periodicidad.charAt(0).toUpperCase() + corredor.periodicidad.slice(1) : '—'}
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
    </div>
  );
}
