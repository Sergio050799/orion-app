"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { resolvePlateFromSeed } from "@/core/_source_of_truth/plates/resolver";
import SilverdatChip from '@/components/saas/SilverdatChip';
import SilverdatModal from '@/components/saas/SilverdatModal';
import CatalogCascade, { type CascadaVersion } from '@/components/saas/CatalogCascade';
import { nf, eur } from '@/lib/fmt';
import ConsultasGuardadas from './ConsultasGuardadas';
import { guardarConsulta, cargarConsulta, nuevoIdConsulta, type ConsultaCompleta, type ConsultaResumen } from '@/lib/consultasVehiculos';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SilverdatVehicle {
    matricula: string;
    vin?: string;
    marca?: string;
    modelo?: string;
    version?: string;
    variante?: string;
    combustible?: string;
    kw?: number;
    cv?: number;
    cilindrada?: number;
    plazas?: number;
    puertas?: number;
    anyo_fabricacion?: string;
    fecha_matriculacion?: string;
    tara?: number;
    tipo_vehiculo?: string;
    etiqueta_dgt?: string;
    co2?: number;
    euro?: string;
    tipo_cambio?: string;
    color?: string;
    kilometraje?: number;
    precio_nuevo?: number;
    precio_nuevo_total?: number;
    valor_venta?: number;
    valor_compra?: number;
    num_titulares?: number;
    servicio?: string;
    tipo_alimentacion?: string;
    renting?: string;
}

interface CatalogMatch {
    id_veh: string;
    marca: string;
    modelo: string;
    version: string;
    combustible: string;
    kw: number;
    cv: number;
    cilindrada: number;
    plazas: number;
    tara: number;
    puertas: number;
    anyo: number;
    pvp?: number;
    score: number;
}

type SdStatus = 'idle' | 'loading' | 'ok' | 'error';
type CatStatus = 'idle' | 'loading' | 'done';

interface PlateCard {
    plate: string;
    originalInput: string;
    date: string | null;
    age: string;
    isClassic: boolean;
    confidence: number;
    type: 'Standard' | 'Semirremolque' | 'Unknown';
    // Silverdat
    sdStatus: SdStatus;
    sdVehicle?: SilverdatVehicle;
    sdError?: string;
    // Catalog (auto from Silverdat)
    catStatus: CatStatus;
    catMatches: CatalogMatch[];
    catSelected?: CatalogMatch;
    // Manual fallback
    manualOpen: boolean;
    manualMarca: string;
    manualModelo: string;
    manualKw: string;
    manualYear: string;
    manualCatStatus: CatStatus;
    manualMatches: CatalogMatch[];
    manualSelected?: CatalogMatch;
}

// ─── Helpers de formato ──────────────────────────────────────────────────────

