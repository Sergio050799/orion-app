"use client";

import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import VehiculosCategorias, { type CatStats } from './VehiculosCategorias';

const ESTADO_COLORS: Record<string, string> = {
  'EN ESTUDIO': '#3366FF',
  'OFERTADA': '#f59e0b',
  'CONTRATADA': '#10b981',
  'RECHAZADA': '#ef4444',
};

const glass: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  padding: '24px 26px',
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(61,112,255,0.12) inset',
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(3,10,42,0.95)',
      border: '1px solid rgba(51,102,255,0.2)',
      borderRadius: 8,
      padding: '6px 10px',
      fontSize: 11,
      color: '#EAF2FF',
    }}>
      <span style={{ fontWeight: 700 }}>{label ?? payload[0].name}</span>: {payload[0].value}
    </div>
  );
}

interface DashboardChartsProps {
  flotasPorEstado: { name: string; value: number }[];
  vehiculosPorTipo: { name: string; value: number }[];
  hasCarpetas: boolean;
  vehiculosCatStats: CatStats[];
}

export default function DashboardCharts({ flotasPorEstado, vehiculosPorTipo, hasCarpetas, vehiculosCatStats }: DashboardChartsProps) {
  const total = flotasPorEstado.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
      {/* Flotas por estado */}
      <div style={glass}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 17, margin: 0, color: '#FFFFFF' }}>
              Flotas por estado
            </h3>
            <span style={{ fontSize: 12, color: 'rgba(178,206,255,0.65)', letterSpacing: '0.06em' }}>Distribución actual</span>
          </div>
        </div>
        {!hasCarpetas ? (
          <p style={{ color: 'rgba(178,198,245,0.38)', fontSize: 12, textAlign: 'center', padding: '40px 0', margin: 0 }}>Sin datos</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={flotasPorEstado.filter(d => d.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {flotasPorEstado.filter(d => d.value > 0).map(d => (
                    <Cell key={d.name} fill={ESTADO_COLORS[d.name] ?? '#6b7280'} style={{ filter: `drop-shadow(0 0 8px ${ESTADO_COLORS[d.name]}88)` }} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {flotasPorEstado.filter(d => d.value > 0).map(d => (
                <li key={d.name} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', alignItems: 'center', gap: 12, fontSize: 12, color: '#D0DFFF', letterSpacing: '0.06em' }}>
                  <i style={{ width: 10, height: 10, borderRadius: 3, display: 'block', background: ESTADO_COLORS[d.name], boxShadow: `0 0 8px ${ESTADO_COLORS[d.name]}` }} />
                  <span>{d.name}</span>
                  <b style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 15, color: '#FFFFFF' }}>{d.value}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <VehiculosCategorias stats={vehiculosCatStats} />
    </div>
  );
}
