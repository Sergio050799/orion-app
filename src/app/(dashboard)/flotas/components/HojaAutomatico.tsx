"use client";

import React, { useState, useRef, useMemo } from 'react';
import { generarPlantillaExcel } from '@/core/flotas/plantilla';
import { normalizeTipoVehiculo, TIPO_VEHICULO_OPTS } from '@/core/flotas/normalizador';
import type { FlotaHeader } from './types';
import { EstadoBadge } from './CarpetaScreen';
import SilverdatModal from '@/components/saas/SilverdatModal';
import { nf, eur2, dec } from '@/lib/fmt';
import { listarCarpetas, listarCorredores, type FlotaCarpeta } from '@/core/flotas';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SilverdatVehicle {
    matricula: string;
    vin?: string;
    marca?: string;
    modelo?: string;
    version?: string;
    combustible?: string;
    kw?: number;
    cv?: number;
    cilindrada?: number;
    plazas?: number;
    puertas?: number;
    anyo_fabricacion?: string;
    anyo_fab_fuente?: string;
    fecha_matriculacion?: string;
    tara?: number;
    tipo_vehiculo?: string;
    etiqueta_dgt?: string;
    co2?: number;
    euro?: string;
    precio_nuevo?: number;
    valor_venta?: number;
    valor_compra?: number;
    num_titulares?: number;
    servicio?: string;
    tipo_alimentacion?: string;
}

interface ProcessedVehicle {
    matricula: string;
    marca: string;
    modelo: string;
    tipo_vehiculo: string;
    kw: number;
    cv: number;
    combustible: string;
    fecha_matriculacion: string;
    anyo_fabricacion: string;
    /** origen del año: 'fabricacion' (real) o 'matriculacion' (sustituto); vacío si no hay año */
    anyo_fab_fuente?: string;
    cif_nif: string;
    tomador: string;
    fecha_vencimiento: string;
    cia_actual: string;
    num_poliza_actual: string;
    uso: string;
    adr: string;
    ambito: string;
    coberturas_solicitadas: string;
    lunas: string;
    frq: string;
    asistencia: string;
    prima_referencia: string;   // from Excel (individual prima per vehicle)
    // Silverdat extras
    vin: string;
    etiqueta_dgt: string;
    euro: string;
    co2: string;
    precio_nuevo: number;
    valor_venta: number;
    // Catalog
    id_veh?: string;
    sd_ok: boolean;
}

interface ProgressState {
    current: number;
    total: number;
    log: { plate: string; ok: boolean; marca?: string; modelo?: string; fromCache?: boolean }[];
}

interface Props {
    header: FlotaHeader;
    carpetaActiva: FlotaCarpeta | null;
    onComplete: (rows: Record<string, string>[]) => void;
    onVehiclesProcessed?: (vehicles: ProcessedVehicle[]) => void;
    onHeaderUpdate?: (header: Partial<FlotaHeader>) => void;
}

type ProcessMode = 'con' | 'sin';


// ─── Step 3: Offer builder ────────────────────────────────────────────────────