const ageTxt = (a: string) => a.replace(/^(\d+)a (\d+)m$/, (_, y, m) => `${nf(+y)} ${+y === 1 ? 'año' : 'años'} · ${nf(+m)} m`);
const dateTxt = (d: string | null) => (d && /^\d{1,2}\/\d{4}$/.test(d) ? d.replace(/^(\d)\//, '0$1/') : d);

// ─── Catalog match display ────────────────────────────────────────────────────

function CatalogResult({ matches, selected, onSelect }: {
    matches: CatalogMatch[];
    selected?: CatalogMatch;
    onSelect: (m: CatalogMatch) => void;
}) {
    if (matches.length === 0) return null;

    // Single high-confidence match — show confirmed
    if (matches.length === 1 && matches[0].score >= 90) {
        const m = matches[0];
        return (
            <div className="cres ok">
                <b>{m.marca} {m.modelo}</b>
                <span>{m.version}</span>
                <span className="id">ID de catálogo {m.id_veh}</span>
            </div>
        );
    }

    // Multiple acabados or low-confidence — user picks
    return (
        <div className="cres">
            <div className="cl">Selecciona el acabado</div>
            <div className="opts" role="radiogroup" aria-label="Acabado">
                {matches.map(m => {
                    const isSelected = selected?.id_veh === m.id_veh;
                    return (
                        <button key={m.id_veh} role="radio" aria-checked={isSelected} className="opt" onClick={() => onSelect(m)}>
                            <b>{m.version || `${m.modelo} (sin versión)`}</b>
                            <span>ID {m.id_veh} · {nf(m.score)} %</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Manual fallback: desplegables en cascada ─────────────────────────────────

function ManualForm({ card, onUpdate }: {
    card: PlateCard;
    onUpdate: (updates: Partial<PlateCard>) => void;
}) {
    const pick = (v: CascadaVersion) => {
        const m: CatalogMatch = {
            id_veh: v.id_veh, marca: v.marca, modelo: v.modelo, version: v.version,
            combustible: v.combustible, kw: v.kw, cv: v.cv, cilindrada: v.cilindrada,
            plazas: v.plazas, tara: v.tara, puertas: v.puertas, anyo: v.anyo, pvp: v.pvp, score: 100,
        };
        onUpdate({
            manualCatStatus: 'done', manualMatches: [m], manualSelected: m,
            manualMarca: v.marca, manualModelo: v.modelo, manualKw: String(Math.round(v.kw)), manualYear: String(v.anyo || ''),
        });
    };

    return (
        <div className="mf">
            <CatalogCascade
                idPrefix={`cc_${card.plate.replace(/\W/g, '')}`}
                initial={{
                    marca: card.manualMarca || card.sdVehicle?.marca,
                    modelo: card.manualModelo || card.sdVehicle?.modelo,
                    anyo: (card.sdVehicle?.anyo_fabricacion?.match(/(19|20)\d{2}/)?.[0]) || (card.sdVehicle?.fecha_matriculacion?.match(/(19|20)\d{2}/)?.[0]) || card.manualYear,
                }}
                selectLabel="Usar esta versión"
                onSelect={pick}
            />
            {card.manualSelected && (
                <div className="cres ok" style={{ marginTop: 14 }}>
                    <b>{card.manualSelected.marca} {card.manualSelected.modelo}</b>
                    <span>{card.manualSelected.version}</span>
                    <span className="id">ID de catálogo {card.manualSelected.id_veh}</span>
                </div>
            )}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deduplicateByVersion(candidates: CatalogMatch[], max = 5): CatalogMatch[] {
    const seen = new Set<string>();
    const result: CatalogMatch[] = [];
    for (const c of candidates) {
        const key = (c.version || c.modelo || '').toLowerCase().trim();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(c);
            if (result.length >= max) break;
        }
    }
    return result;
}

function parsePlates(raw: string): string[] {
    const upper = raw.toUpperCase();
    const plates: string[] = [];
    const regex = /\b(R[\s-]?\d{4}[\s-]?[A-Z]{3})\b|\b(\d{4}[\s-]?[B-DF-HJ-NP-TV-Z]{3})\b/g;
    let m;
    while ((m = regex.exec(upper)) !== null) {
        const p = (m[1] || m[2]).replace(/[\s-]/g, '');
        plates.push(p);
    }
    return [...new Set(plates)];
}

function resolveCard(normalizedPlate: string): Pick<PlateCard, 'plate' | 'originalInput' | 'date' | 'age' | 'isClassic' | 'confidence' | 'type'> {
    let isSemi = false, lettersMatch: string | null = null, canonicalPlate = normalizedPlate;
    if (/^R\d{4}[A-Z]{3}$/.test(normalizedPlate)) {
        isSemi = true;
        lettersMatch = normalizedPlate.slice(-3);
        canonicalPlate = `R-${normalizedPlate.slice(1, 5)}-${normalizedPlate.slice(5)}`;
    } else {
        const mm = normalizedPlate.match(/(\d{4})([B-DF-HJ-NP-TV-Z]{3})/);
        if (mm) { lettersMatch = mm[2]; canonicalPlate = `${mm[1]} ${mm[2]}`; }
    }
    const resolved = lettersMatch ? resolvePlateFromSeed(lettersMatch, isSemi) : null;
    if (resolved) {
        const now = new Date();
        const calcMonth = resolved.month ? resolved.month - 1 : 0;
        const diff = new Date(now.getTime() - new Date(resolved.year, calcMonth).getTime());
        const years = Math.abs(diff.getUTCFullYear() - 1970);
        const age = resolved.month ? `${years}a ${diff.getUTCMonth()}m` : `~${years} años`;
        return {
            plate: canonicalPlate, originalInput: normalizedPlate,
            date: resolved.month ? `${resolved.month}/${resolved.year}` : `${resolved.year}`,
            age, isClassic: years >= 25, confidence: resolved.confidence, type: resolved.type,
        };
    }
    return { plate: canonicalPlate || normalizedPlate, originalInput: normalizedPlate, date: null, age: '?', isClassic: false, confidence: 0, type: 'Unknown' };
}

async function doCatalogSearch(p: URLSearchParams): Promise<CatalogMatch[]> {
    try {
        const res = await fetch(`/api/catalogo/search?${p}`);
        const data = await res.json();
        if (data.ok && data.candidatos?.length) return data.candidatos as CatalogMatch[];
    } catch { /* ignore */ }
    return [];
}

async function searchCatalogForSd(sd: SilverdatVehicle): Promise<CatalogMatch[]> {
    const base = new URLSearchParams();
    if (sd.marca) base.set('marca', sd.marca);

    // Silverdat returns "MARCA MODELO" in modelo — strip brand prefix to get clean model
    let modeloClean = sd.modelo || '';
    if (sd.marca && modeloClean.toUpperCase().startsWith(sd.marca.toUpperCase())) {
        modeloClean = modeloClean.slice(sd.marca.length).trim();
    }
    // For truck models like "R 450", "R450 LA": detect pattern and map to "SERIE R"
    const mTruck = modeloClean.match(/^([A-Za-z]+)\s*(\d{3,4})/);
    if (mTruck) {
        const serie = mTruck[1].toUpperCase();
        base.set('modelo', `SERIE ${serie}`);
        const kwFromCv = Math.round(parseInt(mTruck[2]) / 1.36);
        if (!sd.kw) base.set('kw', String(kwFromCv));
    } else if (modeloClean) {
        base.set('modelo', modeloClean);
    }

    if (sd.version) base.set('acabado', sd.version);
    if (sd.cilindrada) base.set('cilindrada', String(sd.cilindrada));
    if (sd.plazas) base.set('plazas', String(sd.plazas));
    if (sd.combustible) base.set('combustible', sd.combustible);
    if (sd.puertas) base.set('puertas', String(sd.puertas));

    // anyo_fabricacion primero (año de modelo = lo que indexa el catálogo)
    const fechaStr = sd.anyo_fabricacion || sd.fecha_matriculacion || '';
    const yearMatch = fechaStr.match(/(\d{4})/);
    const baseYear = yearMatch ? parseInt(yearMatch[1]) : null;
    if (baseYear) base.set('anyo', String(baseYear));

    // Search 1: with kW
    const paramsWithKw = new URLSearchParams(base);
    if (sd.kw) paramsWithKw.set('kw', String(sd.kw));
    let results = await doCatalogSearch(paramsWithKw);
    const topScore = results[0]?.score ?? 0;

    // Search 2: without kW (hybrids: Silverdat kW = thermal only, catalog may have combined)
    if (topScore < 80 && sd.kw) {
        const paramsNoKw = new URLSearchParams(base);
        const fallback = await doCatalogSearch(paramsNoKw);
        if ((fallback[0]?.score ?? 0) > topScore) results = fallback;
    }

    // Search 3: año-1 (coche fabricado a finales del año anterior)
    if (!results.length && baseYear) {
        const p = new URLSearchParams(base); p.set('anyo', String(baseYear - 1));
        results = await doCatalogSearch(p);
    }
    // Search 4: año+1
    if (!results.length && baseYear) {
        const p = new URLSearchParams(base); p.set('anyo', String(baseYear + 1));
        results = await doCatalogSearch(p);
    }
    // Search 5: sin año
    if (!results.length && baseYear) {
        const p = new URLSearchParams(base); p.delete('anyo');
        results = await doCatalogSearch(p);
    }

    if (!results.length) return [];
    const top = results[0];
    if (top.score >= 90) return [top];
    return deduplicateByVersion(results, 5);
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Lazy import ─────────────────────────────────────────────────────────────
import dynamic from 'next/dynamic';
const IdentificacionMasiva = dynamic(() => import('./IdentificacionMasiva'), { ssr: false });

export default function VehiculosPage() {
    const [tab, setTab] = useState<'identificar' | 'masivo' | 'guardadas'>('identificar');
    const [abrirMasiva, setAbrirMasiva] = useState<ConsultaCompleta | null>(null);
    const [refrescarGuardadas, setRefrescarGuardadas] = useState(0);
    const consultaIdRef = useRef<string>('');
    const [input, setInput] = useState('');
    const [cards, setCards] = useState<PlateCard[]>([]);
    const [showSdModal, setShowSdModal] = useState(false);
    const [sdSession, setSdSession] = useState<'checking' | 'ok' | 'none'>('checking');
    const [globalLoading, setGlobalLoading] = useState(false);
    const [hasQueried, setHasQueried] = useState(false);
    const [queryMode, setQueryMode] = useState<'full' | 'year'>('full');
    const activeModeRef = useRef<'full' | 'year'>('full');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const enrichingRef = useRef(false);
    const stopEnrichRef = useRef(false);

    useEffect(() => {
        fetch('/api/silverdat/login', { signal: AbortSignal.timeout(8000) })
            .then(r => r.json())
            .then(d => setSdSession(d.hasSession ? 'ok' : 'none'))
            .catch(() => setSdSession('none'));
    }, []);

    useEffect(() => {
        const el = textareaRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 160)}px`; }
    }, [input]);

    const updateCard = useCallback((originalInput: string, updates: Partial<PlateCard>) => {
        setCards(prev => prev.map(c => c.originalInput === originalInput ? { ...c, ...updates } : c));
    }, []);

    // ── Guardado automático de la consulta normal (para no perder un estudio al cerrar o cambiar de pantalla) ──
    useEffect(() => {
        if (!hasQueried || cards.length === 0 || !consultaIdRef.current) return;
        const t = setTimeout(async () => {
            const identificada = (c: PlateCard) => !!(c.catSelected || c.manualSelected || (c.catMatches.length === 1 && c.catMatches[0].score >= 90));
            const nombre = `${nf(cards.length)} matrícula${cards.length === 1 ? '' : 's'} · ${cards.slice(0, 3).map(c => c.plate).join(', ')}${cards.length > 3 ? '…' : ''}`;
            await guardarConsulta({
                id: consultaIdRef.current, tipo: 'normal', nombre,
                n_vehiculos: cards.length, n_identificados: cards.filter(identificada).length,
                data: { input, queryMode: activeModeRef.current, cards },
            });
            setRefrescarGuardadas(n => n + 1);
        }, 1500);
        return () => clearTimeout(t);
    }, [cards, input, hasQueried]);

    const abrirConsulta = useCallback(async (resumen: ConsultaResumen) => {
        const c = await cargarConsulta(resumen.id);
        if (!c) return;
        if (c.tipo === 'masiva') { setAbrirMasiva(c); setTab('masivo'); return; }
        const d = c.data ?? {};
        const restored: PlateCard[] = (Array.isArray(d.cards) ? d.cards : []).map((x: PlateCard) => ({
            ...x,
            // lo que estaba a medias al cerrar queda como pendiente
            sdStatus: x.sdStatus === 'loading' ? 'idle' : x.sdStatus,
            catStatus: x.catStatus === 'loading' ? 'idle' : x.catStatus,
        }));
        consultaIdRef.current = c.id;
        activeModeRef.current = d.queryMode === 'year' ? 'year' : 'full';
        setQueryMode(activeModeRef.current);
        setInput(typeof d.input === 'string' ? d.input : '');
        setCards(restored);
        setHasQueried(true);
        setTab('identificar');
    }, []);

    const runEnrichment = useCallback(async (plates: string[], mode: 'full' | 'year' = 'full') => {
        if (enrichingRef.current) return;
        enrichingRef.current = true;
        stopEnrichRef.current = false;
        setGlobalLoading(true);

        for (let i = 0; i < plates.length; i++) {
            if (stopEnrichRef.current) break;
            const plate = plates[i];
            updateCard(plate, { sdStatus: 'loading' });
            try {
                const res = await fetch('/api/silverdat/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ matriculas: [plate] }),
                    signal: AbortSignal.timeout(45000),
                });
                const data = await res.json();
                if (data.ok && data.results?.[0]?.ok && data.results[0].vehicle) {
                    const sd = data.results[0].vehicle as SilverdatVehicle;
                    if (mode === 'year') {
                        updateCard(plate, { sdStatus: 'ok', sdVehicle: sd });
                    } else {
                        updateCard(plate, { sdStatus: 'ok', sdVehicle: sd, catStatus: 'loading' });
                        searchCatalogForSd(sd).then(matches => {
                            updateCard(plate, { catStatus: 'done', catMatches: matches });
                        });
                    }
                } else {
                    const errMsg = data.results?.[0]?.error || 'Sin datos';
                    updateCard(plate, { sdStatus: 'error', sdError: errMsg, manualYear: '' });
                }
            } catch {
                updateCard(plate, { sdStatus: 'error', sdError: 'Error de conexión' });
            }
            if (i < plates.length - 1) await new Promise(r => setTimeout(r, mode === 'year' ? 280 : 480));
        }

        enrichingRef.current = false;
        setGlobalLoading(false);
    }, [updateCard]);

    const handleConsultar = async () => {
        const plates = parsePlates(input);
        if (plates.length === 0) return;

        activeModeRef.current = queryMode;
        consultaIdRef.current = nuevoIdConsulta();   // cada consulta nueva se guarda aparte

        const initial: PlateCard[] = plates.map(p => ({
            ...resolveCard(p),
            sdStatus: 'idle' as SdStatus,
            catStatus: 'idle' as CatStatus,
            catMatches: [],
            manualOpen: false,
            manualMarca: '', manualModelo: '', manualKw: '', manualYear: '',
            manualCatStatus: 'idle' as CatStatus,
            manualMatches: [],
        }));

        const withYear: PlateCard[] = initial.map(c => ({
            ...c,
            manualYear: c.date ? c.date.includes('/') ? c.date.split('/')[1] : c.date : '',
        }));

        setCards(withYear);
        setHasQueried(true);
        enrichingRef.current = false;

        try {
            const r = await fetch('/api/silverdat/login', { signal: AbortSignal.timeout(8000) });
            const d = await r.json();
            if (!d.hasSession) { setSdSession('none'); setShowSdModal(true); return; }
            setSdSession('ok');
        } catch { setSdSession('none'); setShowSdModal(true); return; }

        runEnrichment(plates, queryMode);
    };

    // Consulta reabierta con matrículas que quedaron sin consultar: se completan sin repetir las ya hechas
    const handleCompletarPendientes = async () => {
        const pendientes = cards.filter(c => c.sdStatus === 'idle').map(c => c.originalInput);
        if (pendientes.length === 0) return;
        try {
            const r = await fetch('/api/silverdat/login', { signal: AbortSignal.timeout(8000) });
            const d = await r.json();
            if (!d.hasSession) { setSdSession('none'); setShowSdModal(true); return; }
            setSdSession('ok');
        } catch { setSdSession('none'); setShowSdModal(true); return; }
        enrichingRef.current = false;
        runEnrichment(pendientes, activeModeRef.current);
    };

    const handleSdSuccess = () => {
        setShowSdModal(false);
        setSdSession('ok');
        const plates = cards.map(c => c.originalInput);
        if (plates.length > 0) runEnrichment(plates, activeModeRef.current);
    };

    const handleExport = async () => {
        if (cards.length === 0) return;
        const ExcelJS = (await import('exceljs')).default;
        const mode = activeModeRef.current;
        let rows: Record<string, string | number>[];
        if (mode === 'year') {
            rows = cards.map(c => ({
                'Matrícula': c.plate,
                'Fecha Matric. (SD)': c.sdVehicle?.fecha_matriculacion || '',
                'Año Fab. (SD)': c.sdVehicle?.anyo_fabricacion || '',
                'Fecha Local': c.date || '',
                'Estado SD': c.sdStatus === 'ok' ? 'OK' : c.sdStatus === 'error' ? (c.sdError || 'Error') : 'Pendiente',
            }));
        } else {
            rows = cards.map(c => {
                const sd = c.sdVehicle;
                const cat = c.catSelected || c.catMatches[0];
                const manCat = c.manualSelected || c.manualMatches[0];
                return {
                    'Matrícula': c.plate, 'Fecha': c.date || '', 'Antigüedad': c.age,
                    'Marca': sd?.marca || cat?.marca || manCat?.marca || '',
                    'Modelo': sd?.modelo || cat?.modelo || manCat?.modelo || '',
                    'Versión': sd?.version || cat?.version || manCat?.version || '',
                    'VIN': sd?.vin || '',
                    'Combustible': sd?.combustible || cat?.combustible || '',
                    'kW': sd?.kw ?? cat?.kw ?? '',
                    'CV': sd?.cv ?? cat?.cv ?? '',
                    'Cilindrada': sd?.cilindrada ?? '',
                    'Plazas': sd?.plazas ?? '',
                    'Puertas': sd?.puertas ?? '',
                    'Etiqueta DGT': sd?.etiqueta_dgt || '',
                    'CO2': sd?.co2 ?? '',
                    'Euro': sd?.euro || '',
                    'Tara (kg)': sd?.tara ?? '',
                    'Fecha Mat.': sd?.fecha_matriculacion || '',
                    'Año Fab.': sd?.anyo_fabricacion || '',
                    'Km': sd?.kilometraje ?? '',
                    'Precio Nuevo': sd?.precio_nuevo ?? cat?.pvp ?? '',
                    'Valor Venta': sd?.valor_venta ?? '',
                    'Nº Titulares': sd?.num_titulares ?? '',
                    'Tipo Vehículo': sd?.tipo_vehiculo || '',
                    'ID Catálogo': cat?.id_veh || manCat?.id_veh || '',
                };
            });
        }
        if (rows.length === 0) return;
        const wb = new ExcelJS.Workbook();
        wb.creator = 'MMT Seguros';
        const ws = wb.addWorksheet('Vehículos');
        const headers = Object.keys(rows[0]);
        ws.columns = headers.map(h => ({ width: Math.max(h.length + 4, 14) }));

        const headerRow = ws.getRow(1);
        headers.forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
        headerRow.height = 24;
        headerRow.eachCell(cell => {
            cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
            cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border    = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
        });

        rows.forEach((rowData, i) => {
            const row = ws.addRow(headers.map(h => rowData[h] ?? ''));
            row.height = 16;
            row.eachCell({ includeEmpty: true }, cell => {
                cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
                cell.font      = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
                cell.border    = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
            });
        });

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vehiculos_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const sdDone = cards.filter(c => c.sdStatus === 'ok').length;
    const sdFailed = cards.filter(c => c.sdStatus === 'error').length;
    const sdPending = cards.filter(c => c.sdStatus === 'loading' || c.sdStatus === 'idle' && globalLoading).length;
    const today = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' }).format(new Date());
    const canRun = !!input.trim() && !globalLoading;

    const tabs = (
        <div className="seg" role="tablist" aria-label="Tipo de consulta">
            {([['identificar', 'Identificar'], ['masivo', 'Masivo'], ['guardadas', 'Guardadas']] as const).map(([t, l]) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { if (t === 'masivo' && tab !== 'masivo') setAbrirMasiva(null); setTab(t); }}>{l}</button>
            ))}
        </div>
    );

    return (
        <div className="pg vh">

            {showSdModal && <SilverdatModal onClose={() => setShowSdModal(false)} onSuccess={handleSdSuccess} />}

            <section className="intro">
                <div>
                    <h1>Vehículos</h1>
                    <p>Identificación de vehículos · {today.charAt(0).toUpperCase() + today.slice(1)}</p>
                </div>
                <div className="actions">
                    <SilverdatChip onSessionChange={ok => setSdSession(ok ? 'ok' : 'none')} />
                </div>
            </section>

            <section className="vzone" aria-labelledby="vzT">
                <div className="vzhead">
                    <div>
                        <h2 id="vzT">{tab === 'masivo' ? 'Identificación masiva' : tab === 'guardadas' ? 'Consultas guardadas' : 'Identificar vehículos'}</h2>
                        <p className="sub-desc">
                            {tab === 'masivo'
                                ? 'Sube un Excel con las matrículas y ORION identifica el lote completo. Cada lote se guarda solo.'
                                : tab === 'guardadas'
                                    ? 'Todas tus consultas, normales y masivas, con sus datos. Ábrelas cuando quieras sin volver a consultar.'
                                    : 'Escribe o pega matrículas. ORION calcula el año, completa los datos y busca el ID del catálogo. Cada consulta se guarda sola.'}
                        </p>
                    </div>
                    {tabs}
                </div>

                {/* Tab: Masivo */}
                {tab === 'masivo' && (
                    <div className="mwrap">
                        <IdentificacionMasiva key={abrirMasiva?.id ?? 'nueva'} consulta={abrirMasiva} onGuardada={() => setRefrescarGuardadas(n => n + 1)} />
                    </div>
                )}

                {/* Tab: Guardadas */}
                {tab === 'guardadas' && (
                    <ConsultasGuardadas onAbrir={abrirConsulta} refrescar={refrescarGuardadas} />
                )}

                {/* Tab: Identificar */}
                {tab === 'identificar' && (
                    <div className="vtri two">
                        <div>
                            <span className="no">Paso 1 de 2</span>
                            <h3>Añadir matrículas</h3>
                            <p>Escribe o pega una lista. ORION detecta las matrículas aunque lleven espacios o guiones.</p>
                            <textarea
                                ref={textareaRef}
                                className="plates"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleConsultar(); } }}
                                placeholder={"1234 BCD\n5678 DFG\nR-1234-BCD"}
                                aria-label="Matrículas"
                                spellCheck={false}
                            />
                            <div className="hint">Una o varias. Ctrl + Enter para consultar.</div>
                        </div>
                        <div>
                            <span className="no">Paso 2 de 2</span>
                            <h3>Modo de identificación</h3>
                            <div className="modes" role="radiogroup" aria-label="Modo de identificación">
                                {([
                                    ['year', 'Solo año', 'Rápido: la fecha de matriculación según Silverdat, junto al año que calcula ORION.'],
                                    ['full', 'Info completa', 'Todos los datos técnicos y búsqueda del ID en el catálogo.'],
                                ] as const).map(([mode, label, desc]) => (
                                    <button key={mode} className="mode" role="radio" aria-checked={queryMode === mode} onClick={() => setQueryMode(mode)}>
                                        <b>{label}</b><span>{desc}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="sdline">
                                {sdSession === 'ok'
                                    ? <><b className="on">Silverdat conectado</b></>
                                    : <><b className="off">Silverdat desconectado</b><span>Conéctalo para consultar.</span><button className="mini sd" onClick={() => setShowSdModal(true)}>Conectar</button></>}
                            </div>
                            <div className="runrow">
                                <button className="mini pri" onClick={handleConsultar} disabled={!canRun}>{globalLoading ? 'Consultando…' : 'Consultar'}</button>
                                {globalLoading && (
                                    <button className="mini danger" onClick={() => { stopEnrichRef.current = true; enrichingRef.current = false; setGlobalLoading(false); }}>Detener</button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'identificar' && hasQueried && cards.length > 0 && (
                    <div className="pcount">
                        <span><b>{nf(cards.length)}</b> matrícula{cards.length > 1 ? 's' : ''}</span>
                        {sdDone > 0 && <span>· <b>{nf(sdDone)}</b> con datos</span>}
                        {sdFailed > 0 && <span className="w">· {nf(sdFailed)} sin Silverdat</span>}
                        {sdPending > 0 && <span>· {nf(sdPending)} pendientes</span>}
                        {!globalLoading && cards.some(c => c.sdStatus === 'idle') && (
                            <button className="mini sd" onClick={handleCompletarPendientes} style={{ marginLeft: 'auto' }}>Completar {nf(cards.filter(c => c.sdStatus === 'idle').length)} pendientes</button>
                        )}
                        {!globalLoading && <button className="mini" onClick={handleExport} style={{ marginLeft: cards.some(c => c.sdStatus === 'idle') ? 0 : 'auto' }}>Exportar Excel</button>}
                    </div>
                )}
            </section>

            {tab === 'identificar' && (
                <section className="vres" aria-live="polite">
                    {!hasQueried && (
                        <div className="empty">Los resultados aparecerán aquí, sin cambiar de pantalla.</div>
                    )}

                    {/* ── Compact year-only table ─────────────────────────── */}
                    {hasQueried && activeModeRef.current === 'year' && cards.length > 0 && (
                        <div className="tscroll">
                            <table className="tbl static">
                                <thead>
                                    <tr>
                                        {['Matrícula', 'Fecha matric. (Silverdat)', 'Año fab. (Silverdat)', 'Fecha calculada', 'Estado'].map(h => (
                                            <th key={h}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cards.map((card, i) => {
                                        const sd = card.sdVehicle;
                                        const st = card.sdStatus === 'ok' ? 'Con datos' : card.sdStatus === 'error' ? (card.sdError || 'Sin datos') : card.sdStatus === 'loading' ? 'Consultando…' : '—';
                                        return (
                                            <tr key={i}>
                                                <td className="mono">{card.plate}</td>
                                                <td>{sd?.fecha_matriculacion || '—'}</td>
                                                <td>{sd?.anyo_fabricacion || '—'}</td>
                                                <td>{dateTxt(card.date) || '—'}</td>
                                                <td><span className="tag" style={{ ['--c' as string]: card.sdStatus === 'ok' ? 'var(--blue)' : card.sdStatus === 'error' ? 'var(--sdoff)' : 'var(--quiet)' }}>{st}</span></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── Full cards (info completa mode) ────────────────── */}
                    {hasQueried && activeModeRef.current === 'full' && cards.map((card, i) => {
                        const sd = card.sdVehicle;
                        const hasCat = card.catMatches.length > 0;
                        const modelo = sd?.modelo && sd.marca && sd.modelo.toUpperCase().startsWith(sd.marca.toUpperCase()) ? sd.modelo.slice(sd.marca.length).trim() : sd?.modelo;
                        const rows = sd ? ([
                            ['Combustible', sd.combustible],
                            ['kW / CV', sd.kw != null ? `${nf(sd.kw)} kW / ${sd.cv != null ? nf(sd.cv) : '—'} CV` : null],
                            ['Cilindrada', sd.cilindrada != null ? `${nf(sd.cilindrada)} cc` : null],
                            ['Plazas / puertas', (sd.plazas || sd.puertas) ? `${sd.plazas ?? '—'} / ${sd.puertas ?? '—'}` : null],
                            ['Tipo', sd.tipo_vehiculo],
                            ['Etiqueta DGT', sd.etiqueta_dgt],
                            ['CO₂', sd.co2 != null ? `${nf(sd.co2)} g/km` : null],
                            ['Normativa', sd.euro],
                            ['Tara', sd.tara != null ? `${nf(sd.tara)} kg` : null],
                            ['Kilometraje', sd.kilometraje != null ? `${nf(sd.kilometraje)} km` : null],
                            ['Titulares', sd.num_titulares != null ? nf(sd.num_titulares) : null],
                            ['Servicio', sd.servicio],
                        ] as [string, string | null | undefined][]).filter(([, v]) => v) : [];
                        const prices = sd ? ([['Precio nuevo', sd.precio_nuevo], ['Valor de venta', sd.valor_venta], ['Valor de compra', sd.valor_compra]] as [string, number | undefined][]).filter(([, v]) => v) : [];
                        return (
                            <article key={i} className="vcard">
                                <header className="vhead">
                                    <span className="plate">{card.plate}</span>
                                    <div className="vsum">
                                        <div className="d">{card.date ? dateTxt(card.date) : <span className="dim0">Sin fecha</span>}</div>
                                        {sd?.marca && <div className="m">{sd.marca} {modelo}</div>}
                                    </div>
                                    {card.date && <span className={`age${card.isClassic ? ' cl' : ''}`}>{ageTxt(card.age)}</span>}
                                    <div className="vtags">
                                        {card.isClassic && card.date && <span className="chip">Clásico</span>}
                                        {card.type === 'Semirremolque' && <span className="chip">Semirremolque</span>}
                                        {card.confidence > 0 && card.confidence < 1 && <span className="chip" title="Fecha estimada">Fecha estimada</span>}
                                        {card.sdStatus === 'loading' && <span className="chip sd">Consultando…</span>}
                                        {card.sdStatus === 'ok' && <span className="chip sd">Silverdat</span>}
                                        {card.sdStatus === 'error' && <span className="chip err" title={card.sdError}>Sin datos</span>}
                                    </div>
                                </header>

                                {sd && (
                                    <div className="vsd">
                                        {sd.version && (
                                            <p className="ver">{sd.version}{sd.vin && <span className="vin">Bastidor {sd.vin}</span>}</p>
                                        )}
                                        <div className="vkv">
                                            {rows.map(([label, val]) => (
                                                <div key={label}><label>{label}</label><span>{val}</span></div>
                                            ))}
                                        </div>
                                        {prices.length > 0 && (
                                            <div className="vprice">
                                                {prices.map(([label, val]) => (
                                                    <div key={label}><label>{label}</label><strong>{eur(val as number)}</strong></div>
                                                ))}
                                            </div>
                                        )}
                                        {card.catStatus === 'loading' && <p className="note" style={{ marginTop: 12 }}>Buscando en el catálogo…</p>}
                                        {hasCat && (
                                            <CatalogResult
                                                matches={card.catMatches}
                                                selected={card.catSelected}
                                                onSelect={m => updateCard(card.originalInput, { catSelected: m })}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* ── Manual fallback — always available ──── */}
                                {card.sdStatus !== 'loading' && (
                                    <div className="vman">
                                        <button className="tg" aria-expanded={card.manualOpen}
                                            onClick={() => updateCard(card.originalInput, { manualOpen: !card.manualOpen })}>
                                            <span>Identificar en catálogo a mano</span>
                                            <i aria-hidden="true">{card.manualOpen ? '−' : '+'}</i>
                                        </button>
                                        {card.manualOpen && (
                                            <ManualForm
                                                card={card}
                                                onUpdate={updates => updateCard(card.originalInput, updates)}
                                            />
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </section>
            )}

            <div className="footer">
                <span>ORION · Datos en tiempo real</span>
                <span>Vehículos</span>
            </div>
        </div>
    );
}
