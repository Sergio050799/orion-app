"use client";

import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { listarCarpetas, normalizeTipoVehiculo, type FlotaCarpeta, type TarifaEntry } from '@/core/flotas';

const CalibradorPrecios = lazy(() => import('./CalibradorPrecios'));

type EmisionTab = 'flotas' | 'calibrador';

// ─── Estilos ─────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
};

const ESTADO_CFG: Record<string, { bg: string; border: string; color: string }> = {
  'OFERTADA': { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.35)', color: '#f59e0b' },
  'CONTRATADA': { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.35)', color: '#10b981' },
};

const thStyle: React.CSSProperties = {
  padding: '10px 10px', fontSize: 10, fontWeight: 800,
  color: 'rgba(70,120,255,0.6)', textTransform: 'uppercase',
  letterSpacing: '0.1em', textAlign: 'left',
  borderBottom: '1px solid rgba(51,102,255,0.1)',
  background: 'rgba(6,14,50,0.4)',
  position: 'sticky', top: 0, zIndex: 2,
  whiteSpace: 'nowrap',
};

const cellInput: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 6,
  background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(51,102,255,0.12)',
  color: '#FFFFFF', outline: 'none', width: '100%',
  transition: 'border-color 0.15s',
};

// ─── Tipos fila emisión ─────────────────────────────────────────────────────

interface FilaEmision {
  idx: number;
  matricula: string;
  id_catalogo: string;
  marca: string;
  modelo: string;
  tipo: string;
  uso: string;
  precio_objetivo: string;
  precio_reutilizado: boolean; // true si el precio vino de un vehículo previo
  id_reutilizado: boolean;     // true si el id_catalogo vino de un match previo
}

// ─── Auto-asignación de USO según tipo de vehículo ──────────────────────────

function normalizeTipo(raw: string): string {
  return normalizeTipoVehiculo(raw);
}

const USO_PARTICULAR = new Set(['Turismo', 'Derivado de turismo', 'Motocicleta', 'Ciclomotor']);
const USO_TRANSPORTES = new Set(['Furgoneta', 'Camión rígido', 'Cabeza tractora', 'Semirremolque', 'Industrial matriculado', 'Industrial no matriculado']);

function autoUso(tipo: string): string {
  if (USO_PARTICULAR.has(tipo)) return 'Particular';
  if (USO_TRANSPORTES.has(tipo)) return 'Transportes propios';
  return '';
}

// ─── Buscar vehículo reutilizable en todas las carpetas ─────────────────────

interface VehiculoPrevio {
  id_catalogo: string;
  precio: string;
}

function buildHistorico(allCarpetas: FlotaCarpeta[]): Map<string, VehiculoPrevio> {
  // Clave: "MARCA|MODELO|KW|COMBUSTIBLE" normalizado → { id_catalogo, precio }
  const map = new Map<string, VehiculoPrevio>();

  for (const c of allCarpetas) {
    const catSel = c.catalogoSeleccion ?? {};
    const precioMap = new Map<string, string>();
    (c.oferta ?? []).forEach(o => {
      const mat = o['matricula']?.trim()?.toUpperCase();
      const prima = o['oferta_prima_mmt']?.trim();
      if (mat && prima) precioMap.set(mat, prima);
    });

    const rows = c.trabajo?.length > 0 ? c.trabajo : c.original;
    (rows ?? []).forEach(r => {
      const mat = r['matricula']?.trim()?.toUpperCase() ?? '';
      const idCat = catSel[r['matricula']?.trim() ?? ''] ?? '';
      if (!idCat) return; // solo interesa si tiene id de catálogo

      const marca = (r['marca'] ?? '').trim().toUpperCase();
      const modelo = (r['modelo'] ?? '').trim().toUpperCase();
      const kw = (r['kw'] ?? '').trim();
      const combustible = (r['combustible'] ?? '').trim().toUpperCase();

      if (!marca || !modelo) return;
      const key = `${marca}|${modelo}|${kw}|${combustible}`;
      // Guardar el más reciente (iteramos de viejo a nuevo, el último gana)
      map.set(key, { id_catalogo: idCat, precio: precioMap.get(mat) ?? '' });
    });
  }
  return map;
}

