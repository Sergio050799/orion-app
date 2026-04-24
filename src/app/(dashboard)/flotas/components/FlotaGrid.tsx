"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import type { Column, FillEvent, CellCopyArgs, CellPasteArgs, CellMouseArgs, RenderCellProps, RowsChangeData } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import type { ColDef, FlotaGridHandle } from './types';
import { TIPO_VEHICULO_OPTS, USO_OPTS, AMBITO_OPTS, COBERTURA_OPTS, ASISTENCIA_OPTS, LUNAS_OPTS } from '@/core/flotas';

const INITIAL_ROWS = 100;

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface GridRow {
  _id: number;
  [key: string]: string | number;
}

// ─── Helper: fila vacía ────────────────────────────────────────────────────────

function emptyRow(id: number, colDefs: ColDef[]): GridRow {
  const r: GridRow = { _id: id };
  for (const col of colDefs) r[col.id] = '';
  return r;
}

function rowToRecord(row: GridRow): Record<string, string> {
  const { _id, ...rest } = row;
  void _id;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? '')]));
}

// ─── Auto-fill USO ────────────────────────────────────────────────────────────

const USO_DEFAULT: Record<string, string> = {
  'Turismo': 'Particular',
  'Furgoneta': 'Transportes propios',
  'Cabeza tractora': 'Transportes',
  'Camión rígido': 'Transportes',
  'Semirremolque': 'Transportes',
  'Industrial matriculado': 'Industrial',
  'Industrial no matriculado': 'Industrial',
};

// Opciones disponibles por columna para el bulk-assign toolbar
const BULK_OPTS: Record<string, string[]> = {
  tipo_vehiculo:          TIPO_VEHICULO_OPTS,
  uso:                    USO_OPTS,
  ambito:                 AMBITO_OPTS,
  coberturas_solicitadas: COBERTURA_OPTS,
  asistencia:             ASISTENCIA_OPTS,
  lunas:                  LUNAS_OPTS,
};

// ─── FlotaGrid ────────────────────────────────────────────────────────────────

interface FlotaGridProps {
  initialColDefs: ColDef[];
  initialData?: Record<string, string>[];
  onDataChange?: (data: Record<string, string>[]) => void;
}

