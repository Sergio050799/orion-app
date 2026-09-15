"use client";

import React, { useState, useCallback, useMemo, useRef } from 'react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface FilaCalibracion {
  id: number;
  matricula: string;
  objetivo: string;   // precio que queremos
  real: string;        // precio que devolvió el sistema
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(12, 28, 82, 0.75)',
  border: '1px solid rgba(61, 112, 255, 0.22)',
  borderRadius: 22,
  boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset',
};

const cellInput: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, fontFamily: 'monospace',
  padding: '8px 12px', borderRadius: 8, width: '100%',
  background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(51,102,255,0.15)',
  color: '#FFFFFF', outline: 'none', textAlign: 'right',
  transition: 'border-color 0.15s',
};

const matInput: React.CSSProperties = {
  ...cellInput, textAlign: 'left', fontWeight: 600,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parsea número con formato español (coma decimal) o punto */
function parseNum(s: string): number {
  if (!s.trim()) return 0;
  // Si tiene coma y no punto → coma es decimal
  const cleaned = s.replace(/\s/g, '');
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  // Si tiene punto y coma → punto es miles, coma decimal
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

function fmt(n: number): string {
  if (n === 0) return '';
  return n.toFixed(2).replace('.', ',');
}

function fmtDiff(n: number): string {
  const prefix = n >= 0 ? '+' : '';
  return prefix + n.toFixed(2).replace('.', ',');
}

// ─── Componente ──────────────────────────────────────────────────────────────

interface Props {
  initialData?: { matricula: string; precio_objetivo: string }[];
}

export default function CalibradorPrecios({ initialData }: Props) {
  const [filas, setFilas] = useState<FilaCalibracion[]>(() => {
    if (initialData && initialData.length > 0) {
      return initialData.map((d, i) => ({
        id: i + 1,
        matricula: d.matricula,
        objetivo: d.precio_objetivo,
        real: '',
      }));
    }
    return [{ id: 1, matricula: '', objetivo: '', real: '' }];
  });
  const [nextId, setNextId] = useState(() =>
    initialData && initialData.length > 0 ? initialData.length + 1 : 2
  );
  const [iteracion, setIteracion] = useState(1);

  // ── CRUD filas ──

  const addFila = useCallback(() => {
    setFilas(prev => [...prev, { id: nextId, matricula: '', objetivo: '', real: '' }]);
    setNextId(n => n + 1);
  }, [nextId]);

  const addMultiple = useCallback((count: number) => {
    const nuevas: FilaCalibracion[] = [];
    let id = nextId;
    for (let i = 0; i < count; i++) {
      nuevas.push({ id: id++, matricula: '', objetivo: '', real: '' });
    }
    setFilas(prev => [...prev, ...nuevas]);
    setNextId(id);
  }, [nextId]);

  const removeFila = useCallback((id: number) => {
    setFilas(prev => prev.length <= 1 ? prev : prev.filter(f => f.id !== id));
  }, []);

  const updateFila = useCallback((id: number, field: keyof FilaCalibracion, value: string) => {
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  }, []);

  const clearAll = useCallback(() => {
    setFilas([{ id: nextId, matricula: '', objetivo: '', real: '' }]);
    setNextId(n => n + 1);
    setIteracion(1);
  }, [nextId]);

  // ── Cálculos ──

  const computed = useMemo(() => {
    return filas.map(f => {
      const obj = parseNum(f.objetivo);
      const real = parseNum(f.real);

      if (obj <= 0 || real <= 0) {
        return { calibrado: 0, diff: 0, diffPct: 0, hasData: false };
      }

      // Fórmula: calibrado = objetivo × (objetivo / real)
      const calibrado = Math.round((obj * (obj / real)) * 100) / 100;
      const diff = real - obj;
      const diffPct = ((real - obj) / obj) * 100;

      return { calibrado, diff, diffPct, hasData: true };
    });
  }, [filas]);

  const totals = useMemo(() => {
    let totalObj = 0;
    let totalReal = 0;
    let totalCalibrado = 0;
    let filasConDatos = 0;

    filas.forEach((f, i) => {
      const obj = parseNum(f.objetivo);
      const real = parseNum(f.real);
      const c = computed[i];

      if (obj > 0) totalObj += obj;
      if (real > 0) totalReal += real;
      if (c.hasData) {
        totalCalibrado += c.calibrado;
        filasConDatos++;
      }
    });

    const diffTotal = totalReal - totalObj;
    const diffCalibradoEstimado = totalCalibrado > 0 ? totalObj - totalCalibrado : 0;

    return { totalObj, totalReal, totalCalibrado, diffTotal, diffCalibradoEstimado, filasConDatos };
  }, [filas, computed]);

  // ── Aplicar calibrado como nuevo objetivo (iterar) ──

  const aplicarCalibracion = useCallback(() => {
    setFilas(prev => prev.map((f, i) => {
      const c = computed[i];
      if (!c.hasData) return f;
      return { ...f, objetivo: fmt(c.calibrado), real: '' };
    }));
    setIteracion(n => n + 1);
  }, [computed]);

  // ── Pegar desde Excel ──

  const handlePaste = useCallback((e: React.ClipboardEvent, startId: number, field: 'matricula' | 'objetivo' | 'real') => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

    if (lines.length <= 1) return; // pegado normal de 1 valor

    e.preventDefault();

    setFilas(prev => {
      const startIdx = prev.findIndex(f => f.id === startId);
      if (startIdx < 0) return prev;

      const updated = [...prev];
      let id = nextId;

      for (let i = 0; i < lines.length; i++) {
        const idx = startIdx + i;
        if (idx < updated.length) {
          updated[idx] = { ...updated[idx], [field]: lines[i] };
        } else {
          updated.push({ id: id++, matricula: '', objetivo: '', real: '', [field]: lines[i] });
        }
      }

      setNextId(id);
      return updated;
    });
  }, [nextId]);

  // ── Diff color ──

  function diffColor(diff: number): string {
    if (diff === 0) return '#10b981';
    if (Math.abs(diff) <= 0.01) return '#10b981';
    if (Math.abs(diff) <= 0.05) return '#f59e0b';
    return '#ef4444';
  }

  function totalDiffColor(diff: number): string {
    if (diff >= -0.02 && diff <= 0.01) return '#10b981'; // dentro de rango aceptable
    if (Math.abs(diff) <= 0.05) return '#f59e0b';
    return '#ef4444';
  }

  // ── Render ──

  const hasAnyReal = filas.some(f => parseNum(f.real) > 0);

  // ── Copiar columna ──
  const [copyToast, setCopyToast] = useState('');
  const copyTimerRef = useRef<NodeJS.Timeout>(null);

  const copyColumn = useCallback((label: string, getter: (f: FilaCalibracion, i: number) => string) => {
    const values = filas.map((f, i) => getter(f, i));
    navigator.clipboard.writeText(values.join('\n'));
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopyToast(`${label} copiado (${filas.length})`);
    copyTimerRef.current = setTimeout(() => setCopyToast(''), 1800);
  }, [filas]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderRadius: 14,
        background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.16)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
            {filas.length} vehiculo{filas.length !== 1 ? 's' : ''}
          </span>
          {iteracion > 1 && (
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(61,112,255,0.16)', color: '#3366FF',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Iteracion {iteracion}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addFila} style={{
            fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8,
            background: 'rgba(18,64,204,0.15)', color: '#3366FF',
            border: '1px solid rgba(18,64,204,0.3)', cursor: 'pointer',
          }}>
            + Fila
          </button>
          <button onClick={() => addMultiple(5)} style={{
            fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8,
            background: 'rgba(18,64,204,0.08)', color: '#3366FF',
            border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer',
          }}>
            + 5 Filas
          </button>
          <button onClick={clearAll} style={{
            fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer',
          }}>
            Limpiar
          </button>
        </div>
      </div>

      {/* Instrucciones rápidas */}
      <div style={{
        padding: '10px 20px', borderRadius: 10,
        background: 'rgba(51,102,255,0.05)', border: '1px solid rgba(61,112,255,0.12)',
        fontSize: 11, color: 'rgba(178,198,245,0.5)', lineHeight: 1.5,
      }}>
        <strong style={{ color: 'rgba(178,198,245,0.7)' }}>Instrucciones:</strong>{' '}
        Escribe el precio que quieres en <strong style={{ color: '#BDD4FF' }}>OBJETIVO</strong>,
        emite en el sistema, y pega el resultado en <strong style={{ color: '#BDD4FF' }}>REAL</strong>.
        Orion calcula el precio que debes ingresar. Puedes pegar columnas enteras desde Excel.
      </div>

      {/* Tabla principal */}
      <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={{ ...thStyle, ...thCopyable, textAlign: 'left', width: 130 }}
                onClick={() => copyColumn('Matrícula', f => f.matricula)}
                title="Click para copiar columna">
                Matricula <CopyIcon />
              </th>
              <th style={{ ...thStyle, ...thCopyable, width: 140 }}
                onClick={() => copyColumn('Objetivo', f => f.objetivo)}
                title="Click para copiar columna">
                Precio Objetivo <CopyIcon />
              </th>
              <th style={{ ...thStyle, ...thCopyable, width: 140 }}
                onClick={() => copyColumn('Real', f => f.real)}
                title="Click para copiar columna">
                Precio Real <CopyIcon />
              </th>
              <th style={{ ...thStyle, ...thCopyable, width: 140 }}
                onClick={() => copyColumn('Calibrado', (_f, i) => computed[i]?.hasData ? fmt(computed[i].calibrado) : '')}
                title="Click para copiar columna">
                Precio Calibrado <CopyIcon />
              </th>
              <th style={{ ...thStyle, width: 90 }}>Diferencia</th>
              <th style={{ ...thStyle, width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const c = computed[i];
              return (
                <tr key={f.id}
                  style={{ borderBottom: '1px solid rgba(61,112,255,0.10)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(51,102,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* # */}
                  <td style={{ ...tdStyle, textAlign: 'center', width: 40 }}>
                    <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.4)', fontWeight: 700 }}>{i + 1}</span>
                  </td>

                  {/* Matricula */}
                  <td style={tdStyle}>
                    <input
                      style={matInput}
                      value={f.matricula}
                      placeholder="0000XXX"
                      onChange={e => updateFila(f.id, 'matricula', e.target.value)}
                      onPaste={e => handlePaste(e, f.id, 'matricula')}
                    />
                  </td>

                  {/* Precio Objetivo */}
                  <td style={tdStyle}>
                    <input
                      style={{ ...cellInput, borderColor: f.objetivo ? 'rgba(51,102,255,0.3)' : 'rgba(51,102,255,0.15)' }}
                      value={f.objetivo}
                      placeholder="0,00"
                      onChange={e => updateFila(f.id, 'objetivo', e.target.value)}
                      onPaste={e => handlePaste(e, f.id, 'objetivo')}
                      onFocus={e => (e.currentTarget.style.borderColor = '#3366FF')}
                      onBlur={e => (e.currentTarget.style.borderColor = f.objetivo ? 'rgba(51,102,255,0.3)' : 'rgba(51,102,255,0.15)')}
                    />
                  </td>

                  {/* Precio Real */}
                  <td style={tdStyle}>
                    <input
                      style={{ ...cellInput, borderColor: f.real ? 'rgba(245,158,11,0.3)' : 'rgba(51,102,255,0.15)' }}
                      value={f.real}
                      placeholder="0,00"
                      onChange={e => updateFila(f.id, 'real', e.target.value)}
                      onPaste={e => handlePaste(e, f.id, 'real')}
                      onFocus={e => (e.currentTarget.style.borderColor = '#f59e0b')}
                      onBlur={e => (e.currentTarget.style.borderColor = f.real ? 'rgba(245,158,11,0.3)' : 'rgba(51,102,255,0.15)')}
                    />
                  </td>

                  {/* Precio Calibrado */}
                  <td style={tdStyle}>
                    <div style={{
                      fontSize: 14, fontWeight: 900, fontFamily: 'monospace',
                      textAlign: 'right', padding: '8px 12px',
                      color: c.hasData ? '#10b981' : 'rgba(178,198,245,0.28)',
                      background: c.hasData ? 'rgba(16,185,129,0.06)' : 'transparent',
                      borderRadius: 8,
                    }}>
                      {c.hasData ? fmt(c.calibrado) : '--'}
                    </div>
                  </td>

                  {/* Diferencia */}
                  <td style={tdStyle}>
                    {c.hasData && (
                      <div style={{
                        fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                        textAlign: 'center', color: diffColor(c.diff),
                      }}>
                        {fmtDiff(c.diff)}
                      </div>
                    )}
                  </td>

                  {/* Eliminar */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {filas.length > 1 && (
                      <button onClick={() => removeFila(f.id)} style={{
                        fontSize: 11, color: 'rgba(239,68,68,0.3)', background: 'none',
                        border: 'none', cursor: 'pointer', padding: 4,
                      }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.3)')}>
                        x
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Totales */}
          <tfoot>
            <tr style={{ borderTop: '2px solid rgba(51,102,255,0.15)' }}>
              <td style={{ ...tdStyle, textAlign: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase' }}>Total</span>
              </td>
              <td style={tdStyle}></td>

              {/* Total Objetivo */}
              <td style={tdStyle}>
                <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', textAlign: 'right', padding: '8px 12px', color: '#BDD4FF' }}>
                  {totals.totalObj > 0 ? fmt(totals.totalObj) : ''}
                </div>
              </td>

              {/* Total Real */}
              <td style={tdStyle}>
                <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', textAlign: 'right', padding: '8px 12px', color: totals.totalReal > 0 ? '#f59e0b' : 'rgba(178,198,245,0.28)' }}>
                  {totals.totalReal > 0 ? fmt(totals.totalReal) : ''}
                </div>
              </td>

              {/* Total Calibrado */}
              <td style={tdStyle}>
                <div style={{ fontSize: 14, fontWeight: 900, fontFamily: 'monospace', textAlign: 'right', padding: '8px 12px', color: totals.totalCalibrado > 0 ? '#10b981' : 'rgba(178,198,245,0.28)' }}>
                  {totals.totalCalibrado > 0 ? fmt(totals.totalCalibrado) : ''}
                </div>
              </td>

              {/* Diferencia Total */}
              <td style={tdStyle}>
                {totals.totalReal > 0 && totals.totalObj > 0 && (
                  <div style={{
                    fontSize: 11, fontWeight: 900, fontFamily: 'monospace',
                    textAlign: 'center', color: totalDiffColor(totals.diffTotal),
                  }}>
                    {fmtDiff(totals.diffTotal)}
                  </div>
                )}
              </td>

              <td style={tdStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Resumen y acciones */}
      {hasAnyReal && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 22px', borderRadius: 16,
          background: 'rgba(12, 28, 82, 0.6)',
          border: '1px solid rgba(61,112,255,0.22)',
        }}>
          {/* Resumen */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Diferencia sistema
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: totalDiffColor(totals.diffTotal) }}>
                {fmtDiff(totals.diffTotal)} EUR
              </div>
            </div>
            <div style={{ width: 1, height: 36, background: 'rgba(61,112,255,0.16)' }} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Con calibracion
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: '#10b981' }}>
                ~{fmtDiff(totals.totalObj - totals.totalCalibrado)} EUR
              </div>
              <div style={{ fontSize: 9, color: 'rgba(178,198,245,0.4)' }}>estimado tras aplicar</div>
            </div>
            <div style={{ width: 1, height: 36, background: 'rgba(61,112,255,0.16)' }} />
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Filas calculadas
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color: '#BDD4FF' }}>
                {totals.filasConDatos} / {filas.length}
              </div>
            </div>
          </div>

          {/* Botón iterar */}
          <button onClick={aplicarCalibracion} style={{
            fontSize: 13, fontWeight: 800, padding: '12px 24px', borderRadius: 12,
            background: 'linear-gradient(135deg, #1240CC, #3366FF)',
            color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 8px 24px -8px rgba(18,64,204,0.4)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Recalcular
          </button>
        </div>
      )}

      {/* Tip */}
      {!hasAnyReal && totals.totalObj > 0 && (
        <div style={{
          padding: '14px 20px', borderRadius: 12, textAlign: 'center',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
          fontSize: 12, color: '#f59e0b',
        }}>
          Ahora emite en el sistema con los precios objetivo y pega los precios reales que devuelva.
        </div>
      )}
      {/* Toast de copiado */}
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
  );
}

// ─── Mini copy icon ──────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ display: 'inline-block', marginLeft: 4, verticalAlign: 'middle', opacity: 0.5 }}>
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

// ─── Estilos de tabla ────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '12px 10px', fontSize: 10, fontWeight: 800,
  color: 'rgba(70,120,255,0.6)', textTransform: 'uppercase',
  letterSpacing: '0.1em', textAlign: 'center',
  borderBottom: '1px solid rgba(51,102,255,0.1)',
  background: 'rgba(6,14,50,0.4)',
};

const thCopyable: React.CSSProperties = {
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'color 0.15s',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 6px',
};
