"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  listarCarpetas, listarCorredores,
  cargarCarpetasDelServidor, cargarCorredoresDelServidor,
  type FlotaCarpeta, type Corredor,
} from '@/core/flotas';
import { EstadoBadge } from './CarpetaScreen';

interface Props {
  onSelect: (carpeta: FlotaCarpeta) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diasHastaVencimiento(fechaStr?: string): number | null {
  if (!fechaStr) return null;
  const parts = fechaStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const fecha = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((fecha.getTime() - today.getTime()) / 86400000);
}

function vencColor(dias: number | null): string {
  if (dias === null) return 'rgba(178,198,245,0.55)';
  if (dias < 0)  return '#f87171';
  if (dias < 30) return '#fb923c';
  if (dias < 90) return '#fbbf24';
  return '#34d399';
}

// ─── FlotasContratadas ────────────────────────────────────────────────────────

export default function FlotasContratadas({ onSelect }: Props) {
  const [carpetas, setCarpetas]     = useState<FlotaCarpeta[]>([]);
  const [corredores, setCorredores] = useState<Corredor[]>([]);
  const [query, setQuery]           = useState('');
  const [estadoFilter, setEstadoFilter] = useState('CONTRATADA');
  const [uploading, setUploading]   = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    try {
      const [c, corr] = await Promise.all([
        cargarCarpetasDelServidor(),
        cargarCorredoresDelServidor(),
      ]);
      setCarpetas(c);
      setCorredores(corr);
    } catch {
      setCarpetas(listarCarpetas());
      setCorredores(listarCorredores());
    }
  };

  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const corredorMap = useMemo(() => {
    const m = new Map<string, Corredor>();
    corredores.forEach(c => m.set(c.id, c));
    return m;
  }, [corredores]);

  const counts = useMemo(() => ({
    TODAS:       carpetas.length,
    CONTRATADA:  carpetas.filter(c => c.estado === 'CONTRATADA').length,
    'EN ESTUDIO': carpetas.filter(c => c.estado === 'EN ESTUDIO').length,
    OFERTADA:    carpetas.filter(c => c.estado === 'OFERTADA').length,
    RECHAZADA:   carpetas.filter(c => c.estado === 'RECHAZADA').length,
  }), [carpetas]);