const FlotaGrid = forwardRef<FlotaGridHandle, FlotaGridProps>(function FlotaGrid(
  { initialColDefs, initialData, onDataChange },
  ref,
) {
  const [colDefs] = useState<ColDef[]>(initialColDefs);
  const [rows, setRows] = useState<GridRow[]>(() => {
    if (initialData && initialData.length > 0) {
      return initialData.map((r, i) => ({ ...emptyRow(i, initialColDefs), ...r }));
    }
    return Array.from({ length: INITIAL_ROWS }, (_, i) => emptyRow(i, initialColDefs));
  });
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
  const [lastColKey, setLastColKey] = useState<string | null>(null);
  const [focusedRowIdx, setFocusedRowIdx] = useState<number>(0);
  const [selRange, setSelRange] = useState<{ r0: number; r1: number; c0: number; c1: number } | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [confirmDelRow, setConfirmDelRow] = useState<number | null>(null);

  // ─── Refs para event handlers estables ────────────────────────────────────

  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const colDefsRef = useRef(colDefs);
  colDefsRef.current = colDefs;
  const lastColKeyRef = useRef(lastColKey);
  lastColKeyRef.current = lastColKey;
  const focusedRowIdxRef = useRef(focusedRowIdx);
  focusedRowIdxRef.current = focusedRowIdx;
  const selRangeRef = useRef(selRange);
  selRangeRef.current = selRange;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // ─── Debounced onDataChange ─────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      const colDefs = colDefsRef.current;
      onDataChangeRef.current?.(rows.map(row => {
        const rec = rowToRecord(row);
        for (const col of colDefs) {
          if (col.isComputed && col.computeFn) rec[col.id] = col.computeFn(rec);
        }
        return rec;
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [rows]);

  // ─── Paste TSV multi-celda (Excel → Orion) ─────────────────────────────────

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const lastColKey   = lastColKeyRef.current;
      const colDefs      = colDefsRef.current;
      const focusedRowIdx = focusedRowIdxRef.current;
      const selRange     = selRangeRef.current;

      if (!lastColKey) return;

      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;

      const lines = text.split(/\r?\n/).filter(l => l.length > 0);

      // Valor único con rango seleccionado → rellenar todo el rango
      if (selRange && lines.length === 1 && !lines[0].includes('\t')) {
        const { r0, r1, c0, c1 } = selRange;
        if (r0 !== r1 || c0 !== c1) {
          e.preventDefault();
          const rawVal = lines[0].trim();
          setRows(prev => {
            const next = prev.map(r => ({ ...r }));
            for (let ri = r0; ri <= r1; ri++) {
              for (let ci = c0; ci <= c1; ci++) {
                const col = colDefs[ci];
                if (!col || col.isComputed) continue;
                let val = rawVal;
                if (col.normalizeFn && val) val = col.normalizeFn(val).value;
                next[ri][col.id] = val;
              }
              const tipo = String(next[ri]['tipo_vehiculo'] ?? '');
              if (tipo && USO_DEFAULT[tipo]) next[ri]['uso'] = USO_DEFAULT[tipo];
              if (tipo === 'Semirremolque') next[ri]['lunas'] = 'No';
            }
            return next;
          });
          return;
        }
      }

      // Celda única sin tabulador: dejar que react-data-grid lo maneje
      if (lines.length === 1 && !lines[0].includes('\t')) return;

      e.preventDefault();

      const pasteData = lines.map(line => line.split('\t'));

      const startKey = lastColKey ?? colDefs[0]?.id;
      const startColIdx = colDefs.findIndex(c => c.id === startKey);
      if (startColIdx < 0) return;

      setRows(prev => {
        const next = prev.map(r => ({ ...r }));

        pasteData.forEach((pasteRow, rowOffset) => {
          const rowIdx = focusedRowIdx + rowOffset;
          if (rowIdx >= next.length) return;

          pasteRow.forEach((rawValue, colOffset) => {
            const colIdx = startColIdx + colOffset;
            if (colIdx >= colDefs.length) return;
            const col = colDefs[colIdx];
            if (col.isComputed) return;

            let val = rawValue.trim();
            if (col.normalizeFn && val) {
              val = col.normalizeFn(val).value;
            }
            next[rowIdx][col.id] = val;
          });

          const tipo = String(next[rowIdx]['tipo_vehiculo'] ?? '');
          if (tipo && USO_DEFAULT[tipo]) next[rowIdx]['uso'] = USO_DEFAULT[tipo];
          if (tipo === 'Semirremolque') next[rowIdx]['lunas'] = 'No';
        });

        return next;
      });
    };

    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Ctrl+C: copiar rango como TSV ─────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;
      const selRange  = selRangeRef.current;
      const lastColKey = lastColKeyRef.current;
      const colDefs   = colDefsRef.current;
      const rows      = rowsRef.current;

      if (!selRange || !lastColKey) return;

      const { r0, r1, c0, c1 } = selRange;
      const lines: string[] = [];

      for (let ri = r0; ri <= r1; ri++) {
        const row = rows[ri];
        if (!row) continue;
        const cells: string[] = [];
        for (let ci = c0; ci <= c1; ci++) {
          const col = colDefs[ci];
          if (!col) continue;
          const val = col.isComputed && col.computeFn
            ? col.computeFn(rowToRecord(row))
            : String(row[col.id] ?? '');
          cells.push(val);
        }
        lines.push(cells.join('\t'));
      }

      const tsv = lines.join('\n');
      if (tsv && window.isSecureContext) {
        e.preventDefault();
        navigator.clipboard.writeText(tsv);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Delete / Backspace: borrar rango seleccionado ─────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      const selRange   = selRangeRef.current;
      const lastColKey = lastColKeyRef.current;
      const colDefs    = colDefsRef.current;
      if (!selRange || !lastColKey) return;

      const { r0, r1, c0, c1 } = selRange;
      const isMultiCell = r0 !== r1 || c0 !== c1;

      // Celda única con input activo: dejar que el usuario escriba/borre normalmente
      if (!isMultiCell && document.activeElement?.tagName === 'INPUT') return;

      e.preventDefault();
      e.stopPropagation(); // evitar que react-data-grid procese también el Delete

      setRows(prev => {
        const next = prev.map(r => ({ ...r }));
        for (let ri = r0; ri <= r1; ri++) {
          for (let ci = c0; ci <= c1; ci++) {
            const col = colDefs[ci];
            if (!col || col.isComputed) continue;
            next[ri][col.id] = '';
          }
        }
        return next;
      });
    };

    // Capture phase: se ejecuta antes que los handlers internos de react-data-grid
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    getData: () => rows.map(rowToRecord),
    setData: (data) => {
      setRows(data.map((r, i) => ({ ...emptyRow(i, colDefs), ...r })));
    },
    toRows: () => rows.map(row => {
      const rec = rowToRecord(row);
      for (const col of colDefs) {
        if (col.isComputed && col.computeFn) {
          rec[col.id] = col.computeFn(rec);
        }
      }
      return rec;
    }),
    getColDefs: () => colDefs,
  }));

  const deleteRow = useCallback((rowIdx: number) => {
    setRows(prev => prev.filter((_, i) => i !== rowIdx));
    setConfirmDelRow(null);
    setSelRange(null);
  }, []);

  // ─── Columnas ──────────────────────────────────────────────────────────────

  const columns = useMemo((): Column<GridRow>[] => {
    const rowNumCol: Column<GridRow> = {
      key: '_idx',
      name: '#',
      width: 56,
      minWidth: 56,
      frozen: true,
      resizable: false,
      renderCell: ({ rowIdx }: RenderCellProps<GridRow>) => {
        if (confirmDelRow === rowIdx) {
          return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <button
                onClick={e => { e.stopPropagation(); deleteRow(rowIdx); }}
                style={{ fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 3, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
                Sí
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelRow(null); }}
                style={{ fontSize: 9, fontWeight: 900, padding: '2px 5px', borderRadius: 3, background: '#e5e7eb', color: '#374151', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
                No
              </button>
            </div>
          );
        }
        return (
          <div
            title="Eliminar fila"
            onClick={e => { e.stopPropagation(); setConfirmDelRow(rowIdx); }}
            style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: '#9ca3af', fontSize: 11, fontWeight: 700 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#9ca3af'; }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            {rowIdx + 1}
          </div>
        );
      },
    };

    const dataCols: Column<GridRow>[] = colDefs.map(col => ({
      key: col.id,
      name: col.name,
      width: col.width,
      minWidth: 50,
      frozen: col.frozen,
      resizable: !col.isComputed,
      editable: !col.isComputed,
      renderEditCell: col.isComputed ? undefined : renderTextEditor,
      renderCell: ({ row, rowIdx }: RenderCellProps<GridRow>) => {
        const rawValue = row[col.id];
        const value = rawValue !== undefined ? String(rawValue) : '';

        const colIdx = colDefs.findIndex(c => c.id === col.id);
        const inRange = selRange !== null
          && rowIdx >= selRange.r0 && rowIdx <= selRange.r1
          && colIdx >= selRange.c0 && colIdx <= selRange.c1;

        if (col.isComputed) {
          const rec = rowToRecord(row);
          const computed = col.computeFn ? col.computeFn(rec) : value;
          return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 12, color: '#374151', background: inRange ? 'rgba(99,102,241,0.12)' : '#f9fafb', outline: inRange ? '1px solid rgba(99,102,241,0.4)' : 'none', outlineOffset: '-1px' }}>
              {computed}
            </div>
          );
        }

        // Detectar valor no normalizado
        let unmatched = false;
        if (col.normalizeFn && value.trim()) {
          unmatched = !col.normalizeFn(value).matched;
        }

        // FRQ visual: gris si cobertura no es Todo Riesgo
        const isFrqDisabled = col.id === 'frq' &&
          String(row['coberturas_solicitadas'] ?? '') !== 'Todo Riesgo con Franquicia';

        // LUNAS bloqueado para semirremolque
        const isLunasDisabled = col.id === 'lunas' &&
          String(row['tipo_vehiculo'] ?? '') === 'Semirremolque';

        return (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            fontSize: 12,
            background: inRange ? 'rgba(99,102,241,0.12)' : (unmatched ? '#fffbeb' : 'transparent'),
            color: (isFrqDisabled || isLunasDisabled) ? '#9ca3af' : (unmatched ? '#92400e' : '#111827'),
            fontStyle: (isFrqDisabled || isLunasDisabled) ? 'italic' : 'normal',
            outline: inRange ? '1px solid rgba(99,102,241,0.4)' : 'none',
            outlineOffset: '-1px',
          }}>
            {value}
          </div>
        );
      },
    }));

    return [rowNumCol, ...dataCols];
  }, [colDefs, selRange, confirmDelRow, deleteRow]);

  // ─── onRowsChange: normalización + auto-fill ───────────────────────────────

  const handleRowsChange = useCallback((
    newRows: GridRow[],
    { indexes }: RowsChangeData<GridRow>,
  ) => {
    const updated = newRows.map((newRow, idx) => {
      if (!indexes.includes(idx)) return newRow;

      const oldRow = rows[idx];
      const next = { ...newRow };

      // Normalizar TODAS las columnas que cambiaron (cubre paste multi-columna)
      for (const col of colDefs) {
        if (col.isComputed || !col.normalizeFn) continue;
        const newVal = String(next[col.id] ?? '');
        const oldVal = String(oldRow?.[col.id] ?? '');
        if (newVal !== oldVal && newVal.trim()) {
          next[col.id] = col.normalizeFn(newVal).value;
        }
      }

      // Auto-fill USO si TIPO_VEHICULO cambió
      const newTipo = String(next['tipo_vehiculo'] ?? '');
      const oldTipo = String(oldRow?.['tipo_vehiculo'] ?? '');
      if (newTipo !== oldTipo) {
        const uso = USO_DEFAULT[newTipo];
        if (uso) next['uso'] = uso;
        if (newTipo === 'Semirremolque') next['lunas'] = 'No';
      }

      // Limpiar FRQ si cobertura cambió a no-todo-riesgo
      if (next['coberturas_solicitadas'] !== 'Todo Riesgo con Franquicia') {
        if (String(oldRow?.['coberturas_solicitadas'] ?? '') === 'Todo Riesgo con Franquicia') {
          next['frq'] = '';
        }
      }

      return next;
    });

    setRows(updated);
  }, [colDefs, rows]);

  // ─── Fill handle ──────────────────────────────────────────────────────────

  const handleFill = useCallback(({ columnKey, sourceRow, targetRow }: FillEvent<GridRow>): GridRow => {
    const col = colDefs.find(c => c.id === columnKey);
    let value = String(sourceRow[columnKey] ?? '');

    if (col?.normalizeFn && value.trim()) {
      value = col.normalizeFn(value).value;
    }

    const next = { ...targetRow, [columnKey]: value };

    if (columnKey === 'tipo_vehiculo') {
      const uso = USO_DEFAULT[value];
      if (uso) next['uso'] = uso;
      if (value === 'Semirremolque') next['lunas'] = 'No';
    }

    return next;
  }, [colDefs]);

  // ─── Copy / Paste ──────────────────────────────────────────────────────────

  const handleCopy = useCallback(({ row, column }: CellCopyArgs<GridRow>) => {
    if (window.isSecureContext) {
      navigator.clipboard.writeText(String(row[column.key] ?? ''));
    }
  }, []);

  const handlePaste = useCallback(({ row, column }: CellPasteArgs<GridRow>, event: React.ClipboardEvent): GridRow => {
    const colId = column.key;
    const col = colDefs.find(c => c.id === colId);
    let value = event.clipboardData.getData('text/plain').trim();

    if (col?.normalizeFn && value) {
      value = col.normalizeFn(value).value;
    }

    const next = { ...row, [colId]: value };

    if (colId === 'tipo_vehiculo') {
      const uso = USO_DEFAULT[value];
      if (uso) next['uso'] = uso;
      if (value === 'Semirremolque') next['lunas'] = 'No';
    }

    return next;
  }, [colDefs]);

  // ─── Bulk assign ──────────────────────────────────────────────────────────

  const bulkInfo = useMemo(() => {
    if (selectedRows.size <= 1 || !lastColKey) return null;
    const colKey = lastColKey;
    if (colKey === '_idx') return null;
    const col = colDefs.find(c => c.id === colKey);
    if (!col || col.isComputed) return null;
    const options = BULK_OPTS[colKey];
    if (!options) return null;
    return { colKey, colName: col.name, options, rowIds: [...selectedRows] };
  }, [selectedRows, lastColKey, colDefs]);

  const handleBulkApply = useCallback(() => {
    if (!bulkInfo || !bulkValue) return;
    setRows(prev => prev.map(row => {
      if (!bulkInfo.rowIds.includes(row._id)) return row;
      const next: GridRow = { ...row, [bulkInfo.colKey]: bulkValue };
      if (bulkInfo.colKey === 'tipo_vehiculo') {
        const uso = USO_DEFAULT[bulkValue];
        if (uso) next['uso'] = uso;
        if (bulkValue === 'Semirremolque') next['lunas'] = 'No';
      }
      return next;
    }));
    setSelectedRows(new Set());
    setBulkValue('');
  }, [bulkInfo, bulkValue]);

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const filledRows = rows.filter(r =>
    Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim())
  ).length;

  const addRows = useCallback((n: number) => {
    setSelRange(null);
    setRows(prev => {
      const nextId = prev.length > 0 ? prev[prev.length - 1]._id + 1 : 0;
      return [...prev, ...Array.from({ length: n }, (_, i) => emptyRow(nextId + i, colDefs))];
    });
  }, [colDefs]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {filledRows} vehículos · {colDefs.length} columnas
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => addRows(10)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
            + 10 filas
          </button>
          <button onClick={() => addRows(50)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: '#6366f1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer' }}>
            + 50 filas
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0" style={{ position: 'relative' }}>
        <DataGrid
          columns={columns}
          rows={rows}
          onRowsChange={handleRowsChange}
          onFill={handleFill}
          onCellPaste={handlePaste as any}
          rowKeyGetter={(row: GridRow) => row._id}
          selectedRows={selectedRows}
          onSelectedRowsChange={setSelectedRows}
          onCellClick={(args: CellMouseArgs<GridRow>, event) => {
            const colIdx = colDefs.findIndex(c => c.id === args.column.key);
            if ((event as unknown as MouseEvent).shiftKey && selRange) {
              setSelRange({
                r0: Math.min(selRange.r0, args.rowIdx),
                r1: Math.max(selRange.r1, args.rowIdx),
                c0: Math.min(selRange.c0, colIdx),
                c1: Math.max(selRange.c1, colIdx),
              });
            } else {
              setLastColKey(args.column.key);
              setFocusedRowIdx(args.rowIdx);
              setSelRange(colIdx >= 0 ? { r0: args.rowIdx, r1: args.rowIdx, c0: colIdx, c1: colIdx } : null);
            }
          }}
          enableVirtualization
          style={{ height: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 12 }}
          className="rdg-light"
          defaultColumnOptions={{ resizable: true, sortable: false }}
        />

        {/* Bulk assign toolbar */}
        {bulkInfo && (
          <div style={{ position: 'sticky', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(2,6,23,0.95)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 100, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
              {bulkInfo.rowIds.length} filas · {bulkInfo.colName}
            </span>
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
              style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e0e7ff', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}>
              <option value="">— elegir valor —</option>
              {bulkInfo.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={handleBulkApply} disabled={!bulkValue}
              style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, background: bulkValue ? '#6366f1' : 'rgba(99,102,241,0.3)', color: '#ffffff', border: 'none', cursor: bulkValue ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
              Aplicar a todas
            </button>
            <button onClick={() => { setSelectedRows(new Set()); setBulkValue(''); }}
              style={{ fontSize: 13, lineHeight: 1, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
        )}
      </div>
    </div>
  );
});

export default FlotaGrid;
