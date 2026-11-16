"use client";

/* FASE 2 (opcional): chip de variación + sparkline del KPI. Solo se usa donde YA existe una serie real
   (p. ej. flotas y vehículos del dashboard, que ya tienen serie mensual y comparación con el año anterior).
   No inventar datos: si no hay serie, no se pone. */
import { useEffect, useId, useState } from "react";

export function KpiDelta({ pct, goodWhenDown = false }: { pct: number | null; goodWhenDown?: boolean }) {
  if (pct === null || !isFinite(pct)) return null;
  const up = pct >= 0, good = goodWhenDown ? !up : up;
  const txt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(pct));
  return <span className={`kpi-delta ${good ? "good" : "bad"}`}>{up ? "▲" : "▼"} {txt} %</span>;
}

export function KpiSpark({ data, urgent = false }: { data: number[]; urgent?: boolean }) {
  // useId podría generar IDs distintos entre server y cliente cuando el KPI se renderiza
  // condicionalmente según data cargada — provocando hydration mismatch. Montamos solo en cliente.
  const id = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || data.length < 2) return null;
  const w = 100, h = 30, mx = Math.max(...data), mn = Math.min(...data);
  const p = data.map((v, j) => [(j / (data.length - 1)) * w, h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8)]);
  const d = p.map((q, j) => (j ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join("");
  return (
    <svg className={`kpi-spark${urgent ? " urgent" : ""}`} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".25" /><stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="ar" style={{ fill: `url(#${id})` }} d={`${d}L100 30L0 30Z`} />
      <path className="ln" pathLength={1} d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