  const filtered = useMemo(() => {
    return carpetas
      .filter(c => {
        if (estadoFilter !== 'TODAS' && c.estado !== estadoFilter) return false;
        const q = query.trim().toLowerCase();
        if (q) {
          const cif     = (c.header?.cif     ?? '').toLowerCase();
          const tomador = (c.header?.tomador ?? '').toLowerCase();
          const nombre  = c.nombre.toLowerCase();
          const corrNom = (corredorMap.get(c.corredor_id ?? '')?.nombre ?? '').toLowerCase();
          if (!nombre.includes(q) && !cif.includes(q) && !tomador.includes(q) && !corrNom.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const va = a.header?.fechaVencimiento ?? '';
        const vb = b.header?.fechaVencimiento ?? '';
        if (va && vb) return va.localeCompare(vb);
        if (va) return -1;
        if (vb) return 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [carpetas, query, estadoFilter, corredorMap]);

  // ─── Descargar plantilla ──────────────────────────────────────────────────

  const handleDescargarPlantilla = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const headers = [
      'nombre', 'cif', 'tomador', 'actividad',
      'corredor', 'comision', 'forma_pago', 'periodicidad',
      'fecha_inicio', 'fecha_vencimiento', 'poliza_actual', 'cia_actual',
      'observaciones', 'estado',
    ];
    const example = [
      'TRANSPORTES GARCIA SL', 'B12345678', 'Transportes Garcia SL', 'Transporte de mercancías',
      'MEDIACION MADRID', '10', 'Domiciliación', 'anual',
      '01/01/2026', '31/12/2026', 'P-2024-001', 'MAPFRE',
      'Renovación acordada', 'CONTRATADA',
    ];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Flotas');
    ws.columns = headers.map(() => ({ width: 24 }));
    const hr = ws.addRow(headers);
    hr.height = 22;
    hr.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1240CC' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    const er = ws.addRow(example);
    er.eachCell(cell => {
      cell.font = { color: { argb: 'FFAAAAAA' }, name: 'Calibri', size: 10, italic: true };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'Plantilla_Importar_Flotas.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Upload Excel ─────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/flotas/importar', { method: 'POST', body: fd });
      const json = await res.json();
      setUploadResult(json);
      await cargar();
    } catch {
      setUploadResult({ created: 0, updated: 0, errors: ['Error al subir el archivo'] });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '24px 28px', height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 4, height: 40, borderRadius: 2, marginTop: 2, background: 'linear-gradient(180deg, #059669, #10b981)', boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: '#FFFFFF', fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.01em' }}>Flotas</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>
              {counts.CONTRATADA} contratada{counts.CONTRATADA !== 1 ? 's' : ''} · {counts['EN ESTUDIO']} en estudio
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDescargarPlantilla} style={{
            background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
            borderRadius: 10, padding: '8px 16px', color: '#BDD4FF', fontSize: 12, cursor: 'pointer', fontWeight: 500,
          }}>
            Plantilla Excel
          </button>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(135deg, #059669, #10b981)',
            border: 'none', borderRadius: 10, padding: '8px 20px',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.7 : 1,
            boxShadow: '0 0 20px rgba(16,185,129,0.3)',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            {uploading ? 'Importando...' : 'Subir flotas'}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div style={{
          padding: '10px 16px', borderRadius: 10,
          background: uploadResult.errors.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${uploadResult.errors.length > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: uploadResult.errors.length > 0 ? '#f87171' : '#34d399', fontWeight: 600 }}>
            {uploading ? 'Procesando...' : `${uploadResult.created} creadas · ${uploadResult.updated} actualizadas${uploadResult.errors.length > 0 ? ` · ${uploadResult.errors.length} error${uploadResult.errors.length > 1 ? 'es' : ''}` : ''}`}
          </span>
          {uploadResult.errors.slice(0, 3).map((e, i) => (
            <span key={i} style={{ fontSize: 11, color: '#f87171' }}>· {e}</span>
          ))}
          {uploadResult.errors.length > 3 && (
            <span style={{ fontSize: 11, color: '#f87171' }}>+{uploadResult.errors.length - 3} más</span>
          )}
          <button onClick={() => setUploadResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(178,198,245,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(6,14,50,0.5)', border: '1px solid rgba(61,112,255,0.22)',
          borderRadius: 10, padding: '0 14px', flex: 1, maxWidth: 340,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(70,120,255,0.5)" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input placeholder="Buscar por nombre, CIF, tomador, corredor..."
            value={query} onChange={e => setQuery(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', color: '#FFFFFF', fontSize: 12, padding: '8px 0', width: '100%' }} />
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.5)' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Estado pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          ['CONTRATADA', 'Contratadas'],
          ['TODAS', 'Todas'],
          ['EN ESTUDIO', 'En estudio'],
          ['OFERTADA', 'Ofertadas'],
          ['RECHAZADA', 'Rechazadas'],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setEstadoFilter(k)} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: estadoFilter === k ? 'rgba(16,185,129,0.2)' : 'rgba(6,14,50,0.5)',
            color: estadoFilter === k ? '#10b981' : 'rgba(178,198,245,0.6)',
            boxShadow: estadoFilter === k ? '0 0 0 1px rgba(16,185,129,0.4) inset' : 'none',
            transition: 'all 180ms',
          }}>{l} <span style={{ opacity: 0.6 }}>({counts[k] ?? 0})</span></button>
        ))}
      </div>

      {/* Aviso vencimientos próximos */}
      {(() => {
        const proximas = carpetas.filter(c => c.estado === 'CONTRATADA' && (() => { const d = diasHastaVencimiento(c.header?.fechaVencimiento); return d !== null && d >= 0 && d <= 60; })());
        if (proximas.length === 0) return null;
        return (
          <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>!</span>
            <span style={{ fontSize: 12, color: '#fbbf24' }}>
              {proximas.length} flota{proximas.length > 1 ? 's' : ''} vence{proximas.length === 1 ? '' : 'n'} en menos de 60 días: {proximas.slice(0, 3).map(c => c.nombre).join(', ')}{proximas.length > 3 ? `... y ${proximas.length - 3} más` : ''}
            </span>
          </div>
        );
      })()}

      {/* Tabla */}
      <div style={{ background: 'rgba(12,28,82,0.42)', border: '1px solid rgba(61,112,255,0.16)', borderRadius: 16, overflowX: 'auto' }}>
        <div style={{ minWidth: 900 }}>
          {/* Cabecera */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 130px 90px 110px 110px 70px 110px',
            padding: '10px 18px',
            borderBottom: '1px solid rgba(51,102,255,0.15)',
            background: 'rgba(6,14,50,0.4)',
          }}>
            {['Nombre / CIF', 'Corredor', 'Forma Pago', 'Periodicidad', 'F. Inicio', 'F. Vencimiento', 'Comis.', 'Estado'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#10b981' }}>{h}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p style={{ color: 'rgba(178,198,245,0.4)', fontSize: 12, textAlign: 'center', padding: '48px 0', margin: 0 }}>
              {carpetas.length === 0
                ? 'Sin flotas. Descarga la plantilla, rellénala y súbela.'
                : 'Sin resultados para ese filtro.'}
            </p>
          ) : filtered.map(c => {
            const corr = c.corredor_id ? corredorMap.get(c.corredor_id) : null;
            const dias = diasHastaVencimiento(c.header?.fechaVencimiento);
            const color = vencColor(dias);

            return (
              <div key={c.id}
                onClick={() => onSelect(c)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr 130px 90px 110px 110px 70px 110px',
                  alignItems: 'center', padding: '11px 18px',
                  borderBottom: '1px solid rgba(61,112,255,0.07)',
                  cursor: 'pointer', transition: 'background 180ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                {/* Nombre / CIF */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 13, color: '#FFFFFF', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || '(sin nombre)'}</span>
                  {(c.header?.cif || c.header?.tomador) && (
                    <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.5)' }}>
                      {c.header.cif && <span style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>{c.header.cif}</span>}
                      {c.header.cif && c.header.tomador && <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>}
                      {c.header.tomador && <span>{c.header.tomador}</span>}
                    </span>
                  )}
                </div>

                {/* Corredor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color: '#BDD4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {corr?.nombre ?? <span style={{ color: 'rgba(178,198,245,0.3)' }}>—</span>}
                  </span>
                  {corr?.comercial && <span style={{ fontSize: 10, color: 'rgba(178,198,245,0.4)' }}>{corr.comercial}</span>}
                </div>

                {/* Forma pago */}
                <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.7)' }}>{c.header?.formaPago || '—'}</span>

                {/* Periodicidad */}
                <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.7)', textTransform: 'capitalize' }}>{c.header?.periodicidad || '—'}</span>

                {/* F.Inicio */}
                <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.6)' }}>{c.header?.fechaInicio || '—'}</span>

                {/* F.Vencimiento */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color, fontWeight: dias !== null && dias < 90 ? 700 : 400 }}>{c.header?.fechaVencimiento || '—'}</span>
                  {dias !== null && (
                    <span style={{ fontSize: 9, fontWeight: 700, color }}>
                      {dias < 0 ? `Vencida ${Math.abs(dias)}d` : `${dias}d`}
                    </span>
                  )}
                </div>

                {/* Comisión */}
                <span style={{ fontSize: 12, color: 'rgba(178,198,245,0.7)' }}>
                  {corr ? `${corr.porcentajeComision}%` : c.porcentajeComision ? `${c.porcentajeComision}%` : '—'}
                </span>

                {/* Estado */}
                <EstadoBadge estado={c.estado} small />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
