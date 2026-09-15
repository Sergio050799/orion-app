"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { DataGrid, renderTextEditor } from 'react-data-grid';
import type { Column, FillEvent, CellCopyArgs, CellPasteArgs, CellMouseArgs, RenderCellProps, RowsChangeData } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import type { ColDef, FlotaGridHandle } from './types';
import { TIPO_VEHICULO_OPTS, USO_OPTS, AMBITO_OPTS, COBERTURA_OPTS, ASISTENCIA_OPTS, LUNAS_OPTS } from '@/core/flotas';
import { parseExcelTemplate } from '@/core/flotas/parser';

const EMPTY_ROWS_PADDING = 5;

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
      const dataRows = initialData.map((r, i) => ({ ...emptyRow(i, initialColDefs), ...r }));
      const nextId = dataRows.length;
      return [...dataRows, ...Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(nextId + i, initialColDefs))];
    }
    return Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(i, initialColDefs));
  });
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<number>>(new Set());
  const [lastColKey, setLastColKey] = useState<string | null>(null);
  const [focusedRowIdx, setFocusedRowIdx] = useState<number>(0);
  const [selRange, setSelRange] = useState<{ r0: number; r1: number; c0: number; c1: number } | null>(null);
  const [bulkValue, setBulkValue] = useState('');
  const [confirmDelRow, setConfirmDelRow] = useState<number | null>(null);
  const [copiedRange, setCopiedRange] = useState<{ r0: number; r1: number; c0: number; c1: number } | null>(null);

  // Drag-to-select refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);

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
  const copiedRangeRef = useRef(copiedRange);
  copiedRangeRef.current = copiedRange;

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
      setCopiedRange(null);

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

      const startRowIdx = selRange ? selRange.r0 : focusedRowIdx;
      const startColIdx = selRange ? selRange.c0 : colDefs.findIndex(c => c.id === (lastColKey ?? colDefs[0]?.id));
      if (startColIdx < 0) return;

      setRows(prev => {
        const next = prev.map(r => ({ ...r }));

        pasteData.forEach((pasteRow, rowOffset) => {
          const rowIdx = startRowIdx + rowOffset;
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
        setCopiedRange({ r0, r1, c0, c1 });
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Ctrl+D Fill Down / Ctrl+R Fill Right ──────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key !== 'd' && e.key !== 'r') return;

      const range = selRangeRef.current;
      if (!range) return;

      e.preventDefault();
      const colDefs = colDefsRef.current;

      if (e.key === 'd') {
        // Fill Down: copy first row value to all rows below in range
        setRows(prev => {
          const next = prev.map(r => ({ ...r }));
          for (let ci = range.c0; ci <= range.c1; ci++) {
            const col = colDefs[ci];
            if (!col || col.isComputed) continue;
            const sourceVal = String(next[range.r0][col.id] ?? '');
            for (let ri = range.r0 + 1; ri <= range.r1; ri++) {
              let val = sourceVal;
              if (col.normalizeFn && val.trim()) val = col.normalizeFn(val).value;
              next[ri][col.id] = val;
            }
          }
          // Auto-fill USO/LUNAS if tipo_vehiculo is in the range
          const tipoIdx = colDefs.findIndex(c => c.id === 'tipo_vehiculo');
          if (tipoIdx >= range.c0 && tipoIdx <= range.c1) {
            for (let ri = range.r0 + 1; ri <= range.r1; ri++) {
              const tipo = String(next[ri]['tipo_vehiculo'] ?? '');
              if (tipo && USO_DEFAULT[tipo]) next[ri]['uso'] = USO_DEFAULT[tipo];
              if (tipo === 'Semirremolque') next[ri]['lunas'] = 'No';
            }
          }
          return next;
        });
      } else {
        // Fill Right: copy first column value to all columns right in range
        setRows(prev => {
          const next = prev.map(r => ({ ...r }));
          for (let ri = range.r0; ri <= range.r1; ri++) {
            const sourceCol = colDefs[range.c0];
            if (!sourceCol) continue;
            const sourceVal = String(next[ri][sourceCol.id] ?? '');
            for (let ci = range.c0 + 1; ci <= range.c1; ci++) {
              const col = colDefs[ci];
              if (!col || col.isComputed) continue;
              let val = sourceVal;
              if (col.normalizeFn && val.trim()) val = col.normalizeFn(val).value;
              next[ri][col.id] = val;
            }
          }
          return next;
        });
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Shift+Arrows: extender selección ─────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      const range = selRangeRef.current;
      if (!range) return;

      e.preventDefault();
      const maxRow = rowsRef.current.length - 1;
      const maxCol = colDefsRef.current.length - 1;

      const newRange = { ...range };
      switch (e.key) {
        case 'ArrowDown':
          newRange.r1 = e.ctrlKey || e.metaKey ? maxRow : Math.min(newRange.r1 + 1, maxRow);
          break;
        case 'ArrowUp':
          newRange.r0 = e.ctrlKey || e.metaKey ? 0 : Math.max(newRange.r0 - 1, 0);
          break;
        case 'ArrowRight':
          newRange.c1 = e.ctrlKey || e.metaKey ? maxCol : Math.min(newRange.c1 + 1, maxCol);
          break;
        case 'ArrowLeft':
          newRange.c0 = e.ctrlKey || e.metaKey ? 0 : Math.max(newRange.c0 - 1, 0);
          break;
      }
      setSelRange(newRange);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Escape: clear copiedRange ──────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopiedRange(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ─── Drag-to-select ──────────────────────────────────────────────────────

  useEffect(() => {
    const getCellFromPoint = (x: number, y: number) => {
      const cell = document.elementFromPoint(x, y)?.closest('[role="gridcell"]');
      if (!cell) return null;
      const row = cell.closest('[role="row"]');
      if (!row) return null;
      const rowIdx = parseInt(row.getAttribute('aria-rowindex') ?? '', 10) - 2; // 1-based + header
      const colIdx = parseInt(cell.getAttribute('aria-colindex') ?? '', 10) - 2; // 1-based, minus # column
      if (rowIdx < 0 || colIdx < 0) return null;
      return { row: rowIdx, col: colIdx };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const pos = getCellFromPoint(e.clientX, e.clientY);
      if (!pos) return;
      const start = dragStartRef.current;
      setSelRange({
        r0: Math.min(start.row, pos.row),
        r1: Math.max(start.row, pos.row),
        c0: Math.min(start.col, pos.col),
        c1: Math.max(start.col, pos.col),
      });
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        dragStartRef.current = null;
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      // Only left button, not on inputs or the # column
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('input, select, button')) return;
      if (e.shiftKey) return; // let Shift+Click handle range extension

      const pos = getCellFromPoint(e.clientX, e.clientY);
      if (!pos) return;

      isDraggingRef.current = true;
      dragStartRef.current = pos;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
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

        // Marching ants: borders for copied range
        const inCopied = copiedRange !== null
          && rowIdx >= copiedRange.r0 && rowIdx <= copiedRange.r1
          && colIdx >= copiedRange.c0 && colIdx <= copiedRange.c1;
        const copiedBorder = inCopied ? {
          borderTop: rowIdx === copiedRange!.r0 ? '2px dashed #3366FF' : undefined,
          borderBottom: rowIdx === copiedRange!.r1 ? '2px dashed #3366FF' : undefined,
          borderLeft: colIdx === copiedRange!.c0 ? '2px dashed #3366FF' : undefined,
          borderRight: colIdx === copiedRange!.c1 ? '2px dashed #3366FF' : undefined,
          animation: 'pulse-outline 1s ease-in-out infinite',
        } : {};

        if (col.isComputed) {
          const rec = rowToRecord(row);
          const computed = col.computeFn ? col.computeFn(rec) : value;
          return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 4px', fontSize: 13, color: '#374151', background: inRange ? 'rgba(18,64,204,0.12)' : '#f9fafb', outline: inRange ? '1px solid rgba(18,64,204,0.4)' : 'none', outlineOffset: '-1px', ...copiedBorder }}>
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
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 4px',
            fontSize: 13,
            background: inRange ? 'rgba(18,64,204,0.12)' : (unmatched ? '#fffbeb' : 'transparent'),
            color: (isFrqDisabled || isLunasDisabled) ? '#9ca3af' : (unmatched ? '#92400e' : '#111827'),
            fontStyle: (isFrqDisabled || isLunasDisabled) ? 'italic' : 'normal',
            outline: inRange ? '1px solid rgba(18,64,204,0.4)' : 'none',
            outlineOffset: '-1px',
            ...copiedBorder,
          }}>
            {value}
          </div>
        );
      },
    }));

    return [rowNumCol, ...dataCols];
  }, [colDefs, selRange, copiedRange, confirmDelRow, deleteRow]);

  // ─── onRowsChange: normalización + auto-fill ───────────────────────────────

  const handleRowsChange = useCallback((
    newRows: GridRow[],
    { indexes }: RowsChangeData<GridRow>,
  ) => {
    setCopiedRange(null);
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

  // ─── Drag & drop + Import Excel ─────────────────────────────────────────────

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = useCallback(async (file: File) => {
    const result = await parseExcelTemplate(file);
    if (result.rows.length === 0) return;
    const dataRows = result.rows.map((r, i) => ({ ...emptyRow(i, colDefs), ...r }));
    const nextId = dataRows.length;
    const padding = Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(nextId + i, colDefs));
    setRows([...dataRows, ...padding]);
    setSelRange(null);
    setSelectedRows(new Set());
  }, [colDefs]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'csv') {
      handleImportFile(file);
    }
  }, [handleImportFile]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
    e.target.value = '';
  }, [handleImportFile]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
          <span style={{ color: '#3366FF' }}>{filledRows}</span> vehículos cargados
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleImportClick}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, background: 'rgba(18,64,204,0.08)', color: '#3366FF', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer', gap: 4, display: 'inline-flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Importar Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
          <button onClick={() => addRows(10)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: '#1240CC', background: 'rgba(18,64,204,0.08)', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer' }}>
            + 10 filas
          </button>
          <button onClick={() => addRows(50)}
            style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: '#1240CC', background: 'rgba(18,64,204,0.08)', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer' }}>
            + 50 filas
          </button>
        </div>
      </div>

      {/* Grid with drag & drop zone */}
      <div
        className="flex-1 min-h-0"
        style={{ position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(61,112,255,0.10)',
            border: '2px dashed #3366FF',
            borderRadius: 8,
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#3366FF' }}>
              Soltar archivo .xlsx o .csv para importar
            </span>
          </div>
        )}
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
          rowHeight={32}
          headerRowHeight={36}
          style={{ height: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 13 }}
          className="rdg-light rdg-centered"
          defaultColumnOptions={{ resizable: true, sortable: false }}
        />

        {/* Bulk assign toolbar */}
        {bulkInfo && (
          <div style={{ position: 'sticky', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,7,45,0.95)', border: '1px solid rgba(18,64,204,0.4)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 100, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
              {bulkInfo.rowIds.length} filas · {bulkInfo.colName}
            </span>
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
              style={{ fontSize: 11, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(178,198,245,0.28)', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}>
              <option value="">— elegir valor —</option>
              {bulkInfo.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <button onClick={handleBulkApply} disabled={!bulkValue}
              style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6, background: bulkValue ? '#1240CC' : 'rgba(18,64,204,0.3)', color: '#ffffff', border: 'none', cursor: bulkValue ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
              Aplicar a todas
            </button>
            <button onClick={() => { setSelectedRows(new Set()); setBulkValue(''); }}
              style={{ fontSize: 13, lineHeight: 1, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
        )}
      </div>

      {/* Añadir filas button */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0', flexShrink: 0 }}>
        <button
          onClick={() => addRows(10)}
          style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 8, background: 'rgba(18,64,204,0.1)', color: '#3366FF', border: '1px solid rgba(18,64,204,0.25)', cursor: 'pointer' }}
        >
          + Añadir filas
        </button>
      </div>
    </div>
  );
});

export default FlotaGrid;