// ─── Construir filas de emisión ─────────────────────────────────────────────

function buildFilas(flota: FlotaCarpeta, historico: Map<string, VehiculoPrevio>): FilaEmision[] {
  const rows = flota.trabajo?.length > 0 ? flota.trabajo : flota.original;
  if (!rows || rows.length === 0) return [];

  const catSel = flota.catalogoSeleccion ?? {};
  const tarifa = flota.tarifaFlota ?? [];

  // Mapa precios oferta
  const precioOferta = new Map<string, string>();
  (flota.oferta ?? []).forEach(o => {
    const mat = o['matricula']?.trim();
    const prima = o['oferta_prima_mmt']?.trim();
    if (mat && prima) precioOferta.set(mat.toUpperCase(), prima);
  });

  // Mapa cobertura por matrícula (de la oferta)
  const coberturaMap = new Map<string, string>();
  (flota.oferta ?? []).forEach(o => {
    const mat = o['matricula']?.trim();
    const cob = o['coberturas']?.trim();
    if (mat && cob) coberturaMap.set(mat.toUpperCase(), cob);
  });

  return rows.map((r, i) => {
    const mat = r['matricula']?.trim() ?? '';
    const matUp = mat.toUpperCase();
    const tipo = normalizeTipo(r['tipo_vehiculo']?.trim() ?? '');
    const uso = autoUso(tipo);

    // ID catálogo: primero de la selección, luego del histórico
    let idCat = catSel[mat] ?? '';
    let idReutilizado = false;
    let precioObj = precioOferta.get(matUp) ?? '';
    let precioReutilizado = false;

    // Si no tiene id, buscar en histórico por match de campos clave
    if (!idCat) {
      const marca = (r['marca'] ?? '').trim().toUpperCase();
      const modelo = (r['modelo'] ?? '').trim().toUpperCase();
      const kw = (r['kw'] ?? '').trim();
      const combustible = (r['combustible'] ?? '').trim().toUpperCase();
      if (marca && modelo) {
        const key = `${marca}|${modelo}|${kw}|${combustible}`;
        const prev = historico.get(key);
        if (prev) {
          idCat = prev.id_catalogo;
          idReutilizado = true;
          if (!precioObj && prev.precio) {
            precioObj = prev.precio;
            precioReutilizado = true;
          }
        }
      }
    }

    // Si aún no tiene precio, buscar en tarifa de la flota
    if (!precioObj && tipo && tarifa.length > 0) {
      const cobertura = coberturaMap.get(matUp) ?? '';
      const tarifaMatch = tarifa.find(t =>
        t.tipo.toLowerCase() === tipo.toLowerCase() &&
        (!cobertura || t.cobertura.toLowerCase() === cobertura.toLowerCase())
      );
      // Si no hay match con cobertura específica, buscar solo por tipo
      const tarifaTipo = tarifaMatch ?? tarifa.find(t => t.tipo.toLowerCase() === tipo.toLowerCase());
      if (tarifaTipo && tarifaTipo.precio > 0) {
        precioObj = String(tarifaTipo.precio);
      }
    }

    return {
      idx: i,
      matricula: mat,
      id_catalogo: idCat,
      marca: r['marca']?.trim() ?? '',
      modelo: r['modelo']?.trim() ?? '',
      tipo,
      uso,
      precio_objetivo: precioObj,
      precio_reutilizado: precioReutilizado,
      id_reutilizado: idReutilizado,
    };
  });
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function EmisionPage() {
  const [emisionTab, setEmisionTab] = useState<EmisionTab>('flotas');
  const [selectedFlotaId, setSelectedFlotaId] = useState<string | null>(null);
  const [editedFilas, setEditedFilas] = useState<FilaEmision[] | null>(null);
  const [copyToast, setCopyToast] = useState('');

  const carpetas = useMemo(() => listarCarpetas(), []);

  const flotasEmision = useMemo(() =>
    carpetas.filter(c => c.estado === 'OFERTADA' || c.estado === 'CONTRATADA')
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === 'OFERTADA' ? -1 : 1;
        return a.nombre.localeCompare(b.nombre);
      }),
    [carpetas]
  );

  const selectedFlota = useMemo(() =>
    flotasEmision.find(f => f.id === selectedFlotaId) ?? null,
    [flotasEmision, selectedFlotaId]
  );

  // Histórico de vehículos de TODAS las carpetas (para reusar IDs)
  const historico = useMemo(() => buildHistorico(carpetas), [carpetas]);

  // Filas de emisión
  const filas = useMemo(() => {
    if (editedFilas) return editedFilas;
    if (!selectedFlota) return [];
    return buildFilas(selectedFlota, historico);
  }, [selectedFlota, editedFilas, historico]);

  const handleSelectFlota = useCallback((id: string) => {
    if (selectedFlotaId === id) {
      setSelectedFlotaId(null);
      setEditedFilas(null);
    } else {
      setSelectedFlotaId(id);
      setEditedFilas(null);
    }
  }, [selectedFlotaId]);

  const handleCellChange = useCallback((idx: number, field: keyof FilaEmision, value: string) => {
    setEditedFilas(prev => {
      const base = prev ?? filas;
      const updated = [...base];
      const fila = { ...updated[idx], [field]: value };
      // Si cambian el tipo, auto-recalcular uso
      if (field === 'tipo') {
        const tipoNorm = normalizeTipo(value);
        fila.tipo = tipoNorm;
        fila.uso = autoUso(tipoNorm);
      }
      updated[idx] = fila;
      return updated;
    });
  }, [filas]);

  // Copiar columna
  const copyColumn = useCallback((label: string, getter: (f: FilaEmision) => string) => {
    const values = filas.map(getter);
    navigator.clipboard.writeText(values.join('\n'));
    setCopyToast(`${label} copiado (${filas.length})`);
    setTimeout(() => setCopyToast(''), 1800);
  }, [filas]);

  // Copiar todo
  const copyAll = useCallback(() => {
    const headers = ['MATRÍCULA', 'ID_CATÁLOGO', 'MARCA', 'MODELO', 'TIPO', 'USO', 'PRECIO_OBJETIVO'];
    const rows = filas.map(f =>
      [f.matricula, f.id_catalogo, f.marca, f.modelo, f.tipo, f.uso, f.precio_objetivo].join('\t')
    );
    navigator.clipboard.writeText([headers.join('\t'), ...rows].join('\n'));
    setCopyToast(`Todo copiado (${filas.length} filas)`);
    setTimeout(() => setCopyToast(''), 1800);
  }, [filas]);

  // Datos para el calibrador
  const calibradorData = useMemo(() =>
    filas.filter(f => f.matricula).map(f => ({
      matricula: f.matricula,
      precio_objetivo: f.precio_objetivo,
    })),
    [filas]
  );

  const handleGoCalibrador = useCallback(() => {
    setEmisionTab('calibrador');
  }, []);

  // Columnas mínimas
  const COLS: { key: keyof FilaEmision; label: string; width: number; editable: boolean; mono?: boolean }[] = [
    { key: 'matricula',       label: 'Matrícula',    width: 105, editable: false, mono: true },
    { key: 'id_catalogo',     label: 'ID Catálogo',  width: 95,  editable: true, mono: true },
    { key: 'marca',           label: 'Marca',        width: 110, editable: true },
    { key: 'modelo',          label: 'Modelo',       width: 130, editable: true },
    { key: 'tipo',            label: 'Tipo',         width: 130, editable: true },
    { key: 'uso',             label: 'Uso',          width: 130, editable: true },
    { key: 'precio_objetivo', label: 'Precio Obj.',  width: 105, editable: true, mono: true },
  ];

  // Stats
  const conId = filas.filter(f => f.id_catalogo).length;
  const conPrecio = filas.filter(f => f.precio_objetivo).length;
  const reutilizados = filas.filter(f => f.id_reutilizado).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Zone Header */}
        <div style={{ ...glassCard, padding: '20px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 4, height: 36, borderRadius: 2, background: 'linear-gradient(180deg, #3366FF 0%, #1240CC 100%)' }} />
              <div>
                <h1 style={{ fontSize: 15, fontWeight: 900, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                  Centro de Emisión
                </h1>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(178,198,245,0.6)', margin: '4px 0 0 0' }}>
                  {emisionTab === 'calibrador'
                    ? (selectedFlota
                        ? (<>Calibrador — <span style={{ color: '#BDD4FF' }}>{selectedFlota.nombre}</span> · {calibradorData.length} vehículos con precio</>)
                        : 'Calibrador de precios — ajusta el precio de entrada para obtener el objetivo')
                    : selectedFlota
                      ? (<>
                          <span style={{ color: '#BDD4FF' }}>{selectedFlota.nombre}</span>
                          <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                          <span>{filas.length} vehículos</span>
                          {conId > 0 && <>
                            <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                            <span style={{ color: '#10b981' }}>{conId} con ID</span>
                          </>}
                          {reutilizados > 0 && <>
                            <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                            <span style={{ color: '#a78bfa' }}>{reutilizados} reutilizados</span>
                          </>}
                          {conPrecio > 0 && <>
                            <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                            <span style={{ color: '#f59e0b' }}>{conPrecio} con precio</span>
                          </>}
                        </>)
                      : 'Selecciona una flota ofertada o contratada para emitir'
                  }
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {emisionTab === 'flotas' && selectedFlota && filas.length > 0 && (
                <>
                  <button onClick={copyAll} style={{
                    fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 10,
                    background: 'rgba(61,112,255,0.12)', color: '#3366FF',
                    border: '1px solid rgba(51,102,255,0.25)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copiar todo
                  </button>
                  <button onClick={handleGoCalibrador} style={{
                    fontSize: 11, fontWeight: 800, padding: '8px 18px', borderRadius: 10,
                    background: 'linear-gradient(135deg, #1240CC, #3366FF)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    boxShadow: '0 8px 24px -8px rgba(18,64,204,0.4)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Calibrar precios
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 16, borderTop: '1px solid rgba(61,112,255,0.12)', paddingTop: 14 }}>
            {([
              { key: 'flotas' as EmisionTab, label: 'Hoja de Emisión' },
              { key: 'calibrador' as EmisionTab, label: 'Calibrador de Precios' },
            ]).map(t => {
              const active = emisionTab === t.key;
              return (
                <button key={t.key} onClick={() => setEmisionTab(t.key)} style={{
                  fontSize: 12, fontWeight: 700, padding: '8px 18px', borderRadius: 10,
                  cursor: 'pointer', border: 'none',
                  background: active ? 'rgba(18,64,204,0.35)' : 'transparent',
                  color: active ? '#FFFFFF' : 'rgba(178,198,245,0.55)',
                  boxShadow: active ? '0 0 0 1px rgba(70,120,255,0.5) inset' : 'none',
                  transition: 'all 180ms',
                }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#BDD4FF'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(178,198,245,0.55)'; }}
                >{t.label}</button>
              );
            })}
          </div>
        </div>

        {/* ── Calibrador de Precios ── */}
        {emisionTab === 'calibrador' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'rgba(178,198,245,0.4)' }}>Cargando calibrador...</div>}>
            <CalibradorPrecios initialData={calibradorData.length > 0 ? calibradorData : undefined} />
          </Suspense>
        )}

        {/* ── Hoja de Emisión ── */}
        {emisionTab === 'flotas' && (
          <>
            {/* Fleet selector */}
            {flotasEmision.length === 0 ? (
              <div style={{ ...glassCard, padding: '60px 40px', textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(178,198,245,0.25)" strokeWidth="1.5" style={{ margin: '0 auto 16px' }}>
                  <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#BDD4FF', margin: '0 0 8px 0' }}>
                  No hay flotas listas para emisión
                </p>
                <p style={{ fontSize: 12, color: 'rgba(178,198,245,0.5)', margin: 0 }}>
                  Las flotas aparecerán aquí cuando su estado sea <strong style={{ color: '#f59e0b' }}>OFERTADA</strong> o <strong style={{ color: '#10b981' }}>CONTRATADA</strong>.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }} className="custom-scrollbar">
                {flotasEmision.map(flota => {
                  const rows = flota.trabajo?.length > 0 ? flota.trabajo : flota.original;
                  const nVeh = rows?.length ?? 0;
                  const cfg = ESTADO_CFG[flota.estado] ?? ESTADO_CFG['OFERTADA'];
                  const isSelected = selectedFlotaId === flota.id;

                  return (
                    <button
                      key={flota.id}
                      onClick={() => handleSelectFlota(flota.id)}
                      style={{
                        flex: '0 0 auto', minWidth: 220,
                        padding: '16px 20px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
                        background: isSelected ? cfg.bg : 'rgba(12, 28, 82, 0.75)',
                        border: isSelected ? `1px solid ${cfg.border}` : '1px solid rgba(61,112,255,0.22)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(70,120,255,0.5)'; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = isSelected ? cfg.border : 'rgba(61,112,255,0.22)'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF' }}>{flota.nombre}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                          background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>
                          {flota.estado}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>
                        <strong style={{ color: '#BDD4FF' }}>{nVeh}</strong> vehículos
                        {flota.tarifaFlota && flota.tarifaFlota.length > 0 && (
                          <span> · <span style={{ color: '#10b981' }}>{flota.tarifaFlota.length} tarifas</span></span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Resumen presupuesto comparativo ── */}
            {selectedFlota && (() => {
              const primaMMT = (selectedFlota.oferta ?? []).reduce((s, r) => s + (parseFloat(r['oferta_prima_mmt'] ?? '') || 0), 0);
              const primaCliente = selectedFlota.primaClienteTotal ?? 0;
              const descuento = selectedFlota.descuentoOferta ?? 0;
              const primaNeta = primaMMT > 0 && descuento > 0 ? primaMMT * (1 - descuento / 100) : primaMMT;
              const fmtE = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
              const nVeh = filas.length || 1;

              if (primaMMT === 0 && primaCliente === 0) return null;

              const items = [
                ...(primaCliente > 0 ? [{
                  label: 'Prima cliente actual', value: fmtE(primaCliente),
                  sub: `${fmtE(primaCliente / nVeh)} / veh.`,
                  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)',
                }] : []),
                ...(primaMMT > 0 ? [{
                  label: 'Prima ofertada MMT', value: fmtE(primaMMT),
                  sub: `${fmtE(primaMMT / nVeh)} / veh.`,
                  color: '#3366FF', bg: 'rgba(51,102,255,0.1)', border: 'rgba(51,102,255,0.25)',
                }] : []),
                ...(descuento > 0 && primaMMT > 0 ? [{
                  label: `Prima neta (−${descuento}%)`, value: fmtE(primaNeta),
                  sub: `${fmtE(primaNeta / nVeh)} / veh.`,
                  color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)',
                }] : []),
                ...(primaCliente > 0 && primaMMT > 0 ? (() => {
                  const base = primaCliente;
                  const compare = primaNeta > 0 ? primaNeta : primaMMT;
                  const diff = compare - base;
                  const pct = ((diff / base) * 100).toFixed(1);
                  return [{
                    label: 'Diferencia', value: `${diff <= 0 ? '' : '+'}${fmtE(diff)}`,
                    sub: `${pct}%`,
                    color: diff <= 0 ? '#10b981' : '#ef4444',
                    bg: diff <= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                    border: diff <= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                  }];
                })() : []),
              ];

              return (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)`, gap: 12 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      padding: '16px 20px', borderRadius: 14,
                      background: item.bg, border: `1px solid ${item.border}`,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(178,198,245,0.6)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: item.color, fontFamily: 'monospace' }}>
                        {item.value}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)', fontFamily: 'monospace', marginTop: 3 }}>
                        {item.sub}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Data table */}
            {selectedFlota && filas.length > 0 && (
              <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 340px)' }} className="custom-scrollbar">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'center', width: 40 }}>#</th>
                        {COLS.map(col => (
                          <th key={col.key}
                            onClick={() => copyColumn(col.label, f => String(f[col.key] ?? ''))}
                            style={{ ...thStyle, width: col.width, cursor: 'pointer', userSelect: 'none' }}
                            title={`Click para copiar columna ${col.label}`}
                          >
                            {col.label}
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                              style={{ display: 'inline-block', marginLeft: 4, verticalAlign: 'middle', opacity: 0.4 }}>
                              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                            </svg>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila, i) => (
                        <tr key={i}
                          style={{ borderBottom: '1px solid rgba(61,112,255,0.08)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                        >
                          <td style={{ padding: '6px 10px', fontSize: 11, color: 'rgba(178,198,245,0.4)', textAlign: 'center', fontWeight: 700 }}>
                            {i + 1}
                          </td>
                          {COLS.map(col => {
                            const value = String(fila[col.key] ?? '');
                            // Indicadores visuales para datos reutilizados/auto
                            let indicator: React.ReactNode = null;
                            if (col.key === 'id_catalogo' && fila.id_reutilizado) {
                              indicator = <span title="ID reutilizado de vehículo previo" style={{ fontSize: 8, color: '#a78bfa', marginLeft: 4 }}>R</span>;
                            }
                            if (col.key === 'precio_objetivo' && fila.precio_reutilizado) {
                              indicator = <span title="Precio de emisión anterior" style={{ fontSize: 8, color: '#a78bfa', marginLeft: 4 }}>R</span>;
                            }

                            return (
                              <td key={col.key} style={{ padding: '4px 4px' }}>
                                {col.editable ? (
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <input
                                      style={{
                                        ...cellInput,
                                        fontFamily: col.mono ? 'monospace' : 'inherit',
                                        fontWeight: col.key === 'precio_objetivo' ? 700 : 500,
                                        color: col.key === 'precio_objetivo' && value
                                          ? (fila.precio_reutilizado ? '#a78bfa' : '#f59e0b')
                                          : col.key === 'id_catalogo' && fila.id_reutilizado
                                            ? '#a78bfa'
                                            : '#FFFFFF',
                                      }}
                                      value={value}
                                      onChange={e => handleCellChange(i, col.key, e.target.value)}
                                      onFocus={e => (e.currentTarget.style.borderColor = '#3366FF')}
                                      onBlur={e => (e.currentTarget.style.borderColor = 'rgba(51,102,255,0.12)')}
                                    />
                                    {indicator}
                                  </div>
                                ) : (
                                  <span style={{
                                    fontSize: 12, fontWeight: 700, color: '#FFFFFF',
                                    fontFamily: col.mono ? 'monospace' : 'inherit',
                                    padding: '4px 8px', display: 'block',
                                  }}>
                                    {value || '—'}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedFlota && filas.length === 0 && (
              <div style={{ ...glassCard, padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'rgba(178,198,245,0.5)', margin: 0 }}>
                  Esta flota no tiene vehículos cargados.
                </p>
              </div>
            )}
          </>
        )}

        {/* Toast */}
        {copyToast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '10px 24px',
            borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 9999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}>
            {copyToast}
          </div>
        )}
      </div>
    </div>
  );
}
