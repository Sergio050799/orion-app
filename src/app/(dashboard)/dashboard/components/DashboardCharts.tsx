"use client";

import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  'EN ESTUDIO': '#818cf8',
  'CONTRATADA': '#34d399',
  'RECHAZADA': '#f87171',
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', fontSize: 11, color: '#e2e8f0' }}>
      <span style={{ fontWeight: 700 }}>{label ?? payload[0].name}</span>: {payload[0].value}
    </div>
  );
}

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
};

interface DashboardChartsProps {
  flotasPorEstado: { name: string; value: number }[];
  vehiculosPorTipo: { name: string; value: number }[];
  hasCarpetas: boolean;
}

export default function DashboardCharts({ flotasPorEstado, vehiculosPorTipo, hasCarpetas }: DashboardChartsProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      {/* Flotas por estado — Pie */}
      <div style={glassCard}>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Flotas por estado
        </p>
        {!hasCarpetas ? (
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

      {/* Vehiculos por tipo — Bar horizontal */}
      <div style={glassCard}>
        <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Vehiculos por tipo
        </p>
        {vehiculosPorTipo.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>Sin datos de vehiculos tipados</p>
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
  );
}
