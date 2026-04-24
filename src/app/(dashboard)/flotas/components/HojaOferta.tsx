"use client";

import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import type { Column, RenderCellProps, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { COBERTURA_OPTS, LUNAS_OPTS, AMBITO_OPTS } from '@/core/flotas';
import { calcularPrima, type CalcPrimaParams, type TipoVehiculo, type Producto } from '@/core/flotas/primas';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OfertaRow {
  _id: number;
  matricula: string;
  marca_modelo: string;
  tipo_vehiculo: string;
  uso: string;
  cv: string;
  coberturas: string;
  lunas: string;
  ambito: string;
  frq: string;
  animales: string;      // 'true' | ''
  isotermo: string;      // 'true' | ''
  perdida_total: string; // 'true' | ''
  oferta_prima_mmt: string;
  _primaOverride: string; // 'true' si usuario escribió a mano
}

export interface HojaOfertaHandle {
  getData: () => Record<string, string>[];
  setData: (data: Record<string, string>[]) => void;
}

interface Props {
  trabajoRows: Record<string, string>[];
  onDataChange?: (data: Record<string, string>[]) => void;
}

// ─── Mapeos para calcularPrima ──────────────────────────────────────────────

const TIPO_MAP: Record<string, TipoVehiculo> = {
  'turismo': 'turismo',
  'furgoneta': 'furgoneta',
  'cabeza tractora': 'cabeza_tractora',
  'camión rígido': 'camion_rigido',
  'camion rigido': 'camion_rigido',
  'semirremolque': 'semirremolque',
  'industrial matriculado': 'industrial_matriculado',
  'industrial no matriculado': 'industrial_no_matriculado',
};

const PRODUCTO_MAP: Record<string, Producto> = {
  'terceros': 'terceros',
  'terceros ampliado': 'terceros_ampliado',
  'todo riesgo con franquicia': 'todo_riesgo',
};

const USO_MAP: Record<string, CalcPrimaParams['uso']> = {
  'particular': 'particular',
  'servicio público': 'servicio_publico',
  'servicio publico': 'servicio_publico',
  'transportes propios': 'transportes_propios',
};

const AMBITO_MAP: Record<string, CalcPrimaParams['ambito']> = {
  'nacional': 'nacional',
  'internacional': 'internacional',
};

// Tipos que aplican a cada checkbox
const ANIMALES_TIPOS = new Set(['turismo', 'furgoneta']);
const ISOTERMO_TIPOS = new Set(['camion_rigido', 'semirremolque']);
const PERDIDA_TOTAL_TIPOS = new Set(['cabeza_tractora', 'camion_rigido', 'semirremolque']);

function getTipoKey(tv: string): TipoVehiculo | null {
  return TIPO_MAP[tv.toLowerCase()] ?? null;
}

// ─── rowToPrimaParams ───────────────────────────────────────────────────────

function rowToPrimaParams(row: OfertaRow): CalcPrimaParams | null {
  const tipoVehiculo = getTipoKey(row.tipo_vehiculo);
  if (!tipoVehiculo) return null;

  // Determinar producto
  const cobLower = row.coberturas.toLowerCase();
  let producto = PRODUCTO_MAP[cobLower];
  if (!producto) return null;

  // Terceros + Lunas Sí → terceros_con_luna
  if (producto === 'terceros' && row.lunas.toLowerCase() === 'sí') {
    producto = 'terceros_con_luna';
  }

  const uso = USO_MAP[row.uso.toLowerCase()];
  const ambito = AMBITO_MAP[row.ambito.toLowerCase()];
  const franquicia = producto === 'todo_riesgo' ? (parseFloat(row.frq) || undefined) : undefined;

  return {
    tipoVehiculo,
    producto,
    uso,
    ambito,
    franquicia,
    animales: row.animales === 'true',
    isotermo: row.isotermo === 'true',
    perdidaTotal: row.perdida_total === 'true',
  };
}

// ─── Calcula prima para una fila ────────────────────────────────────────────

function calcPrimaForRow(row: OfertaRow): string {
  const params = rowToPrimaParams(row);
  if (!params) return '';
  const result = calcularPrima(params);
  if (result === null) return '';
  return String(result);
}

// ─── DropdownEditor ────────────────────────────────────────────────────────────

function DropdownEditor({ options, row, column, onRowChange, onClose }: RenderEditCellProps<OfertaRow> & { options: string[] }) {
  return (
    <select
      autoFocus
      value={String((row as unknown as Record<string, string>)[column.key] ?? '')}
      onChange={e => {
        onRowChange({ ...row, [column.key]: e.target.value });
        onClose(true);
      }}
      style={{ width: '100%', height: '100%', border: 'none', outline: 'none', fontSize: 12, padding: '0 8px', background: '#fff', cursor: 'pointer' }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── CheckboxCell ───────────────────────────────────────────────────────────

function CheckboxCell({ row, columnKey, enabled, onToggle }: {
  row: OfertaRow; columnKey: string; enabled: boolean;
  onToggle: (row: OfertaRow, key: string) => void;
}) {
  const checked = (row as unknown as Record<string, string>)[columnKey] === 'true';
  if (!enabled) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 10 }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      onClick={() => onToggle(row, columnKey)}>
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        border: checked ? '2px solid #6366f1' : '2px solid #d1d5db',
        background: checked ? '#6366f1' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.1s',
      }}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trabajoToOferta(rows: Record<string, string>[]): OfertaRow[] {
  return rows
    .filter(r => r['matricula']?.trim())
    .map((r, i) => ({
      _id: i,
      matricula:       r['matricula']             ?? '',
      marca_modelo:    `${r['marca'] ?? ''} ${r['modelo'] ?? ''}`.trim(),
      tipo_vehiculo:   r['tipo_vehiculo']          ?? '',
      uso:             r['uso']                    ?? '',
      cv:              r['cv']                     ?? '',
      coberturas:      r['coberturas_solicitadas'] ?? '',
      lunas:           r['lunas']                  ?? '',
      ambito:          r['ambito']                 ?? '',
      frq:             r['frq']                    ?? '',
      animales:        '',
      isotermo:        '',
      perdida_total:   '',
      oferta_prima_mmt: '',
      _primaOverride:  '',
    }));
}

function rowToRecord(row: OfertaRow): Record<string, string> {
  const { _id, _primaOverride, ...rest } = row;
  void _id;
  void _primaOverride;
  return rest;
}

// ─── HojaOferta ───────────────────────────────────────────────────────────────

const HojaOferta = forwardRef<HojaOfertaHandle, Props>(function HojaOferta(
  { trabajoRows, onDataChange },
  ref,
) {
  const [rows, setRows] = useState<OfertaRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  // Seed from trabajoRows on first non-empty load + resync nuevos vehículos
  useEffect(() => {
    if (trabajoRows.length === 0) return;

    if (!seeded) {
      setRows(trabajoToOferta(trabajoRows));
      setSeeded(true);
      return;
    }

    // Resync: añadir vehículos nuevos que no estén en rows
    const existingMats = new Set(rows.map(r => r.matricula));
    const newFromTrabajo = trabajoToOferta(trabajoRows)
      .filter(r => r.matricula && !existingMats.has(r.matricula));

    if (newFromTrabajo.length > 0) {
      setRows(prev => [
        ...prev,
        ...newFromTrabajo.map((r, i) => ({ ...r, _id: prev.length + i })),
      ]);
    }
  }, [trabajoRows, seeded]);

  // Notify parent of changes
  useEffect(() => {
    if (!seeded) return;
    const timer = setTimeout(() => {
      onDataChangeRef.current?.(rows.map(rowToRecord));
    }, 300);
    return () => clearTimeout(timer);
  }, [rows, seeded]);

  useImperativeHandle(ref, () => ({
    getData: () => rows.map(rowToRecord),
    setData: (data) => {
      const ofertaRows: OfertaRow[] = data.map((r, i) => ({
        _id: i,
        matricula:        r['matricula']        ?? '',
        marca_modelo:     r['marca_modelo']     ?? '',
        tipo_vehiculo:    r['tipo_vehiculo']     ?? '',
        uso:              r['uso']              ?? '',
        cv:               r['cv']               ?? '',
        coberturas:       r['coberturas']        ?? '',
        lunas:            r['lunas']             ?? '',
        ambito:           r['ambito']            ?? '',
        frq:              r['frq']               ?? '',
        animales:         r['animales']          ?? '',
        isotermo:         r['isotermo']          ?? '',
        perdida_total:    r['perdida_total']     ?? '',
        oferta_prima_mmt: r['oferta_prima_mmt']  ?? '',
        _primaOverride:   r['_primaOverride']    ?? '',
      }));
      setRows(ofertaRows);
      setSeeded(true);
    },
  }));

  // Recalculate prima when relevant fields change (via handleRowsChange)
  const handleRowsChange = useCallback((newRows: OfertaRow[]) => {
    const recalculated = newRows.map((row, i) => {
      const prev = rows[i];
      if (!prev) return row;

      // Detect if user manually edited oferta_prima_mmt
      const primaChanged = row.oferta_prima_mmt !== prev.oferta_prima_mmt;
      const primaFieldsChanged =
        row.coberturas !== prev.coberturas ||
        row.lunas !== prev.lunas ||
        row.ambito !== prev.ambito ||
        row.frq !== prev.frq ||
        row.animales !== prev.animales ||
        row.isotermo !== prev.isotermo ||
        row.perdida_total !== prev.perdida_total;

      if (primaChanged && !primaFieldsChanged) {
        // User typed in the prima field manually
        if (row.oferta_prima_mmt.trim() === '') {
          // User cleared → back to auto
          const auto = calcPrimaForRow(row);
          return { ...row, oferta_prima_mmt: auto, _primaOverride: '' };
        }
        return { ...row, _primaOverride: 'true' };
      }

      if (primaFieldsChanged && row._primaOverride !== 'true') {
        // Auto-recalc
        const auto = calcPrimaForRow(row);
        return { ...row, oferta_prima_mmt: auto };
      }

      return row;
    });
    setRows(recalculated);
  }, [rows]);

  // Toggle checkbox handler
  const handleCheckboxToggle = useCallback((row: OfertaRow, key: string) => {
    const current = (row as unknown as Record<string, string>)[key] === 'true';
    const updated = { ...row, [key]: current ? '' : 'true' };
    // Recalc prima if not overridden
    if (updated._primaOverride !== 'true') {
      updated.oferta_prima_mmt = calcPrimaForRow(updated);
    }
    setRows(prev => prev.map(r => r._id === row._id ? updated : r));
  }, []);

  // Prima total
  const primaTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const v = parseFloat(r.oferta_prima_mmt);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [rows]);

  const columns = useMemo((): Column<OfertaRow>[] => [
    {
      key: '_idx', name: '#', width: 44, frozen: true, resizable: false,
      renderCell: ({ rowIdx }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 700 }}>
          {rowIdx + 1}
        </div>
      ),
    },
    {
      key: 'matricula', name: 'MATRÍCULA', width: 100, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'marca_modelo', name: 'MARCA / MODELO', width: 160, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'tipo_vehiculo', name: 'TIPO VEHÍCULO', width: 155, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'cv', name: 'CV', width: 55, editable: false,
      renderCell: readonlyCell,
    },
    {
      key: 'coberturas', name: 'COBERTURAS', width: 200,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={COBERTURA_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.coberturas ? '#111827' : '#9ca3af', fontStyle: row.coberturas ? 'normal' : 'italic' }}>
          {row.coberturas || '—'}
        </div>
      ),
    },
    {
      key: 'lunas', name: 'LUNAS', width: 70,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={LUNAS_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.lunas ? '#111827' : '#9ca3af' }}>
          {row.lunas || '—'}
        </div>
      ),
    },
    {
      key: 'ambito', name: 'ÁMBITO', width: 110,
      editable: true,
      renderEditCell: (props) => <DropdownEditor {...props} options={AMBITO_OPTS} />,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: row.ambito ? '#111827' : '#9ca3af' }}>
          {row.ambito || '—'}
        </div>
      ),
    },
    {
      key: 'frq', name: 'FRQ', width: 70,
      editable: true,
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const disabled = row.coberturas !== 'Todo Riesgo con Franquicia';
        return (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: disabled ? '#9ca3af' : '#111827', fontStyle: disabled ? 'italic' : 'normal' }}>
            {row.frq || ''}
          </div>
        );
      },
    },
    {
      key: 'animales', name: 'ANIM', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="animales" enabled={!!tipo && ANIMALES_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'isotermo', name: 'ISOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="isotermo" enabled={!!tipo && ISOTERMO_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'perdida_total', name: 'P.TOT', width: 52,
      editable: false,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const tipo = getTipoKey(row.tipo_vehiculo);
        return <CheckboxCell row={row} columnKey="perdida_total" enabled={!!tipo && PERDIDA_TOTAL_TIPOS.has(tipo)} onToggle={handleCheckboxToggle} />;
      },
    },
    {
      key: 'oferta_prima_mmt', name: 'PRIMA MMT', width: 130,
      editable: true,
      renderEditCell: renderTextEditor,
      renderCell: ({ row }: RenderCellProps<OfertaRow>) => {
        const isOverride = row._primaOverride === 'true';
        const hasValue = !!row.oferta_prima_mmt;
        return (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12,
            fontWeight: hasValue ? 700 : 400,
            color: hasValue ? '#111827' : '#9ca3af',
            fontFamily: hasValue ? 'monospace' : 'inherit',
            borderLeft: isOverride ? '3px solid #f59e0b' : 'none',
            background: isOverride ? 'rgba(245,158,11,0.05)' : undefined,
          }}
            title={isOverride ? 'Override manual — borra para volver al cálculo automático' : undefined}>
            {row.oferta_prima_mmt ? `${row.oferta_prima_mmt} €` : '—'}
          </div>
        );
      },
    },
  ], [handleCheckboxToggle]);

  const filledRows = rows.filter(r => r.matricula.trim()).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {filledRows} vehículos · Coberturas y precios de oferta
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {primaTotal > 0 && (
            <span style={{ fontSize: 12, fontWeight: 900, color: '#111827', fontFamily: 'monospace', background: '#e0e7ff', padding: '3px 10px', borderRadius: 6, border: '1px solid #c7d2fe' }}>
              TOTAL FLOTA: {primaTotal.toLocaleString('es-ES')} €
            </span>
          )}
          {rows.length === 0 && trabajoRows.length === 0 && (
            <span style={{ fontSize: 10, color: '#9ca3af' }}>Completa TRABAJO para generar la oferta.</span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0">
        <DataGrid
          columns={columns}
          rows={rows}
          onRowsChange={handleRowsChange}
          rowKeyGetter={(row: OfertaRow) => row._id}
          style={{ height: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12 }}
          className="rdg-light"
          defaultColumnOptions={{ resizable: true, sortable: false }}
        />
      </div>
    </div>
  );
});

function readonlyCell({ row, column }: RenderCellProps<OfertaRow>) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: '#374151', background: '#f9fafb' }}>
      {String((row as unknown as Record<string, string>)[column.key] ?? '')}
    </div>
  );
}

export default HojaOferta;
