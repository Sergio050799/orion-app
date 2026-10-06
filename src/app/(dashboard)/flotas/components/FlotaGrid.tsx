"use client";

import React, {
  useState, useCallback, useMemo, useRef, useEffect,
  forwardRef, useImperativeHandle, memo,
} from 'react';
import type { ColDef, FlotaGridHandle } from './types';
import {
  TIPO_VEHICULO_OPTS, USO_OPTS, ADR_OPTS, AMBITO_OPTS,
  COBERTURA_OPTS, ASISTENCIA_OPTS, LUNAS_OPTS,
} from '@/core/flotas';
import { parseExcelTemplate } from '@/core/flotas/parser';

const EMPTY_ROWS_PADDING = 5;

const DROPDOWN_OPTS: Record<string, string[]> = {
  tipo_vehiculo:          TIPO_VEHICULO_OPTS,
  uso:                    USO_OPTS,
  adr:                    ADR_OPTS,
  ambito:                 AMBITO_OPTS,
  coberturas_solicitadas: COBERTURA_OPTS,
  asistencia:             ASISTENCIA_OPTS,
  lunas:                  LUNAS_OPTS,
};

const USO_DEFAULT: Record<string, string> = {
  'Turismo':                   'Particular',
  'Furgoneta':                 'Transportes propios',
  'Cabeza tractora':           'Transportes propios',
  'Camión rígido':             'Transportes propios',
  'Semirremolque':             'Transportes propios',
  'Industrial matriculado':    'Transportes propios',
  'Industrial no matriculado': 'Transportes propios',
};

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface GridRow  { _id: number; [key: string]: string | number; }
interface CellPos  { rowIdx: number; colIdx: number; }
interface NormRange { r1: number; c1: number; r2: number; c2: number; }

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

function clampRange(a: CellPos, b: CellPos): NormRange {
  return {
    r1: Math.min(a.rowIdx, b.rowIdx), r2: Math.max(a.rowIdx, b.rowIdx),
    c1: Math.min(a.colIdx, b.colIdx), c2: Math.max(a.colIdx, b.colIdx),
  };
}

// ─── TableRow (memoizado) ─────────────────────────────────────────────────────

interface RowProps {
  row: GridRow;
  rowIdx: number;
  colDefs: ColDef[];
  rowChecked: boolean;
  normRange: NormRange | null;
  anchorPos: CellPos | null;
  fillHandlePos: CellPos | null;
  fillTargetRange: NormRange | null;
  onToggleCheck: (id: number) => void;
  onCellFocus:     (rowIdx: number, colIdx: number) => void;
  onCellChange:    (rowId: number, colId: string, value: string) => void;
  onCellBlur:      (rowId: number, colId: string, value: string) => void;
  onCellMouseDown: (rowIdx: number, colIdx: number, e: React.MouseEvent) => void;
  onCellMouseEnter:(rowIdx: number, colIdx: number) => void;
  onFillMouseDown: (e: React.MouseEvent) => void;
  onDelete: (id: number) => void;
}

