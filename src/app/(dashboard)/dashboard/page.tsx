"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { listarCarpetas, listarCorredores, cargarCorredor, type FlotaCarpeta, type Corredor } from '@/core/flotas';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
};

const ESTADO_COLORS: Record<string, string> = {
  'EN ESTUDIO': '#818cf8',
  'CONTRATADA': '#34d399',
  'RECHAZADA': '#f87171',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <div style={glassCard}>
      <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
        {title}
      </p>
      <p style={{ fontSize: 28, fontWeight: 900, color: color ?? '#fff', fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );
}

// ─── Urgencia Badge ─────────────────────────────────────────────────────────

function UrgenciaBadge({ dias }: { dias: number }) {
  let bg: string, border: string, color: string, text: string;

  if (dias < 0) {
    bg = 'rgba(127,29,29,0.2)';
    border = 'rgba(185,28,28,0.5)';
    color = '#fca5a5';
    text = `VENCIDA HACE ${Math.abs(dias)} DÍAS`;
  } else if (dias < 30) {
    bg = 'rgba(239,68,68,0.15)';
    border = 'rgba(239,68,68,0.35)';
    color = '#f87171';
    text = `VENCE EN ${dias} DÍAS`;
  } else if (dias < 60) {
    bg = 'rgba(234,179,8,0.15)';
    border = 'rgba(234,179,8,0.35)';
    color = '#fbbf24';
    text = `VENCE EN ${dias} DÍAS`;
  } else {
    bg = 'rgba(34,197,94,0.15)';
    border = 'rgba(34,197,94,0.35)';
    color = '#34d399';
    text = `VENCE EN ${dias} DÍAS`;
  }

  return (
    <span style={{
      fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 4,
      background: bg, border: `1px solid ${border}`, color,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#e2e8f0' }}>
      <span style={{ fontWeight: 700 }}>{label ?? payload[0].name}</span>: {payload[0].value}
    </div>
  );
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const carpetas = useMemo(() => listarCarpetas(), []);
  const corredores = useMemo(() => listarCorredores(), []);
  const corredorMap = useMemo(() => {
    const map = new Map<string, Corredor>();
    corredores.forEach(c => map.set(c.id, c));
    return map;
  }, [corredores]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const flotasActivas = carpetas.filter(c => c.estado !== 'RECHAZADA').length;

  const totalVehiculos = carpetas.reduce((sum, c) => {
    const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
    return sum + (rows?.length ?? 0);
  }, 0);

  const totalCorredores = corredores.length;

  const contratadas = carpetas.filter(c => c.estado === 'CONTRATADA').length;
  const rechazadas = carpetas.filter(c => c.estado === 'RECHAZADA').length;
  const tasaContratacion = (contratadas + rechazadas) > 0
    ? Math.round((contratadas / (contratadas + rechazadas)) * 100)
    : null;
  const tasaColor = tasaContratacion === null ? '#fff' : tasaContratacion >= 50 ? '#34d399' : '#f87171';

  // ── Gráficos ──────────────────────────────────────────────────────────────

  const flotasPorEstado = useMemo(() => {
    const counts: Record<string, number> = { 'EN ESTUDIO': 0, 'CONTRATADA': 0, 'RECHAZADA': 0 };
    carpetas.forEach(c => { counts[c.estado] = (counts[c.estado] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [carpetas]);

  const vehiculosPorTipo = useMemo(() => {
    const counts: Record<string, number> = {};
    carpetas.forEach(c => {
      const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
      (rows ?? []).forEach(r => {
        const tipo = r['tipo_vehiculo']?.trim();
        if (tipo) counts[tipo] = (counts[tipo] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [carpetas]);

  // ── Alertas de renovación ─────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div className="glass-card flex items-center justify-between px-5 py-3 rounded-2xl">
          <div>
            <h1 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full" style={{ background: '#6366f1' }} />
              Dashboard
            </h1>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Vista general del negocio
            </p>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <KpiCard title="Flotas activas" value={String(flotasActivas)} />
          <KpiCard title="Vehículos" value={totalVehiculos.toLocaleString('es-ES')} />
          <KpiCard title="Corredores" value={String(totalCorredores)} />
          <KpiCard title="Tasa contratación" value={tasaContratacion !== null ? `${tasaContratacion}%` : '—'} color={tasaColor} />
        </div>

        {/* Gráficos */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Flotas por estado — Pie */}
          <div style={glassCard}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Flotas por estado
            </p>
            {carpetas.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={flotasPorEstado.filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {flotasPorEstado.filter(d => d.value > 0).map(d => (
                      <Cell key={d.name} fill={ESTADO_COLORS[d.name] ?? '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    formatter={(value: string) => (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Vehículos por tipo — Bar horizontal */}
          <div style={glassCard}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
              Vehículos por tipo
            </p>
            {vehiculosPorTipo.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>Sin datos de vehículos tipados</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={vehiculosPorTipo} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Alertas de renovación */}
        <div style={{ ...glassCard, marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            Próximas renovaciones
          </p>

          {alertas.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '30px 0' }}>
              Sin renovaciones próximas en los siguientes 90 días.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Flota', 'Corredor', 'Vencimiento', 'Periodicidad', 'Estado'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 800,
                        color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alertas.map(({ carpeta, dias, corredor }) => (
                    <tr key={carpeta.id}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '10px 12px' }}>
                        <Link href={`/flotas?id=${carpeta.id}`}
                          style={{ color: '#818cf8', fontWeight: 700, textDecoration: 'none', fontSize: 12 }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}>
                          {carpeta.nombre}
                        </Link>
                      </td>
                      <td style={{ padding: '10px 12px', color: corredor ? '#e2e8f0' : 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                        {corredor?.nombre ?? 'Sin corredor'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0', fontFamily: 'monospace', fontWeight: 600 }}>
                        {formatFecha(carpeta.header.fechaVencimiento!)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        {corredor?.periodicidad ? corredor.periodicidad.charAt(0).toUpperCase() + corredor.periodicidad.slice(1) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <UrgenciaBadge dias={dias} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
