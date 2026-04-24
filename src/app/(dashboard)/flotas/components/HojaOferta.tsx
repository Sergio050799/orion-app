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
  header?: { cif: string; tomador: string; actividad: string; formaPago: string; efecto: string };
  carpetaNombre?: string;
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
  { trabajoRows, header, carpetaNombre, onDataChange },
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

  // ─── Generar Oferta Excel ──────────────────────────────────────────────────
  const handleExportOferta = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Oferta');

    // Colores corporativos
    const indigo = '6366F1';
    const headerBg = 'EEF2FF';
    const grayBg = 'F9FAFB';
    const borderColor = 'D1D5DB';

    // Cabecera
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'OFERTA DE SEGURO DE FLOTAS — ORION';
    titleCell.font = { bold: true, size: 14, color: { argb: indigo } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:H2');
    const subtitleCell = ws.getCell('A2');
    subtitleCell.value = `${carpetaNombre ?? 'Sin nombre'} — ${new Date().toLocaleDateString('es-ES')}`;
    subtitleCell.font = { size: 10, color: { argb: '6B7280' } };
    subtitleCell.alignment = { horizontal: 'center' };

    // Datos empresa
    if (header) {
      ws.getCell('A4').value = 'CIF:';
      ws.getCell('B4').value = header.cif;
      ws.getCell('A5').value = 'Tomador:';
      ws.getCell('B5').value = header.tomador;
      ws.getCell('A6').value = 'Actividad:';
      ws.getCell('B6').value = header.actividad;
      for (let r = 4; r <= 6; r++) {
        ws.getCell(`A${r}`).font = { bold: true, size: 10, color: { argb: '374151' } };
        ws.getCell(`B${r}`).font = { size: 10, color: { argb: '111827' } };
      }
    }

    // Tabla de vehículos
    const startRow = header ? 8 : 4;
    const headers = ['Matrícula', 'Marca / Modelo', 'Tipo Vehículo', 'Coberturas', 'Ámbito', 'FRQ', 'Prima MMT'];
    const headerRow = ws.getRow(startRow);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: '374151' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
      cell.border = { bottom: { style: 'thin', color: { argb: borderColor } } };
      cell.alignment = { horizontal: i >= 5 ? 'right' : 'left', vertical: 'middle' };
    });
    headerRow.height = 22;

    rows.forEach((r, idx) => {
      const row = ws.getRow(startRow + 1 + idx);
      const vals = [r.matricula, r.marca_modelo, r.tipo_vehiculo, r.coberturas, r.ambito, r.frq, r.oferta_prima_mmt];
      vals.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        if (i === 6 && v) {
          cell.value = parseFloat(v) || 0;
          cell.numFmt = '#,##0" €"';
        } else {
          cell.value = v;
        }
        cell.font = { size: 10, color: { argb: '111827' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFF' : grayBg } };
        cell.border = { bottom: { style: 'hair', color: { argb: borderColor } } };
        cell.alignment = { horizontal: i >= 5 ? 'right' : 'left', vertical: 'middle' };
      });
    });

    // Fila total
    const totalRow = ws.getRow(startRow + 1 + rows.length);
    totalRow.getCell(1).value = 'TOTAL FLOTA';
    totalRow.getCell(1).font = { bold: true, size: 11, color: { argb: indigo } };
    totalRow.getCell(7).value = primaTotal;
    totalRow.getCell(7).numFmt = '#,##0" €"';
    totalRow.getCell(7).font = { bold: true, size: 11, color: { argb: '111827' } };
    for (let i = 1; i <= 7; i++) {
      totalRow.getCell(i).border = { top: { style: 'medium', color: { argb: indigo } } };
      totalRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
    }

    // Column widths
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 20;
    ws.getColumn(4).width = 26;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 10;
    ws.getColumn(7).width = 14;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Oferta_${carpetaNombre ?? 'flota'}_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, primaTotal, header, carpetaNombre]);

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
          {rows.length > 0 && (
            <button onClick={handleExportOferta}
              style={{ fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 6, background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.25)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(22,163,74,0.1)')}>
              Generar Oferta
            </button>
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
