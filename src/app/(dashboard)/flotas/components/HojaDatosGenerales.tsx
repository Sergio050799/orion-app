"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { listarCorredores, guardarCarpeta, normalizeTipoVehiculo, type FlotaCarpeta, type Corredor, type TarifaEntry, TIPO_VEHICULO_OPTS, COBERTURA_OPTS } from '@/core/flotas';
import type { FlotaHeader } from './types';

// ─── Badge próxima renovación ─────────────────────────────────────────────────

function proximaRenovacion(fechaStr?: string): boolean {
  if (!fechaStr) return false;
  const fecha = new Date(fechaStr);
  if (isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  const diff = (fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 30;
}

// ─── HojaDatosGenerales ───────────────────────────────────────────────────────

interface Props {
  carpetaActiva: FlotaCarpeta;
  header: FlotaHeader;
  onHeaderChange: (h: FlotaHeader) => void;
  onCarpetaChange: (c: FlotaCarpeta) => void;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 800,
  color: 'rgba(70,120,255,0.8)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '7px 10px',
  borderRadius: 8,
  background: 'rgba(6,14,50,0.55)',
  border: '1px solid rgba(61,112,255,0.22)',
  color: '#FFFFFF',
  outline: 'none',
  fontFamily: 'inherit',
};

// ─── Helpers para normalizar cobertura ─────────────────────────────────────
function normalizeCobertura(raw: string): string {
  const c = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (c.includes('todo riesgo')) return 'Todo Riesgo con Franquicia';
  if (c.includes('terceros ampliado') || c.includes('terceros amp')) return 'Terceros Ampliado';
  if (c.includes('terceros')) return 'Terceros';
  return raw.trim();
}

export default function HojaDatosGenerales({ carpetaActiva, header, onHeaderChange, onCarpetaChange }: Props) {
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [tarifaToast, setTarifaToast] = useState('');
  const tarifaFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCorredores(listarCorredores());
  }, []);

  // ─── Importar tarifa desde Excel ─────────────────────────────────────────
  const handleImportTarifa = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const entries: TarifaEntry[] = [];

      // Intentar leer como tabla con columnas (tipo, cobertura, precio)
      if (rows.length > 0) {
        const keys = Object.keys(rows[0]);
        // Detectar si tiene columnas tipo/cobertura/precio
        const hasColumns = keys.some(k => {
          const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          return kn.includes('tipo') || kn.includes('cobertura') || kn.includes('precio');
        });

        if (hasColumns) {
          // Modo columnas: buscar tipo, cobertura, precio
          for (const r of rows) {
            const get = (...aliases: string[]) => {
              for (const a of aliases) {
                for (const rk of Object.keys(r)) {
                  if (rk.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === a) {
                    return String(r[rk] ?? '').trim();
                  }
                }
              }
              return '';
            };
            const tipo = get('tipo', 'tipo vehiculo', 'tipo_vehiculo');
            const cobertura = get('cobertura', 'coberturas', 'coberturas solicitadas');
            const precioStr = get('precio', 'importe', 'prima', 'valor');
            if (tipo && precioStr) {
              entries.push({
                tipo: normalizeTipoVehiculo(tipo),
                cobertura: cobertura ? normalizeCobertura(cobertura) : '',
                precio: parseFloat(precioStr.replace(',', '.').replace(/[^0-9.]/g, '')) || 0,
              });
            }
          }
        } else {
          // Modo "campo / valor" — filas como "Furgoneta / Terceros Ampliado" → precio
          for (const r of rows) {
            const vals = Object.values(r).map(v => String(v).trim());
            // Buscar una fila con formato "Tipo / Cobertura" en una celda y un numero en otra
            for (let i = 0; i < vals.length; i++) {
              if (vals[i].includes('/')) {
                const [tipoPart, cobPart] = vals[i].split('/').map(s => s.trim());
                // Buscar precio en otra celda
                for (let j = 0; j < vals.length; j++) {
                  if (j === i) continue;
                  const num = parseFloat(vals[j].replace(',', '.').replace(/[^0-9.]/g, ''));
                  if (num > 0) {
                    entries.push({
                      tipo: normalizeTipoVehiculo(tipoPart),
                      cobertura: cobPart ? normalizeCobertura(cobPart) : '',
                      precio: num,
                    });
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (entries.length === 0) {
        setTarifaToast('No se encontraron tarifas en el archivo');
        setTimeout(() => setTarifaToast(''), 3000);
        return;
      }

      const updated = { ...carpetaActiva, tarifaFlota: entries };
      guardarCarpeta(updated);
      onCarpetaChange(updated);
      setTarifaToast(`${entries.length} tarifa${entries.length > 1 ? 's' : ''} importada${entries.length > 1 ? 's' : ''}`);
      setTimeout(() => setTarifaToast(''), 3000);
    } catch {
      setTarifaToast('Error al leer el archivo');
      setTimeout(() => setTarifaToast(''), 3000);
    }
  }, [carpetaActiva, onCarpetaChange]);

  // ─── Importar datos generales desde Excel ────────────────────────────────
  const datosFileRef = useRef<HTMLInputElement>(null);
  const [datosToast, setDatosToast] = useState('');

  const handleImportDatos = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) { setDatosToast('Excel vacio'); setTimeout(() => setDatosToast(''), 2000); return; }

      // Helper flexible para buscar valor
      const find = (...aliases: string[]): string => {
        for (const r of rows) {
          const vals = Object.values(r).map(v => String(v).trim());
          const keys = Object.keys(r);
          // Buscar en las claves del objeto
          for (const a of aliases) {
            for (const k of keys) {
              const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              if (kn === a || kn.includes(a)) {
                const v = String(r[k] ?? '').trim();
                if (v) return v;
              }
            }
          }
          // Buscar en formato campo/valor (primera columna = campo, segunda = valor)
          if (vals.length >= 2) {
            const campo = vals[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            for (const a of aliases) {
              if (campo === a || campo.includes(a)) return vals[1];
            }
          }
        }
        return '';
      };

      const newHeader = { ...header };
      const cif = find('cif', 'cif empresa', 'nif');
      const tomador = find('tomador', 'razon social', 'empresa', 'nombre');
      const actividad = find('actividad', 'actividad empresa', 'sector');
      const formaPago = find('forma de pago', 'forma pago', 'pago');
      const efecto = find('efecto', 'fecha efecto');
      const poliza = find('poliza actual', 'poliza', 'n poliza');
      const cia = find('cia actual', 'cia', 'compania', 'aseguradora');
      const fechaInicio = find('fecha inicio', 'inicio');
      const fechaVcto = find('fecha vencimiento', 'vencimiento');
      const cifTomador = find('cif tomador');
      const periodicidad = find('periodicidad', 'frecuencia');

      let count = 0;
      if (cif) { newHeader.cif = cif; count++; }
      if (tomador) { newHeader.tomador = tomador; count++; }
      if (actividad) { newHeader.actividad = actividad; count++; }
      if (formaPago) { newHeader.formaPago = formaPago; count++; }
      if (efecto) { newHeader.efecto = efecto; count++; }
      if (poliza) { newHeader.polizaActual = poliza; count++; }
      if (cia) { newHeader.ciaActual = cia; count++; }
      if (fechaInicio) { newHeader.fechaInicio = fechaInicio; count++; }
      if (fechaVcto) { newHeader.fechaVencimiento = fechaVcto; count++; }
      if (cifTomador) { newHeader.cifTomador = cifTomador; count++; }
      if (periodicidad) {
        const p = periodicidad.toLowerCase();
        if (p.includes('mensual')) newHeader.periodicidad = 'mensual';
        else if (p.includes('trimestral')) newHeader.periodicidad = 'trimestral';
        else if (p.includes('semestral')) newHeader.periodicidad = 'semestral';
        else if (p.includes('anual')) newHeader.periodicidad = 'anual';
        count++;
      }

      // Nombre de la flota
      const nombreFlota = find('nombre flota', 'nombre', 'flota');
      if (nombreFlota && nombreFlota !== tomador) {
        const updNombre = { ...carpetaActiva, nombre: nombreFlota };
        guardarCarpeta(updNombre);
        onCarpetaChange(updNombre);
        count++;
      }

      if (count === 0) {
        setDatosToast('No se encontraron datos reconocidos');
        setTimeout(() => setDatosToast(''), 3000);
        return;
      }

      onHeaderChange(newHeader);
      setDatosToast(`${count} campo${count > 1 ? 's' : ''} importado${count > 1 ? 's' : ''}`);
      setTimeout(() => setDatosToast(''), 3000);
    } catch {
      setDatosToast('Error al leer el archivo');
      setTimeout(() => setDatosToast(''), 3000);
    }
  }, [header, onHeaderChange]);

  const set = (key: keyof FlotaHeader, value: string) => {
    onHeaderChange({ ...header, [key]: value });
  };

  const handleCorredorChange = (corredor_id: string) => {
    const corredor = corredores.find(c => c.id === corredor_id);
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      corredor_id: corredor_id || undefined,
      // Auto-fill commission from corredor if not yet set
      porcentajeComision: carpetaActiva.porcentajeComision ?? corredor?.porcentajeComision,
    };
    guardarCarpeta(updated);
    onCarpetaChange(updated);
  };

  const handleComisionChange = (val: string) => {
    const updated: FlotaCarpeta = {
      ...carpetaActiva,
      porcentajeComision: parseFloat(val) || 0,
    };
    guardarCarpeta(updated);
    onCarpetaChange(updated);
  };

  const venceProximo = proximaRenovacion(header.fechaVencimiento);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }} className="custom-scrollbar">
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Identificación ── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Identificación
            </p>
            <button onClick={() => datosFileRef.current?.click()} style={{
              fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
              background: 'rgba(6,14,50,0.5)', color: 'rgba(178,198,245,0.7)',
              border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importar desde Excel
            </button>
            <input ref={datosFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportDatos} />
            {datosToast && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                background: datosToast.startsWith('Error') || datosToast.startsWith('No se') ? 'rgba(220,38,38,0.2)' : 'rgba(16,185,129,0.2)',
                color: datosToast.startsWith('Error') || datosToast.startsWith('No se') ? '#fca5a5' : '#6ee7b7',
              }}>{datosToast}</span>
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nombre de la flota</label>
            <input style={{ ...inputStyle, fontSize: 14, fontWeight: 700 }}
              value={carpetaActiva.nombre}
              onChange={e => {
                const updated = { ...carpetaActiva, nombre: e.target.value };
                guardarCarpeta(updated);
                onCarpetaChange(updated);
              }}
              placeholder="Nombre de la flota"
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>CIF Empresa</label>
              <input style={inputStyle} value={header.cif} onChange={e => set('cif', e.target.value)} placeholder="A12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>Tomador</label>
              <input style={inputStyle} value={header.tomador} onChange={e => set('tomador', e.target.value)} placeholder="Empresa S.L."
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>CIF Tomador</label>
              <input style={inputStyle} value={header.cifTomador ?? ''} onChange={e => set('cifTomador', e.target.value)} placeholder="B12345678"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div style={{ gridColumn: '1 / 4' }}>
              <label style={labelStyle}>Actividad</label>
              <input style={inputStyle} value={header.actividad} onChange={e => set('actividad', e.target.value)} placeholder="Transporte de mercancías"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
          </div>
        </section>

        {/* ── Corredor ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Corredor vinculado
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 14 }}>
            <div>
              <label style={labelStyle}>Corredor</label>
              <select
                value={carpetaActiva.corredor_id ?? ''}
                onChange={e => handleCorredorChange(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer', color: carpetaActiva.corredor_id ? '#FFFFFF' : 'rgba(178,198,245,0.6)' }}>
                <option value="">Sin corredor</option>
                {corredores.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.porcentajeComision}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                % Comisión flota
                {(() => {
                  const corredor = corredores.find(c => c.id === carpetaActiva.corredor_id);
                  if (corredor && carpetaActiva.porcentajeComision != null && carpetaActiva.porcentajeComision !== corredor.porcentajeComision) {
                    return <span style={{ fontSize: 8, color: '#F59E0B', fontWeight: 600 }}>diferente al corredor ({corredor.porcentajeComision}%)</span>;
                  }
                  return null;
                })()}
              </label>
              <input inputMode="decimal"
                style={inputStyle}
                value={carpetaActiva.porcentajeComision ?? ''}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) handleComisionChange(v); }}
                placeholder={(() => {
                  const c = corredores.find(x => x.id === carpetaActiva.corredor_id);
                  return c ? `${c.porcentajeComision}% (corredor)` : '0';
                })()}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
          </div>
          {carpetaActiva.corredor_id && (() => {
            const c = corredores.find(x => x.id === carpetaActiva.corredor_id);
            if (!c) return null;
            return (
              <p style={{ marginTop: 6, fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>
                {c.email && <span>{c.email}</span>}
                {c.email && c.telefono && <span> · </span>}
                {c.telefono && <span>{c.telefono}</span>}
              </p>
            );
          })()}
        </section>

        {/* ── Póliza actual ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Póliza vigente
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Póliza actual</label>
              <input style={inputStyle} value={header.polizaActual ?? ''} onChange={e => set('polizaActual', e.target.value)} placeholder="Referencia de la póliza"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>Compañía actual</label>
              <input style={inputStyle} value={header.ciaActual ?? ''} onChange={e => set('ciaActual', e.target.value)} placeholder="Nombre de la compañía"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
          </div>
        </section>

        {/* ── Vigencia ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Vigencia
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Forma de pago</label>
              <input style={inputStyle} value={header.formaPago} onChange={e => set('formaPago', e.target.value)} placeholder="Anual"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>Periodicidad</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={header.periodicidad ?? ''} onChange={e => set('periodicidad', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}>
                <option value="">Sin definir</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha inicio</label>
              <input type="date" style={inputStyle} value={header.fechaInicio ?? ''} onChange={e => set('fechaInicio', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                Fecha vencimiento
                {venceProximo && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, padding: '1px 6px', borderRadius: 4,
                    background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}>
                    Próxima renovación
                  </span>
                )}
              </label>
              <input type="date" style={{ ...inputStyle, borderColor: venceProximo ? 'rgba(234,179,8,0.4)' : 'rgba(61,112,255,0.22)' }}
                value={header.fechaVencimiento ?? ''} onChange={e => set('fechaVencimiento', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = venceProximo ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.1)')} />
            </div>
          </div>
        </section>

        {/* ── Efecto + Emisión ── */}
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Efecto</label>
              <input style={inputStyle} value={header.efecto} onChange={e => set('efecto', e.target.value)} placeholder="DD/MM/YYYY"
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de emisi&oacute;n</label>
              <input type="date" style={inputStyle} value={header.fechaEmision ?? ''} onChange={e => set('fechaEmision', e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
            </div>
          </div>
        </section>

        {/* ── Observaciones ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Observaciones
          </p>
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }}
            value={carpetaActiva.observaciones ?? ''}
            onChange={e => {
              const updated = { ...carpetaActiva, observaciones: e.target.value };
              guardarCarpeta(updated);
              onCarpetaChange(updated);
            }}
            placeholder="Notas sobre la flota, condiciones especiales, acuerdos..."
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}
          />
        </section>

        {/* ── Tarifa de la Flota ── */}
        <section>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Tarifa acordada
          </p>
          <p style={{ fontSize: 11, color: 'rgba(178,198,245,0.45)', marginBottom: 14 }}>
            Precio por tipo de vehículo y cobertura. Se aplica automáticamente en el Centro de Emisión.
          </p>

          {(carpetaActiva.tarifaFlota ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {(carpetaActiva.tarifaFlota ?? []).map((t, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 100px 32px', gap: 8, alignItems: 'center',
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(61,112,255,0.12)',
                }}>
                  <select style={{ ...inputStyle, fontSize: 11 }} value={t.tipo}
                    onChange={e => {
                      const tarifa = [...(carpetaActiva.tarifaFlota ?? [])];
                      tarifa[i] = { ...tarifa[i], tipo: e.target.value };
                      const updated = { ...carpetaActiva, tarifaFlota: tarifa };
                      guardarCarpeta(updated);
                      onCarpetaChange(updated);
                    }}>
                    <option value="">Tipo...</option>
                    {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                    <option value="Derivado de turismo">Derivado de turismo</option>
                  </select>
                  <select style={{ ...inputStyle, fontSize: 11 }} value={t.cobertura}
                    onChange={e => {
                      const tarifa = [...(carpetaActiva.tarifaFlota ?? [])];
                      tarifa[i] = { ...tarifa[i], cobertura: e.target.value };
                      const updated = { ...carpetaActiva, tarifaFlota: tarifa };
                      guardarCarpeta(updated);
                      onCarpetaChange(updated);
                    }}>
                    <option value="">Cobertura...</option>
                    {COBERTURA_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input inputMode="decimal" style={{ ...inputStyle, fontSize: 12, fontWeight: 700, fontFamily: 'monospace', textAlign: 'right' }}
                    value={t.precio || ''} placeholder="0,00"
                    onChange={e => {
                      const val = e.target.value.replace(',', '.');
                      const tarifa = [...(carpetaActiva.tarifaFlota ?? [])];
                      tarifa[i] = { ...tarifa[i], precio: parseFloat(val) || 0 };
                      const updated = { ...carpetaActiva, tarifaFlota: tarifa };
                      guardarCarpeta(updated);
                      onCarpetaChange(updated);
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')} />
                  <button onClick={() => {
                    const tarifa = (carpetaActiva.tarifaFlota ?? []).filter((_, j) => j !== i);
                    const updated = { ...carpetaActiva, tarifaFlota: tarifa };
                    guardarCarpeta(updated);
                    onCarpetaChange(updated);
                  }} style={{
                    fontSize: 13, color: 'rgba(239,68,68,0.4)', background: 'none',
                    border: 'none', cursor: 'pointer', padding: 4,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.4)')}>
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => {
              const tarifa = [...(carpetaActiva.tarifaFlota ?? []), { tipo: '', cobertura: '', precio: 0 }];
              const updated = { ...carpetaActiva, tarifaFlota: tarifa };
              guardarCarpeta(updated);
              onCarpetaChange(updated);
            }} style={{
              fontSize: 11, fontWeight: 700, padding: '8px 16px', borderRadius: 8,
              background: 'rgba(18,64,204,0.15)', color: '#3366FF',
              border: '1px solid rgba(18,64,204,0.3)', cursor: 'pointer',
            }}>
              + Añadir tarifa
            </button>
            <button onClick={() => tarifaFileRef.current?.click()} style={{
              fontSize: 11, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
              background: 'rgba(6,14,50,0.5)', color: 'rgba(178,198,245,0.8)',
              border: '1px solid rgba(61,112,255,0.22)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Importar tarifa desde Excel
            </button>
            <input ref={tarifaFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImportTarifa} />
            {tarifaToast && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                background: tarifaToast.startsWith('Error') || tarifaToast.startsWith('No se') ? 'rgba(220,38,38,0.2)' : 'rgba(16,185,129,0.2)',
                color: tarifaToast.startsWith('Error') || tarifaToast.startsWith('No se') ? '#fca5a5' : '#6ee7b7',
              }}>{tarifaToast}</span>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