const TableRow = memo(function TableRow({
  row, rowIdx, colDefs, rowChecked,
  normRange, anchorPos, fillHandlePos, fillTargetRange,
  onToggleCheck, onCellFocus, onCellChange, onCellBlur,
  onCellMouseDown, onCellMouseEnter, onFillMouseDown, onDelete,
}: RowProps) {
  const rowBg = rowChecked
    ? 'rgba(18,64,204,0.05)'
    : rowIdx % 2 === 0 ? '#ffffff' : '#f8faff';

  return (
    <tr style={{ background: rowBg, borderBottom: '1px solid #e5e7eb' }}>
      {/* Checkbox */}
      <td style={{ width: 36, textAlign: 'center', padding: '0 4px', position: 'sticky', left: 0, background: rowBg, zIndex: 1 }}>
        <input type="checkbox" checked={rowChecked} onChange={() => onToggleCheck(row._id)}
          style={{ cursor: 'pointer', accentColor: '#1240CC' }} />
      </td>
      {/* Nº */}
      <td style={{ width: 36, textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '0 4px', userSelect: 'none', position: 'sticky', left: 36, background: rowBg, zIndex: 1, borderRight: '1px solid #e5e7eb' }}>
        {rowIdx + 1}
      </td>

      {colDefs.map((col, colIdx) => {
        const value = String(row[col.id] ?? '');
        const opts  = DROPDOWN_OPTS[col.id];

        const isAnchor  = anchorPos?.rowIdx === rowIdx && anchorPos?.colIdx === colIdx;
        const inSel     = normRange
          ? rowIdx >= normRange.r1 && rowIdx <= normRange.r2 && colIdx >= normRange.c1 && colIdx <= normRange.c2
          : false;
        const inFill    = fillTargetRange
          ? rowIdx >= fillTargetRange.r1 && rowIdx <= fillTargetRange.r2 && colIdx >= fillTargetRange.c1 && colIdx <= fillTargetRange.c2
          : false;
        const isFillHandle = fillHandlePos?.rowIdx === rowIdx && fillHandlePos?.colIdx === colIdx;

        // Columna computada — solo lectura
        if (col.isComputed) {
          const rec      = rowToRecord(row);
          const computed = col.computeFn ? col.computeFn(rec) : value;
          return (
            <td key={col.id} style={{ minWidth: col.width, maxWidth: col.width, padding: '0 6px', textAlign: 'center', color: '#1240CC', fontWeight: 700, fontSize: 12, background: 'rgba(18,64,204,0.04)', borderRight: '1px solid #f0f0f0' }}>
              {computed}
            </td>
          );
        }

        const isFrqDisabled   = col.id === 'frq'   && String(row['coberturas_solicitadas'] ?? '') !== 'Todo Riesgo con Franquicia';
        const isLunasDisabled = col.id === 'lunas'  && (
          String(row['tipo_vehiculo'] ?? '') === 'Semirremolque' ||
          String(row['tipo_vehiculo'] ?? '') === 'Industrial no matriculado'
        );
        const disabled = isFrqDisabled || isLunasDisabled;

        const tdBg = inFill
          ? 'rgba(18,64,204,0.12)'
          : inSel
          ? 'rgba(18,64,204,0.07)'
          : 'transparent';

        const tdStyle: React.CSSProperties = {
          minWidth: col.width, maxWidth: col.width,
          padding: 0, position: 'relative',
          background: tdBg,
          borderRight: '1px solid #f0f0f0',
          outline: isAnchor
            ? '2px solid #1240CC'
            : inSel
            ? '0.5px solid rgba(18,64,204,0.35)'
            : 'none',
          outlineOffset: isAnchor ? -2 : -1,
          boxSizing: 'border-box',
        };

        const inputBase: React.CSSProperties = {
          width: '100%', height: 32, border: 'none', outline: 'none',
          background: 'transparent', fontSize: 12,
          color: disabled ? '#b0b8c8' : '#111827',
          fontStyle: disabled ? 'italic' : 'normal',
          padding: '0 6px', fontFamily: 'inherit',
        };

        return (
          <td key={col.id} style={tdStyle}
            onMouseDown={e => onCellMouseDown(rowIdx, colIdx, e)}
            onMouseEnter={() => onCellMouseEnter(rowIdx, colIdx)}
          >
            {opts ? (
              <select
                value={value}
                disabled={disabled}
                onFocus={() => onCellFocus(rowIdx, colIdx)}
                onChange={e => onCellChange(row._id, col.id, e.target.value)}
                style={{ ...inputBase, cursor: disabled ? 'not-allowed' : 'pointer', paddingRight: 4, color: value ? (disabled ? '#b0b8c8' : '#111827') : '#9ca3af' }}
              >
                <option value="">—</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type="text"
                defaultValue={value}
                disabled={disabled}
                onFocus={e => { onCellFocus(rowIdx, colIdx); e.target.select(); }}
                onBlur={e => onCellBlur(row._id, col.id, e.target.value)}
                style={{ ...inputBase, cursor: disabled ? 'not-allowed' : 'text' }}
              />
            )}

            {/* Fill handle — cuadradito para arrastrar hacia abajo */}
            {isFillHandle && (
              <div
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onFillMouseDown(e); }}
                style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 7, height: 7,
                  background: '#1240CC', border: '1.5px solid #fff',
                  borderRadius: 1, cursor: 'crosshair', zIndex: 10,
                }}
              />
            )}
          </td>
        );
      })}

      {/* Eliminar */}
      <td style={{ width: 32, textAlign: 'center', padding: '0 4px' }}>
        <button onClick={() => onDelete(row._id)} title="Eliminar fila"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
        >×</button>
      </td>
    </tr>
  );
});

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
      const dr = initialData.map((r, i) => ({ ...emptyRow(i, initialColDefs), ...r }));
      return [...dr, ...Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(dr.length + i, initialColDefs))];
    }
    return Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(i, initialColDefs));
  });

  // ── Selección de celdas ─────────────────────────────────────────────────────
  // anchorPos: la celda actualmente enfocada (o el inicio del rango)
  // selectionEnd: extremo del rango al hacer Shift+Click
  const [anchorPos,    setAnchorPos]    = useState<CellPos | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellPos | null>(null);
  const [fillDragEnd,  setFillDragEnd]  = useState<CellPos | null>(null);

  const isDraggingFillRef = useRef(false);

  // Refs estables para closures en effects
  const colDefsRef      = useRef(colDefs);     colDefsRef.current      = colDefs;
  const onDataChangeRef = useRef(onDataChange); onDataChangeRef.current = onDataChange;
  const rowsRef         = useRef(rows);         rowsRef.current         = rows;
  const anchorPosRef    = useRef(anchorPos);    anchorPosRef.current    = anchorPos;
  const normRangeRef    = useRef<NormRange | null>(null);
  const fillTargetRef   = useRef<NormRange | null>(null);

  // ── Selección computada ─────────────────────────────────────────────────────

  const normRange = useMemo<NormRange | null>(() => {
    if (!anchorPos) return null;
    return clampRange(anchorPos, selectionEnd ?? anchorPos);
  }, [anchorPos, selectionEnd]);
  normRangeRef.current = normRange;

  const fillHandlePos = useMemo<CellPos | null>(() => {
    if (!normRange) return null;
    return { rowIdx: normRange.r2, colIdx: normRange.c2 };
  }, [normRange]);

  const fillTargetRange = useMemo<NormRange | null>(() => {
    if (!normRange || !fillDragEnd || fillDragEnd.rowIdx <= normRange.r2) return null;
    return { r1: normRange.r2 + 1, r2: fillDragEnd.rowIdx, c1: normRange.c1, c2: normRange.c2 };
  }, [normRange, fillDragEnd]);
  fillTargetRef.current = fillTargetRange;

  // ── Row checkboxes ──────────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // ── Bulk assign ─────────────────────────────────────────────────────────────
  const [bulkCol,   setBulkCol]   = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const bulkColOptions = useMemo(() => colDefs.filter(c => !!DROPDOWN_OPTS[c.id]), [colDefs]);

  // ── Sort ────────────────────────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);

  // ── Drag & drop import ──────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver]  = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  // ── Debounced onDataChange ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      onDataChangeRef.current?.(rows.map(row => {
        const rec = rowToRecord(row);
        for (const col of colDefsRef.current)
          if (col.isComputed && col.computeFn) rec[col.id] = col.computeFn(rec);
        return rec;
      }));
    }, 300);
    return () => clearTimeout(t);
  }, [rows]);

  // ── applyChange ─────────────────────────────────────────────────────────────
  const applyChange = useCallback((rowId: number, colId: string, rawValue: string) => {
    setRows(prev => prev.map(row => {
      if (row._id !== rowId) return row;
      const col = colDefsRef.current.find(c => c.id === colId);
      let val = rawValue;
      if (col?.normalizeFn && val.trim()) val = col.normalizeFn(val).value;
      const next: GridRow = { ...row, [colId]: val };
      if (colId === 'tipo_vehiculo') {
        const uso = USO_DEFAULT[val];
        if (uso) next['uso'] = uso;
        if (val === 'Semirremolque' || val === 'Industrial no matriculado') next['lunas'] = 'No';
      }
      if (colId === 'coberturas_solicitadas' && val !== 'Todo Riesgo con Franquicia') {
        if (String(row['coberturas_solicitadas']) === 'Todo Riesgo con Franquicia') next['frq'] = '';
      }
      return next;
    }));
  }, []);

  // ── Eventos de celda ────────────────────────────────────────────────────────

  // onFocus en input/select → actualiza anchorPos
  const handleCellFocus = useCallback((rowIdx: number, colIdx: number) => {
    setAnchorPos({ rowIdx, colIdx });
    setSelectionEnd(null); // click normal colapsa el rango
  }, []);

  // onMouseDown en TD:
  //   - Shift+Click extiende el rango sin mover el foco
  //   - Click normal deja que el input reciba el foco (onFocus lo captura)
  const handleCellMouseDown = useCallback((rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchorPosRef.current) {
      e.preventDefault(); // evita que el foco se mueva
      setSelectionEnd({ rowIdx, colIdx });
    }
    // Sin Shift: el input se enfoca solo; onFocus actualiza anchorPos
  }, []);

  // onMouseEnter en TD durante drag del fill handle
  const handleCellMouseEnter = useCallback((rowIdx: number, colIdx: number) => {
    if (isDraggingFillRef.current) setFillDragEnd({ rowIdx, colIdx });
  }, []);

  // Inicio del drag del fill handle
  const handleFillMouseDown = useCallback((_e: React.MouseEvent) => {
    isDraggingFillRef.current = true;
    setFillDragEnd(null);
  }, []);

  // ── Document mouseup — aplica fill ─────────────────────────────────────────
  useEffect(() => {
    const onUp = () => {
      if (isDraggingFillRef.current) {
        const nr = normRangeRef.current;
        const ft = fillTargetRef.current;
        if (nr && ft) {
          const cols = colDefsRef.current;
          setRows(prev => {
            const next = prev.map(r => ({ ...r }));
            const srcRows = prev.filter((_, i) => i >= nr.r1 && i <= nr.r2);
            for (let ti = 0; ti <= ft.r2 - ft.r1; ti++) {
              const tgtIdx = ft.r1 + ti;
              if (tgtIdx >= next.length) break;
              const src = srcRows[ti % srcRows.length];
              for (let ci = ft.c1; ci <= ft.c2; ci++) {
                const col = cols[ci];
                if (!col || col.isComputed) continue;
                next[tgtIdx][col.id] = src[col.id] ?? '';
              }
            }
            return next;
          });
          // Extiende la selección para incluir el fill target
          setSelectionEnd({ rowIdx: ft.r2, colIdx: nr.c2 });
        }
        isDraggingFillRef.current = false;
        setFillDragEnd(null);
      }
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  // ── Row checkboxes ──────────────────────────────────────────────────────────
  const toggleRowCheck = useCallback((rowId: number) => {
    setSelectedRows(prev => { const n = new Set(prev); n.has(rowId) ? n.delete(rowId) : n.add(rowId); return n; });
  }, []);

  const toggleAllCheck = useCallback(() => {
    setSelectedRows(prev => prev.size === rowsRef.current.length ? new Set() : new Set(rowsRef.current.map(r => r._id)));
  }, []);

  // ── Sort ────────────────────────────────────────────────────────────────────
  const handleSort = useCallback((colId: string) => {
    setSortConfig(prev => {
      const dir: 'asc' | 'desc' = prev?.col === colId && prev.dir === 'asc' ? 'desc' : 'asc';
      setRows(cur => [...cur].sort((a, b) => {
        const av = String(a[colId] ?? '').toLowerCase();
        const bv = String(b[colId] ?? '').toLowerCase();
        return (av < bv ? -1 : av > bv ? 1 : 0) * (dir === 'asc' ? 1 : -1);
      }));
      return { col: colId, dir };
    });
  }, []);

  // ── Bulk assign ─────────────────────────────────────────────────────────────
  const handleBulkApply = useCallback(() => {
    if (!bulkCol || !bulkValue) return;
    setRows(prev => prev.map(row => {
      if (!selectedRows.has(row._id)) return row;
      const next: GridRow = { ...row, [bulkCol]: bulkValue };
      if (bulkCol === 'tipo_vehiculo') {
        const uso = USO_DEFAULT[bulkValue];
        if (uso) next['uso'] = uso;
        if (bulkValue === 'Semirremolque' || bulkValue === 'Industrial no matriculado') next['lunas'] = 'No';
      }
      return next;
    }));
    setSelectedRows(new Set());
    setBulkCol(''); setBulkValue('');
  }, [bulkCol, bulkValue, selectedRows]);

  // ── Delete / Add filas ──────────────────────────────────────────────────────
  const deleteRow = useCallback((rowId: number) => {
    setRows(prev => prev.filter(r => r._id !== rowId));
    setSelectedRows(prev => { const n = new Set(prev); n.delete(rowId); return n; });
  }, []);

  const addRows = useCallback((n: number) => {
    setRows(prev => {
      const nextId = prev.length > 0 ? Math.max(...prev.map(r => r._id)) + 1 : 0;
      return [...prev, ...Array.from({ length: n }, (_, i) => emptyRow(nextId + i, colDefsRef.current))];
    });
  }, []);

  // ── Paste TSV desde Excel ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      const lines = text.split(/\r?\n/).filter(l => l.length > 0);
      if (lines.length === 1 && !lines[0].includes('\t')) return;

      e.preventDefault();
      const pasteData = lines.map(l => l.split('\t'));
      const anchor = anchorPosRef.current;
      if (!anchor) return;

      setRows(prev => {
        const next = prev.map(r => ({ ...r }));
        pasteData.forEach((pasteRow, ro) => {
          const ri = anchor.rowIdx + ro;
          if (ri >= next.length) return;
          pasteRow.forEach((raw, co) => {
            const col = colDefsRef.current[anchor.colIdx + co];
            if (!col || col.isComputed) return;
            let val = raw.trim();
            if (col.normalizeFn && val) val = col.normalizeFn(val).value;
            next[ri][col.id] = val;
          });
          const tipo = String(next[ri]['tipo_vehiculo'] ?? '');
          if (tipo && USO_DEFAULT[tipo]) next[ri]['uso'] = USO_DEFAULT[tipo];
          if (tipo === 'Semirremolque' || tipo === 'Industrial no matriculado') next[ri]['lunas'] = 'No';
        });
        return next;
      });
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);

  // ── Imperative handle ───────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    getData: () => rowsRef.current.map(rowToRecord),
    setData: (data) => {
      setSortConfig(null);
      setRows(data.map((r, i) => ({ ...emptyRow(i, colDefs), ...r })));
      setSelectedRows(new Set()); setAnchorPos(null); setSelectionEnd(null);
    },
    toRows: () => rowsRef.current.map(row => {
      const rec = rowToRecord(row);
      for (const col of colDefs) if (col.isComputed && col.computeFn) rec[col.id] = col.computeFn(rec);
      return rec;
    }),
    getColDefs: () => colDefs,
  }));

  // ── Import / Export ─────────────────────────────────────────────────────────
  const handleImportFile = useCallback(async (file: File) => {
    const result = await parseExcelTemplate(file);
    if (result.rows.length === 0) return;
    const dr = result.rows.map((r, i) => ({ ...emptyRow(i, colDefs), ...r }));
    setRows([...dr, ...Array.from({ length: EMPTY_ROWS_PADDING }, (_, i) => emptyRow(dr.length + i, colDefs))]);
    setSelectedRows(new Set()); setAnchorPos(null); setSelectionEnd(null);
  }, [colDefs]);

  const handleDownloadExcel = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('TRABAJO');
    const dataCols = colDefs.filter(c => !c.isComputed);
    ws.columns = dataCols.map(c => ({ header: c.name.toUpperCase(), key: c.id, width: Math.max(c.width / 7, 10) }));
    const hr = ws.getRow(1);
    hr.height = 22;
    hr.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1240CC' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    rows.filter(r => dataCols.some(c => String(r[c.id] ?? '').trim())).forEach((row, ri) => {
      const r = ws.addRow(dataCols.map(c => String(row[c.id] ?? '')));
      r.height = 16;
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
        cell.font = { name: 'Calibri', size: 9 };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } }, right: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'TRABAJO.xlsx'; a.click();
    URL.revokeObjectURL(url);
  }, [rows, colDefs]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (--dragCounterRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0; setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && ['xlsx', 'csv'].includes(file.name.split('.').pop()?.toLowerCase() ?? '')) handleImportFile(file);
  }, [handleImportFile]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const filledCount = rows.filter(r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim())).length;
  const allChecked  = rows.length > 0 && selectedRows.size === rows.length;

  return (
    <div className="flex flex-col h-full min-h-0" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0, gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
          <span style={{ color: '#1240CC' }}>{filledCount}</span> vehículos
          {normRange && (normRange.r2 > normRange.r1 || normRange.c2 > normRange.c1) && (
            <span style={{ marginLeft: 8, color: '#9ca3af' }}>
              · {normRange.r2 - normRange.r1 + 1} filas × {normRange.c2 - normRange.c1 + 1} cols seleccionadas
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, background: 'rgba(18,64,204,0.07)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Importar
          </button>
          <button onClick={handleDownloadExcel}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 7, background: 'rgba(18,64,204,0.07)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar
          </button>
          <button onClick={() => addRows(10)}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: 'rgba(18,64,204,0.07)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer' }}>+ 10</button>
          <button onClick={() => addRows(50)}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, background: 'rgba(18,64,204,0.07)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer' }}>+ 50</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* ── Tabla ── */}
      <div
        className="flex-1 min-h-0"
        style={{ overflowY: 'auto', overflowX: 'auto', position: 'relative' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(18,64,204,0.08)', border: '2px dashed #1240CC', borderRadius: 8, pointerEvents: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1240CC' }}>Soltar .xlsx o .csv para importar</span>
          </div>
        )}

        <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1240CC', position: 'sticky', top: 0, zIndex: 5 }}>
              <th style={{ width: 36, padding: '0 4px', position: 'sticky', left: 0, background: '#1240CC', zIndex: 6 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAllCheck} style={{ cursor: 'pointer', accentColor: '#fff' }} />
              </th>
              <th style={{ width: 36, position: 'sticky', left: 36, background: '#1240CC', zIndex: 6, borderRight: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 10, fontWeight: 700 }}>#</th>
              {colDefs.map(col => {
                const isActive = sortConfig?.col === col.id;
                return (
                  <th key={col.id}
                    onClick={() => !col.isComputed && handleSort(col.id)}
                    style={{ minWidth: col.width, maxWidth: col.width, padding: '8px 6px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase', cursor: col.isComputed ? 'default' : 'pointer', background: col.isComputed ? 'rgba(255,255,255,0.06)' : undefined, userSelect: 'none', borderRight: '1px solid rgba(255,255,255,0.12)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {col.name}
                      {!col.isComputed && <span style={{ opacity: isActive ? 1 : 0.25, fontSize: 8 }}>{isActive && sortConfig!.dir === 'desc' ? '▼' : '▲'}</span>}
                    </span>
                  </th>
                );
              })}
              <th style={{ width: 32, background: '#1240CC' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <TableRow
                key={row._id}
                row={row}
                rowIdx={rowIdx}
                colDefs={colDefs}
                rowChecked={selectedRows.has(row._id)}
                normRange={normRange}
                anchorPos={anchorPos}
                fillHandlePos={fillHandlePos}
                fillTargetRange={fillTargetRange}
                onToggleCheck={toggleRowCheck}
                onCellFocus={handleCellFocus}
                onCellChange={applyChange}
                onCellBlur={applyChange}
                onCellMouseDown={handleCellMouseDown}
                onCellMouseEnter={handleCellMouseEnter}
                onFillMouseDown={handleFillMouseDown}
                onDelete={deleteRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bulk assign ── */}
      {selectedRows.size >= 2 && (
        <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(5,12,40,0.97)', borderTop: '1px solid rgba(18,64,204,0.4)', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(178,198,245,0.8)', whiteSpace: 'nowrap' }}>{selectedRows.size} filas</span>
          <select value={bulkCol} onChange={e => { setBulkCol(e.target.value); setBulkValue(''); }}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: bulkCol ? '#fff' : 'rgba(178,198,245,0.5)', outline: 'none', cursor: 'pointer' }}>
            <option value="">— campo —</option>
            {bulkColOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {bulkCol && (
            <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
              style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: bulkValue ? '#fff' : 'rgba(178,198,245,0.5)', outline: 'none', cursor: 'pointer' }}>
              <option value="">— valor —</option>
              {DROPDOWN_OPTS[bulkCol].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <button onClick={handleBulkApply} disabled={!bulkCol || !bulkValue}
            style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 6, background: bulkCol && bulkValue ? '#1240CC' : 'rgba(18,64,204,0.3)', color: '#fff', border: 'none', cursor: bulkCol && bulkValue ? 'pointer' : 'not-allowed' }}>
            Aplicar
          </button>
          <button onClick={() => { setSelectedRows(new Set()); setBulkCol(''); setBulkValue(''); }}
            style={{ fontSize: 16, lineHeight: 1, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 6px', marginLeft: 'auto' }}>×</button>
        </div>
      )}

      {/* ── Añadir filas ── */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0', flexShrink: 0, borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <button onClick={() => addRows(10)}
          style={{ fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 7, background: 'rgba(18,64,204,0.07)', color: '#1240CC', border: '1px solid rgba(18,64,204,0.2)', cursor: 'pointer' }}>
          + Añadir 10 filas
        </button>
      </div>
    </div>
  );
});

export default FlotaGrid;