function Step3({
    vehicles,
    onComplete,
    onBack,
    polizaMap,
}: {
    vehicles: ProcessedVehicle[];
    onComplete: (rows: Record<string, string>[]) => void;
    onBack: () => void;
    polizaMap?: Record<string, string>;
}) {
    const [globalDiscount, setGlobalDiscount] = useState('0');
    const [tipoOverrides, setTipoOverrides] = useState<Record<string, string>>({});
    const [bulkFrom, setBulkFrom] = useState('');
    const [bulkTo, setBulkTo] = useState('');

    const discount = Math.max(0, Math.min(100, parseFloat(globalDiscount) || 0));

    const effectiveTipo = (v: ProcessedVehicle) =>
        tipoOverrides[v.matricula] || v.tipo_vehiculo || '';

    // Group by tipo + cobertura from Excel (no default — respect what the Excel has)
    const groups = useMemo(() => {
        const result: Record<string, { tipo: string; cob: string; vehList: ProcessedVehicle[] }> = {};
        for (const v of vehicles) {
            const t = tipoOverrides[v.matricula] || v.tipo_vehiculo || '';
            const c = v.coberturas_solicitadas || '';
            const key = `${t}||${c}`;
            if (!result[key]) result[key] = { tipo: t, cob: c, vehList: [] };
            result[key].vehList.push(v);
        }
        return result;
    }, [vehicles, tipoOverrides]);

    const cleanPoliza = (p: string) => p.replace(/[\s\-\.\/]/g, '');

    const handleApply = () => {
        const rows: Record<string, string>[] = vehicles.map(v => {
            const prima = parseFloat(v.prima_referencia || '0') || 0;
            const finalPrima = prima * (1 - discount / 100);
            const polizaRaw = v.num_poliza_actual || polizaMap?.[v.matricula] || '';
            return {
                matricula: v.matricula,
                marca: v.marca,
                modelo: v.modelo,
                tipo_vehiculo: effectiveTipo(v) || 'Turismo',
                kw: v.kw > 0 ? String(v.kw) : '',
                cv: v.cv > 0 ? String(v.cv) : '',
                cif_nif: v.cif_nif,
                tomador: v.tomador,
                cia_actual: v.cia_actual,
                num_poliza_actual: cleanPoliza(polizaRaw),
                fecha_vencimiento: v.fecha_vencimiento,
                uso: v.uso,
                adr: v.adr,
                ambito: v.ambito,
                coberturas_solicitadas: v.coberturas_solicitadas,
                lunas: v.lunas,
                frq: v.frq,
                asistencia: v.asistencia,
                prima_referencia: finalPrima > 0 ? finalPrima.toFixed(2) : '',
                vin: v.vin,
                fecha_matriculacion: v.fecha_matriculacion,
                anyo_fabricacion: v.anyo_fabricacion || '',
                anyo_fab_fuente: v.anyo_fabricacion ? (v.anyo_fab_fuente || 'fabricacion') : '',
                combustible: v.combustible,
                etiqueta_dgt: v.etiqueta_dgt,
                euro: v.euro,
                co2: v.co2,
            };
        });
        onComplete(rows);
    };

    // Total uses individual vehicle primas from Excel
    const totalPrima = vehicles.reduce((sum, v) => {
        return sum + (parseFloat(v.prima_referencia || '0') || 0) * (1 - discount / 100);
    }, 0);

    const sdOkCount = vehicles.filter(v => v.sd_ok).length;

    const sinTipo = vehicles.filter(v => !effectiveTipo(v)).length;
    const presentTypes = Array.from(new Set(vehicles.map(v => effectiveTipo(v)))).sort();
    const applyBulk = () => {
        if (!bulkTo) return;
        setTipoOverrides(prev => {
            const next = { ...prev };
            vehicles.forEach(v => {
                const cur = tipoOverrides[v.matricula] || v.tipo_vehiculo || '';
                if (bulkFrom === '' ? !cur : cur === bulkFrom) {
                    next[v.matricula] = bulkTo;
                }
            });
            return next;
        });
        setBulkFrom('');
        setBulkTo('');
    };

    return (
        <div className="s3">
            <div className="sh" style={{ marginBottom: 8 }}>
                <div>
                    <h2 style={{ fontSize: 22 }}>Confirmar oferta</h2>
                    <p>{nf(vehicles.length)} vehículos · primas y coberturas del Excel</p>
                </div>
            </div>

            {/* Resumen */}
            <div className="stat3">
                <div><label>Vehículos</label><strong>{nf(vehicles.length)}</strong></div>
                <div><label>Con Silverdat</label><strong>{nf(sdOkCount)}</strong></div>
                <div><label>Sin tipo</label><strong>{nf(sinTipo)}</strong></div>
                <div><label>Grupos</label><strong>{nf(Object.keys(groups).length)}</strong></div>
            </div>

            {/* Tipos pendientes */}
            {sinTipo > 0 && (
                <div className="notice">
                    <span className="ttl">Faltan tipos de vehículo: asígnalos antes de continuar</span>
                    <div className="s3list">
                        {vehicles.filter(v => !effectiveTipo(v)).map(v => (
                            <div key={v.matricula} className="rowline between">
                                <span><b className="strong" style={{ fontFamily: 'ui-monospace,Menlo,monospace' }}>{v.matricula}</b>{v.marca ? ` · ${v.marca} ${v.modelo}` : ''}</span>
                                <select className="select" aria-label={`Tipo de ${v.matricula}`} value={tipoOverrides[v.matricula] || ''}
                                    onChange={e => setTipoOverrides(prev => ({ ...prev, [v.matricula]: e.target.value }))}>
                                    <option value="">Seleccionar tipo</option>
                                    {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Cambio masivo · descuento · total (misma rejilla de tres columnas que el inicio del paso) */}
            <div className="tri s3tri">
                <div>
                    <h3>Cambio masivo de tipología</h3>
                    <p>Cambia de golpe el tipo de todos los vehículos de un tipo, o asígnalo a los que no lo tienen.</p>
                    <div className="adj">
                        <div className="fld">
                            <label htmlFor="bk_from">De</label>
                            <select id="bk_from" className="select" value={bulkFrom} onChange={e => setBulkFrom(e.target.value)}>
                                <option value="">Sin tipo</option>
                                {presentTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="fld">
                            <label htmlFor="bk_to">A</label>
                            <select id="bk_to" className="select" value={bulkTo} onChange={e => setBulkTo(e.target.value)}>
                                <option value="">Tipo nuevo</option>
                                {TIPO_VEHICULO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <button className="mini pri" onClick={applyBulk} disabled={!bulkTo}>Aplicar</button>
                    </div>
                </div>
                <div>
                    <h3>Descuento global</h3>
                    <p>Se aplica a la prima de todos los grupos.</p>
                    <div className="adj">
                        <div className="fld">
                            <label htmlFor="s3_desc">Descuento (%)</label>
                            <input id="s3_desc" className="inp" type="number" min="0" max="100" step="0.5"
                                value={globalDiscount} onChange={e => setGlobalDiscount(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div>
                    <h3>Prima total</h3>
                    <p>{discount > 0 ? `Con un descuento del ${dec(discount, 1)} %.` : 'Sin descuento aplicado.'}</p>
                    <div className="tot s3tot">
                        <div><strong>{eur2(totalPrima)}</strong></div>
                    </div>
                </div>
            </div>

            {/* Resumen por grupo (tipo + cobertura del Excel) */}
            <h3 className="s3h">Resumen por tipología y cobertura</h3>
            <div className="dg-scroll">
                <table className="tbl">
                    <thead>
                        <tr><th>Tipología</th><th>Cobertura</th><th>Veh.</th><th>Prima media por vehículo</th><th>Total del grupo</th></tr>
                    </thead>
                    <tbody>
                        {Object.entries(groups).map(([key, g]) => {
                            const groupPrimas = g.vehList.map(v => parseFloat(v.prima_referencia || '0') || 0);
                            const avgPrima = groupPrimas.length > 0 ? groupPrimas.reduce((s, p) => s + p, 0) / groupPrimas.length : 0;
                            const totalGrupo = groupPrimas.reduce((s, p) => s + p, 0) * (1 - discount / 100);
                            return (
                                <tr key={key}>
                                    <td style={{ textAlign: 'left' }}>
                                        <div style={{ fontWeight: 600, color: g.tipo ? 'var(--text)' : 'var(--warn)' }}>{g.tipo || 'Sin tipo'}</div>
                                        <div className="muted">{g.vehList.map(v => v.matricula).slice(0, 3).join(', ')}{g.vehList.length > 3 ? ` y ${nf(g.vehList.length - 3)} más` : ''}</div>
                                    </td>
                                    <td>{g.cob || '—'}</td>
                                    <td>{nf(g.vehList.length)}</td>
                                    <td>{avgPrima > 0 ? eur2(avgPrima) : '—'}</td>
                                    <td>{totalGrupo > 0 ? eur2(totalGrupo) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Actions */}
            <div className="s3act">
                <button className="btn ghost" onClick={onBack}>Volver</button>
                <button className="btn" onClick={handleApply}>Aplicar a Trabajo y continuar</button>
            </div>
        </div>
    );
}

// ─── Tipo helpers ─────────────────────────────────────────────────────────────

// Matrículas españolas empezando por R = remolque/semirremolque
function inferTipoFromMat(matricula: string): string {
    return /^R\d/i.test(matricula.replace(/[^a-zA-Z0-9]/g, '')) ? 'Remolque' : '';
}

// ─── Conversor sin Silverdat ──────────────────────────────────────────────────

function rowsToVehicles(rows: Record<string, string>[]): ProcessedVehicle[] {
    const NO_LUNAS = new Set(['semirremolque', 'industrial no matriculado']);
    return rows
        .filter(r => r['matricula']?.trim())
        .map(r => {
            const mat = r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            const tipoRaw = r['tipo_vehiculo'] || inferTipoFromMat(mat);
            const tipo = normalizeTipoVehiculo(tipoRaw) || '';
            const sinLunas = NO_LUNAS.has(tipo.toLowerCase());
            const kw = parseFloat(r['kw'] || '0') || 0;
            return {
                matricula: r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
                marca: r['marca'] || '',
                modelo: r['modelo'] || '',
                tipo_vehiculo: tipo,
                kw,
                cv: parseFloat(r['cv'] || '0') || (kw > 0 ? Math.round(kw * 1.35962) : 0),
                combustible: r['combustible'] || '',
                fecha_matriculacion: r['fecha_matriculacion'] || '',
                anyo_fabricacion: r['anyo_fabricacion'] || '',
                anyo_fab_fuente: r['anyo_fabricacion'] ? (r['anyo_fab_fuente'] || 'fabricacion') : '',
                cif_nif: r['cif_nif'] || '',
                tomador: r['tomador'] || '',
                fecha_vencimiento: r['fecha_vencimiento'] || '',
                cia_actual: r['cia_actual'] || '',
                num_poliza_actual: r['num_poliza_actual'] || r['n_poliza_actual'] || '',
                uso: r['uso'] || 'Particular',
                adr: r['adr'] || 'No',
                ambito: r['ambito'] || r['ámbito'] || 'Nacional',
                coberturas_solicitadas: r['coberturas_solicitadas'] || '',
                lunas: sinLunas ? 'No' : (r['lunas'] || 'No'),
                frq: r['frq'] || '',
                asistencia: r['asistencia'] || 'no',
                prima_referencia: r['prima_referencia'] || r['prima referencia'] || '',
                vin: '',
                etiqueta_dgt: '',
                euro: '',
                co2: '',
                precio_nuevo: 0,
                valor_venta: 0,
                sd_ok: false,
            };
        });
}

// ─── HojaAutomatico ───────────────────────────────────────────────────────────

export default function HojaAutomatico({ header, carpetaActiva, onComplete, onVehiclesProcessed, onHeaderUpdate }: Props) {
    const savedVehicles = carpetaActiva?.automaticoVehicles as ProcessedVehicle[] | undefined;

    // ── Phase ──────────────────────────────────────────────────────────────────
    const [phase, setPhase] = useState<'input' | 'processing' | 'confirm'>(
        savedVehicles && savedVehicles.length > 0 ? 'confirm' : 'input'
    );

    // ── Upload state ───────────────────────────────────────────────────────────
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [uploadedRows, setUploadedRows] = useState<Record<string, string>[] | null>(null);
    const [parseError, setParseError] = useState('');
    const [mode, setMode] = useState<ProcessMode>('con');
    const [flotasMatch, setFlotasMatch] = useState<FlotaCarpeta[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const detectedHeaderRef = useRef<Partial<FlotaHeader>>({});

    // ── Silverdat state ────────────────────────────────────────────────────────
    const [progress, setProgress] = useState<ProgressState>({ current: 0, total: 0, log: [] });
    const [sdError, setSdError] = useState('');
    const [showSdModal, setShowSdModal] = useState(false);
    const [sdFinished, setSdFinished] = useState(false);
    const [cacheCount, setCacheCount] = useState(0);
    const abortRef = useRef(false);
    const allProcessedRef = useRef<ProcessedVehicle[]>([]);
    const failedRowsRef = useRef<Record<string, string>[]>([]);

    // ── Confirm state ──────────────────────────────────────────────────────────
    const [processedVehicles, setProcessedVehicles] = useState<ProcessedVehicle[]>(savedVehicles ?? []);

    const NO_LUNAS = new Set(['semirremolque', 'industrial no matriculado']);

    const polizaMap = useMemo<Record<string, string>>(() => {
        const map: Record<string, string> = {};
        for (const row of (uploadedRows ?? [])) {
            const mat = (row['matricula'] || '').trim().toUpperCase();
            if (!mat) continue;
            const pol = row['num_poliza_actual'] || row['n_poliza_actual'] || '';
            if (pol) map[mat] = pol;
        }
        return map;
    }, [uploadedRows]);

    const { duplicadas, seenCounts } = useMemo(() => {
        const seen = new Map<string, number>();
        (uploadedRows ?? []).forEach(r => {
            const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (mat) seen.set(mat, (seen.get(mat) ?? 0) + 1);
        });
        return {
            duplicadas: Array.from(seen.entries()).filter(([, n]) => n > 1).map(([m]) => m),
            seenCounts: seen,
        };
    }, [uploadedRows]);

    // ── Download ───────────────────────────────────────────────────────────────
    const handleDownload = async () => {
        setDownloadLoading(true);
        try {
            const blob = await generarPlantillaExcel(
                carpetaActiva ?? { nombre: header.tomador || 'Flota', header },
                listarCorredores().map(c => c.nombre),
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plantilla_${(carpetaActiva?.nombre || 'flota').replace(/[/\\:*?"<>|]/g, '')}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } finally { setDownloadLoading(false); }
    };

    // ── File parse ─────────────────────────────────────────────────────────────
    const handleFile = async (file: File) => {
        setParseError('');
        setUploadedRows(null);
        try {
            const XLSX = await import('xlsx');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];

            // Convierte celda a string: fechas → dd/mm/yyyy, resto → texto formateado de Excel
            type XlsxCell = { t?: string; v?: unknown; w?: string };
            const cellStr = (cell: XlsxCell | undefined): string => {
                if (!cell) return '';
                if (cell.t === 'd' && cell.v instanceof Date) {
                    return cell.v.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
                // Numeric cells: use raw value to avoid locale-formatted thousands separators
                if (cell.t === 'n') return String(cell.v ?? '');
                return (cell.w ?? String(cell.v ?? '')).trim();
            };

            // Data starts at row 6 (1-indexed), headers at row 5
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            const headers: string[] = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = ws[XLSX.utils.encode_cell({ r: 4, c })] as XlsxCell | undefined;
                const clave = cell ? String(cell.v).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : `col_${c}`;
                // La columna AÑO de la plantilla («a_o» al quitar la Ñ) es el año de fabricación del vehículo: va antes que el de Silverdat
                headers.push(/^(a_o|ano|anyo)$/.test(clave) ? 'anyo_fabricacion' : clave);
            }

            const rows: Record<string, string>[] = [];
            for (let r = 5; r <= range.e.r; r++) {
                const row: Record<string, string> = {};
                let hasData = false;
                for (let c = range.s.c; c <= range.e.c; c++) {
                    const cell = ws[XLSX.utils.encode_cell({ r, c })] as XlsxCell | undefined;
                    const val = cellStr(cell);
                    row[headers[c - range.s.c]] = val;
                    if (val) hasData = true;
                }
                if (hasData) rows.push(row);
            }

            const withPlate = rows.filter(r => r['matricula']?.trim());
            if (withPlate.length === 0) throw new Error('No se encontraron matrículas en la plantilla');

            const rawPer = cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 1 })] as XlsxCell).toLowerCase();
            const parsedPer = rawPer.includes('mensual') ? 'mensual' :
                              rawPer.includes('bimestral') ? 'bimestral' :
                              rawPer.includes('trimestral') ? 'trimestral' :
                              rawPer.includes('semestral') ? 'semestral' :
                              rawPer.includes('anual') ? 'anual' : undefined;
            const detectedHeader: Partial<FlotaHeader> = {
                cif:      cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 1 })] as XlsxCell),
                tomador:  cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 3 })] as XlsxCell),
                actividad: cellStr(ws[XLSX.utils.encode_cell({ r: 1, c: 6 })] as XlsxCell),
                efecto:   cellStr(ws[XLSX.utils.encode_cell({ r: 2, c: 3 })] as XlsxCell),
                ...(parsedPer ? { periodicidad: parsedPer } : {}),
            };
            const labels = new Set(['cif:', 'tomador:', 'actividad:', 'periodicidad:', 'efecto:', 'estudio:']);
            for (const k of Object.keys(detectedHeader) as (keyof FlotaHeader)[]) {
                const v = detectedHeader[k] as string;
                if (!v || labels.has(v.toLowerCase())) delete detectedHeader[k];
            }
            detectedHeaderRef.current = detectedHeader;

            // Detectar si esta flota ya existe en el sistema
            // eslint-disable-next-line no-misleading-character-class
            const normalize = (s?: string) =>
                (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            const cifNorm     = normalize(detectedHeader.cif);
            const tomadorNorm = normalize(detectedHeader.tomador);
            const matches = listarCarpetas().filter(c => {
                if (carpetaActiva && c.id === carpetaActiva.id) return false;
                const cCif     = normalize(c.header.cif);
                const cTomador = normalize(c.header.tomador);
                const cNombre  = normalize(c.nombre);
                const cifOk    = cifNorm.length > 3 && cCif.length > 3 && cifNorm === cCif;
                const tomOk    = tomadorNorm.length > 3 && cTomador.length > 3 &&
                    (cTomador.includes(tomadorNorm) || tomadorNorm.includes(cTomador));
                const nombreOk = tomadorNorm.length > 3 && cNombre.length > 3 &&
                    (cNombre.includes(tomadorNorm) || tomadorNorm.includes(cNombre));
                return cifOk || tomOk || nombreOk;
            });
            setFlotasMatch(matches);
            setUploadedRows(withPlate);
        } catch (err: unknown) {
            setParseError((err instanceof Error ? err.message : null) || 'Error al leer el archivo');
        }
    };

    // ── Silverdat query ────────────────────────────────────────────────────────
    const querySilverdat = async (mat: string): Promise<{ vehicle?: SilverdatVehicle; noSession?: boolean; fromCache?: boolean }> => {
        const ctrl = new AbortController();
        const poll = setInterval(() => { if (abortRef.current) ctrl.abort(); }, 200);
        try {
            const res = await fetch('/api/silverdat/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matriculas: [mat],
                    carpeta_id:     carpetaActiva?.id     ?? '',
                    carpeta_nombre: carpetaActiva?.nombre ?? '',
                    corredor_id:    carpetaActiva?.corredor_id ?? '',
                }),
                signal: ctrl.signal,
            });
            if (res.status === 401) return { noSession: true };
            const data = await res.json();
            if (data.ok && data.results?.[0]?.ok && data.results[0].vehicle) {
                return { vehicle: data.results[0].vehicle as SilverdatVehicle, fromCache: !!data.results[0].fromCache };
            }
            return {};
        } catch { return {}; }
        finally { clearInterval(poll); }
    };

    const buildVehicle = (row: Record<string, string>, sd?: SilverdatVehicle, id_veh?: string): ProcessedVehicle => {
        const matricula = row['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const tipoRaw = sd?.tipo_vehiculo || row['tipo_vehiculo'] || inferTipoFromMat(matricula);
        const tipo = normalizeTipoVehiculo(tipoRaw) || '';
        const sinLunas = NO_LUNAS.has(tipo.toLowerCase());
        const anioPlantilla = /(19|20)\d{2}/.test(row['anyo_fabricacion'] || '');
        return {
            matricula,
            marca: sd?.marca || row['marca'] || '',
            modelo: sd?.modelo || row['modelo'] || '',
            tipo_vehiculo: tipo,
            kw: sd?.kw || parseFloat(row['kw'] || '0') || 0,
            cv: sd?.cv || parseFloat(row['cv'] || '0') || 0,
            combustible: sd?.combustible || '',
            fecha_matriculacion: sd?.fecha_matriculacion || '',
            // Año: primero el de la plantilla del corredor; si no lo trae, el de Silverdat (con su origen)
            anyo_fabricacion: anioPlantilla ? row['anyo_fabricacion'] : (sd?.anyo_fabricacion || ''),
            anyo_fab_fuente: anioPlantilla ? 'fabricacion' : (sd?.anyo_fabricacion ? (sd.anyo_fab_fuente || 'fabricacion') : ''),
            cif_nif: row['cif_nif'] || '',
            tomador: row['tomador'] || '',
            fecha_vencimiento: row['fecha_vencimiento'] || '',
            cia_actual: row['cia_actual'] || '',
            num_poliza_actual: row['num_poliza_actual'] || row['n_poliza_actual'] || '',
            uso: row['uso'] || 'Particular',
            adr: row['adr'] || 'No',
            ambito: row['ambito'] || row['ámbito'] || 'Nacional',
            coberturas_solicitadas: row['coberturas_solicitadas'] || '',
            lunas: sinLunas ? 'No' : (row['lunas'] || 'No'),
            frq: row['frq'] || '',
            asistencia: row['asistencia'] || 'no',
            prima_referencia: row['prima_referencia'] || row['prima referencia'] || '',
            vin: sd?.vin || '',
            etiqueta_dgt: sd?.etiqueta_dgt || '',
            euro: sd?.euro || '',
            co2: sd?.co2 != null ? String(sd.co2) : '',
            precio_nuevo: sd?.precio_nuevo || 0,
            valor_venta: sd?.valor_venta || 0,
            id_veh,
            sd_ok: !!sd,
        };
    };

    const runProcess = async (rows: Record<string, string>[], mergeWith?: ProcessedVehicle[]) => {
        abortRef.current = false;
        setSdError('');
        setSdFinished(false);

        // Dedup: same plate only queried once even if duplicated in input
        const seenMats = new Set<string>();
        const uniqueRows = rows.filter(r => {
            const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (!mat || seenMats.has(mat)) return false;
            seenMats.add(mat);
            return true;
        });

        const processed: ProcessedVehicle[] = mergeWith ? [...mergeWith] : [];
        const mergeMap = new Map(processed.map(v => [v.matricula, v]));
        let done = 0;
        setProgress({ current: 0, total: uniqueRows.length, log: [] });

        const processOne = async (row: Record<string, string>) => {
            if (abortRef.current) return;
            const matricula = row['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            let id_veh: string | undefined;

            const result = await querySilverdat(matricula);
            if (result.noSession) { setSdError('Sesión Silverdat expirada. Reinicia y vuelve a hacer login.'); abortRef.current = true; return; }
            const sd: SilverdatVehicle | undefined = result.vehicle;
            if (result.fromCache) setCacheCount(n => n + 1);
            if (abortRef.current) return;

            try {
                const rowMarca = row['marca'] || '';
                const rowModelo = row['modelo'] || '';
                const body: Record<string, string | number> = {};
                if (sd?.marca)      body.marca      = sd.marca;
                else if (rowMarca)  body.rawText    = [rowMarca, rowModelo].filter(Boolean).join(' ');
                if (sd?.modelo)     body.modelo     = sd.modelo;
                if (sd?.kw)         body.kw         = sd.kw;
                if (sd?.cilindrada) body.cilindrada = sd.cilindrada;
                if (Object.keys(body).length > 0) {
                    const catData = await (await fetch('/api/catalogo/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    })).json();
                    const lista = catData.candidates ?? catData.candidatos ?? [];
                    if (lista.length > 0) id_veh = lista[0].id_veh;
                }
            } catch { /* catálogo opcional */ }

            const vehicle = buildVehicle(row, sd, id_veh);
            mergeMap.set(matricula, vehicle);
            done++;
            setProgress(p => ({ current: done, total: uniqueRows.length, log: [...p.log, { plate: matricula, ok: !!sd, marca: sd?.marca, modelo: sd?.modelo?.split(' ')[0], fromCache: !!result.fromCache }] }));
        };

        // 3 workers en paralelo — cola compartida
        let queueIdx = 0;
        const worker = async () => {
            while (!abortRef.current) {
                const myIdx = queueIdx++;
                if (myIdx >= uniqueRows.length) break;
                await processOne(uniqueRows[myIdx]);
                if (!abortRef.current && myIdx < uniqueRows.length - 1)
                    await new Promise(r => setTimeout(r, 200));
            }
        };
        await Promise.all([worker(), worker(), worker()]);

        if (!abortRef.current) {
            const all = Array.from(mergeMap.values());
            allProcessedRef.current = all;
            failedRowsRef.current = uniqueRows.filter(r => {
                const mat = r['matricula'].trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                return !mergeMap.get(mat)?.sd_ok;
            });
            setSdFinished(true);
        }
    };

    const checkAndRun = async (rows: Record<string, string>[]) => {
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        setPhase('processing');
        runProcess(rows);
    };

    const handleProcesar = () => {
        if (!uploadedRows) return;
        if (detectedHeaderRef.current && Object.keys(detectedHeaderRef.current).length > 0) {
            onHeaderUpdate?.(detectedHeaderRef.current);
        }
        if (mode === 'sin') {
            const vehicles = rowsToVehicles(uploadedRows);
            setProcessedVehicles(vehicles);
            onVehiclesProcessed?.(vehicles);
            setPhase('confirm');
        } else {
            checkAndRun(uploadedRows.filter(r => r['matricula']?.trim()));
        }
    };

    const handleRetry = async () => {
        const failed = failedRowsRef.current;
        if (!failed.length) return;
        setSdFinished(false);
        try {
            const sessionData = await (await fetch('/api/silverdat/login')).json();
            if (!sessionData.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }
        runProcess(failed, allProcessedRef.current);
    };

    const handleConfirmProcessed = () => {
        const all = allProcessedRef.current;
        setProcessedVehicles(all);
        onVehiclesProcessed?.(all);
        setPhase('confirm');
    };

    // ── Derived ────────────────────────────────────────────────────────────────
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    const failedCount = failedRowsRef.current.length;
    const okCount = allProcessedRef.current.filter(v => v.sd_ok).length;

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full min-h-0">
            {showSdModal && (
                <SilverdatModal
                    onClose={() => setShowSdModal(false)}
                    onSuccess={() => {
                        setShowSdModal(false);
                        if (uploadedRows) {
                            setPhase('processing');
                            runProcess(uploadedRows.filter(r => r['matricula']?.trim()));
                        }
                    }}
                />
            )}

            {/* ── Cabecera ── */}
            <div className="sh" style={{ flexShrink: 0 }}>
                <div>
                    <h2><b>02 ·</b>Automático</h2>
                    <p>Camino rápido: de la plantilla a una oferta en un solo paso.</p>
                </div>
                <div className="acts">
                    {phase === 'input' && uploadedRows && <span className="muted">{uploadedRows.length} vehículos cargados</span>}
                    {phase === 'processing' && <span className="muted">{progress.current}/{progress.total}</span>}
                    {phase !== 'confirm' && (
                        <button className="mini" onClick={handleDownload} disabled={downloadLoading}>
                            {downloadLoading ? 'Generando…' : 'Descargar plantilla'}
                        </button>
                    )}
                </div>
            </div>

            <div className="stepscroll custom-scrollbar">
                {phase === 'confirm' ? (
                    <Step3
                        vehicles={processedVehicles}
                        onComplete={onComplete}
                        onBack={() => setPhase('input')}
                        polizaMap={polizaMap}
                    />
                ) : (
                    <>
                        {/* Aviso flota ya registrada */}
                        {flotasMatch.length > 0 && (
                            <div className="notice">
                                <div className="rowline">
                                    <div style={{ flex: 1 }}>
                                        <b className="ttl">Esta flota ya está registrada</b>
                                        {flotasMatch.map(c => (
                                            <div key={c.id} className="rowline sm">
                                                <span className="strong">{c.nombre}</span>
                                                {c.header.tomador && <span className="muted">{c.header.tomador}</span>}
                                                <EstadoBadge estado={c.estado} small />
                                            </div>
                                        ))}
                                    </div>
                                    <button className="mini" onClick={() => setFlotasMatch([])}>Cerrar</button>
                                </div>
                            </div>
                        )}

                        <div className="tri">

                            {/* 1 · Descargar */}
                            <div>
                                <span className="no">PASO 1 DE 3</span>
                                <h3>Plantilla de vehículos</h3>
                                <p>Descarga, cumplimenta e importa el Excel del estudio. El formato se mantiene sin cambios.</p>
                                <button className="mini" onClick={handleDownload} disabled={downloadLoading}>
                                    {downloadLoading ? 'Generando…' : 'Descargar plantilla'}
                                </button>
                            </div>

                            {/* 2 · Subir */}
                            <div>
                                <span className="no">PASO 2 DE 3</span>
                                <h3>Subir plantilla rellenada</h3>
                                <p>Arrastra el archivo o selecciónalo desde tu equipo.</p>
                                <div
                                    className={`drop${uploadedRows ? ' ok' : ''}`}
                                    role="button" tabIndex={0}
                                    onClick={() => fileInputRef.current?.click()}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                                >
                                    {uploadedRows ? `${uploadedRows.length} vehículos cargados` : 'Suelta el archivo .xlsx aquí'}
                                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
                                </div>
                                <div className="rowline" style={{ marginTop: 12 }}>
                                    <button className="mini" onClick={() => fileInputRef.current?.click()}>Seleccionar archivo</button>
                                </div>
                                {parseError && <p className="warnTxt">{parseError}</p>}
                                {uploadedRows && duplicadas.length > 0 && (
                                    <div className="notice" style={{ marginTop: 14 }}>
                                        <div className="rowline">
                                            <b className="ttl">{duplicadas.length} matrículas duplicadas</b>
                                            <button
                                                className="mini"
                                                onClick={() => {
                                                    const firstSeen = new Set<string>();
                                                    setUploadedRows(uploadedRows!.filter(r => {
                                                        const mat = r['matricula']?.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                                                        if (!mat) return true;
                                                        if (firstSeen.has(mat)) return false;
                                                        firstSeen.add(mat); return true;
                                                    }));
                                                }}
                                            >Eliminar duplicadas</button>
                                        </div>
                                        <div className="plates">
                                            {duplicadas.slice(0, 4).map(m => <span key={m}>{m} ×{seenCounts.get(m)}</span>)}
                                            {duplicadas.length > 4 && <span className="muted">+{duplicadas.length - 4}</span>}
                                        </div>
                                    </div>
                                )}
                                {uploadedRows && (
                                    <div className="plates">
                                        {uploadedRows.slice(0, 6).map((r, i) => <span key={i}>{r['matricula']}</span>)}
                                        {uploadedRows.length > 6 && <span className="muted">+{uploadedRows.length - 6} más</span>}
                                    </div>
                                )}
                            </div>

                            {/* 3 · Procesar */}
                            <div>
                                {phase === 'input' ? (
                                    <>
                                        <span className="no">PASO 3 DE 3</span>
                                        <h3>Modo de procesado</h3>
                                        <div className="modes">
                                            {(['sin', 'con'] as const).map(m => (
                                                <button key={m} role="radio" aria-checked={mode === m} className={`mode${m === 'con' ? ' sd' : ''}`} onClick={() => setMode(m)}>
                                                    <b>{m === 'con' ? 'Con Silverdat' : 'Solo plantilla'}</b>
                                                    <span>{m === 'con' ? 'Completa cada vehículo con los datos técnicos de DAT. Es un servicio externo: hay que conectarlo.' : 'Carga los datos tal cual, sin consultas externas.'}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="rowline" style={{ marginTop: 14 }}>
                                            <button className="mini pri" onClick={handleProcesar} disabled={!uploadedRows}>
                                                {mode === 'sin' ? 'Cargar vehículos' : 'Procesar con Silverdat'}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="no">PASO 3 DE 3 · PROCESANDO</span>
                                        <h3>Silverdat</h3>
                                        <p>{progress.total} vehículos</p>
                                        <div className="rowline between"><b>{pct} %</b><span className="muted">{progress.current}/{progress.total}</span></div>
                                        <div className="pbar"><i style={{ width: `${pct}%` }} /></div>
                                        <div className="sdlog">
                                            {progress.log.slice(-10).map((entry, i) => (
                                                <div key={i} className={entry.ok ? '' : 'bad'}>
                                                    <span className="pl">{entry.plate}</span>
                                                    <span className="muted">{entry.ok ? (entry.marca ?? '') : 'sin datos'}</span>
                                                    {entry.ok && entry.fromCache && <span className="muted">histórico</span>}
                                                </div>
                                            ))}
                                        </div>
                                        {sdError && <p className="warnTxt">{sdError}</p>}
                                        {!sdFinished ? (
                                            <button className="mini" onClick={() => { abortRef.current = true; }}>Detener</button>
                                        ) : (
                                            <>
                                                <div className="stat3 mini3">
                                                    <button style={{ cursor: 'default' }}><label>Con datos</label><strong>{okCount}</strong></button>
                                                    {cacheCount > 0 && <button style={{ cursor: 'default' }}><label>Caché</label><strong>{cacheCount}</strong></button>}
                                                    <button style={{ cursor: 'default' }}><label>Sin datos</label><strong>{failedCount}</strong></button>
                                                </div>
                                                <div className="rowline wrap">
                                                    {failedCount > 0 && <button className="mini" onClick={handleRetry}>Segunda barrida ({failedCount})</button>}
                                                    <button className="mini" onClick={() => window.open('/api/silverdat/historial-txt', '_blank')}>Historial TXT</button>
                                                    <button className="mini pri" onClick={handleConfirmProcessed}>Confirmar y continuar</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
