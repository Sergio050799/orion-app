"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { resolvePlateFromSeed } from "@/core/_source_of_truth/plates/resolver";

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

// ─── Design ───────────────────────────────────────────────────────────────────

const GLASS: React.CSSProperties = {
    background: 'rgba(12, 28, 82, 0.75)',
    border: '1px solid rgba(61, 112, 255, 0.22)',
    borderRadius: 16,
    boxShadow: '0 20px 60px -15px rgba(0,0,0,0.5)',
};

const FIELD: React.CSSProperties = {
    background: 'rgba(6,14,50,0.6)',
    border: '1px solid rgba(61,112,255,0.2)',
    borderRadius: 8,
    color: '#FFFFFF',
    fontSize: 13,
    padding: '9px 12px',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
};

// ─── Silverdat modal ──────────────────────────────────────────────────────────

function SilverdatModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [datId, setDatId] = useState('');
    const [user, setUser] = useState('');
    const [pass, setPass] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const go = async () => {
        if (!datId || !user || !pass) return;
        setLoading(true); setError('');
        try {
            const r = await fetch('/api/silverdat/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datId, user, pass }) });
            const d = await r.json();
            if (d.ok) onSuccess();
            else setError(d.error || 'Credenciales incorrectas');
        } catch { setError('Error de conexión'); }
        finally { setLoading(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ width: 340, padding: 26, borderRadius: 18, background: 'rgba(6,16,60,0.97)', border: '1px solid rgba(245,158,11,0.3)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>S</div>
                    <div>
                        <p style={{ margin: 0, fontSize: 15, color: '#fff', fontWeight: 700 }}>Silverdat</p>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(178,198,245,0.55)' }}>DAT / fastVALUATE</p>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <input autoFocus placeholder="N. Cliente DAT" value={datId} onChange={e => setDatId(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
                    <input placeholder="Usuario" value={user} onChange={e => setUser(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
                    <input type="password" placeholder="Contraseña" value={pass} onChange={e => setPass(e.target.value)} style={FIELD} onKeyDown={e => e.key === 'Enter' && go()} />
                </div>
                {error && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={go} disabled={loading || !datId || !user || !pass} style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: loading ? 'rgba(245,158,11,0.3)' : 'linear-gradient(135deg,#d97706,#f59e0b)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Conectando...' : 'Iniciar sesión'}</button>
                    <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(6,14,50,0.5)', color: '#BDD4FF', border: '1px solid rgba(61,112,255,0.22)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}

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
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(51,102,255,0.08)', border: '1px solid rgba(51,102,255,0.18)', borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>{m.marca} {m.modelo}</p>
                <p style={{ margin: '2px 0 4px', fontSize: 11, color: 'rgba(178,198,245,0.6)' }}>{m.version}</p>
                <p style={{ margin: 0, fontSize: 10, fontFamily: 'monospace', color: 'rgba(178,198,245,0.35)' }}>id: {m.id_veh}</p>
            </div>
        );
    }

    // Multiple acabados or low-confidence — user picks
    return (
        <div style={{ marginTop: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: 'rgba(178,198,245,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selecciona el acabado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {matches.map(m => {
                    const isSelected = selected?.id_veh === m.id_veh;
                    return (
                        <button key={m.id_veh} onClick={() => onSelect(m)} style={{
                            padding: '8px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                            background: isSelected ? 'rgba(51,102,255,0.18)' : 'rgba(18,40,100,0.4)',
                            border: isSelected ? '1px solid rgba(51,102,255,0.45)' : '1px solid rgba(61,112,255,0.12)',
                            transition: 'all 150ms', width: '100%',
                        }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#FFFFFF' : 'rgba(178,198,245,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.version || `${m.modelo} (sin versión)`}
                            </p>
                            {isSelected && <p style={{ margin: '2px 0 0', fontSize: 10, fontFamily: 'monospace', color: 'rgba(178,198,245,0.35)' }}>id: {m.id_veh}</p>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Manual fallback form ─────────────────────────────────────────────────────

function ManualForm({ card, onUpdate }: {
    card: PlateCard;
    onUpdate: (updates: Partial<PlateCard>) => void;
}) {
    const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const searchCatalog = useCallback(async (marca: string, modelo: string, kw: string, year: string) => {
        if (!marca && !modelo) return;
        onUpdate({ manualCatStatus: 'loading', manualMatches: [], manualSelected: undefined });
        try {
            const params = new URLSearchParams();
            if (marca) params.set('marca', marca);
            if (modelo) params.set('modelo', modelo.split(' ')[0]);
            if (kw) params.set('kw', kw);
            if (year) params.set('anyo', year);
            const res = await fetch(`/api/catalogo/search?${params}`);
            const data = await res.json();
            if (data.ok && data.candidatos?.length > 0) {
                const unique = deduplicateByVersion(data.candidatos, 5);
                onUpdate({ manualCatStatus: 'done', manualMatches: unique });
            } else {
                onUpdate({ manualCatStatus: 'done', manualMatches: [] });
            }
        } catch {
            onUpdate({ manualCatStatus: 'done', manualMatches: [] });
        }
    }, [onUpdate]);

    const triggerSearch = (marca: string, modelo: string, kw: string, year: string) => {
        clearTimeout(debounce.current);
        debounce.current = setTimeout(() => searchCatalog(marca, modelo, kw, year), 400);
    };

    const set = (field: keyof PlateCard, val: string) => {
        const updates: Partial<PlateCard> = { [field]: val };
        onUpdate(updates);
        // Trigger search with updated values
        const marca = field === 'manualMarca' ? val : card.manualMarca;
        const modelo = field === 'manualModelo' ? val : card.manualModelo;
        const kw = field === 'manualKw' ? val : card.manualKw;
        const year = field === 'manualYear' ? val : card.manualYear;
        triggerSearch(marca, modelo, kw, year);
    };

    return (
        <div style={{ marginTop: 10, padding: '14px 16px', background: 'rgba(6,14,50,0.4)', border: '1px solid rgba(61,112,255,0.12)', borderRadius: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 70px', gap: 8 }}>
                <input
                    placeholder="Marca"
                    value={card.manualMarca}
                    onChange={e => set('manualMarca', e.target.value.toUpperCase())}
                    style={{ ...FIELD, fontSize: 12, gridColumn: '1' }}
                />
                <input
                    placeholder="Modelo"
                    value={card.manualModelo}
                    onChange={e => set('manualModelo', e.target.value.toUpperCase())}
                    style={{ ...FIELD, fontSize: 12, gridColumn: '2' }}
                />
                <input
                    placeholder="kW"
                    value={card.manualKw}
                    type="number"
                    onChange={e => set('manualKw', e.target.value)}
                    style={{ ...FIELD, fontSize: 12, gridColumn: '3' }}
                />
                <input
                    placeholder="Año"
                    value={card.manualYear}
                    type="number"
                    onChange={e => set('manualYear', e.target.value)}
                    style={{ ...FIELD, fontSize: 12, gridColumn: '4' }}
                />
            </div>

            {card.manualCatStatus === 'loading' && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(178,198,245,0.4)' }}>Buscando...</p>
            )}

            {card.manualCatStatus === 'done' && card.manualMatches.length === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(239,68,68,0.7)' }}>Sin resultados — intenta con menos datos o revisa la marca</p>
            )}

            {card.manualMatches.length > 0 && (
                <CatalogResult
                    matches={card.manualMatches}
                    selected={card.manualSelected}
                    onSelect={m => onUpdate({ manualSelected: m })}
                />
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
    // Take up to 2 words of the model (e.g. "PRIUS+" or "RAV 4" → "RAV")
    const modeloWord = modeloClean.split(' ')[0];
    if (modeloWord) base.set('modelo', modeloWord);

    if (sd.version) base.set('acabado', sd.version);
    if (sd.cilindrada) base.set('cilindrada', String(sd.cilindrada));
    if (sd.plazas) base.set('plazas', String(sd.plazas));
    if (sd.combustible) base.set('combustible', sd.combustible);
    if (sd.puertas) base.set('puertas', String(sd.puertas));

    // Extract year from fecha_matriculacion (DD/MM/YYYY or YYYY-MM-DD)
    const fechaStr = sd.fecha_matriculacion || sd.anyo_fabricacion || '';
    const yearMatch = fechaStr.match(/(\d{4})/);
    if (yearMatch) base.set('anyo', yearMatch[1]);

    // Search 1: with kW
    const paramsWithKw = new URLSearchParams(base);
    if (sd.kw) paramsWithKw.set('kw', String(sd.kw));
    let results = await doCatalogSearch(paramsWithKw);
    const topScore = results[0]?.score ?? 0;

    // Search 2 fallback without kW (hybrids: Silverdat kW = thermal only, catalog may have combined)
    if (topScore < 80 && sd.kw) {
        const paramsNoKw = new URLSearchParams(base);
        const fallback = await doCatalogSearch(paramsNoKw);
        if ((fallback[0]?.score ?? 0) > topScore) results = fallback;
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
    const [tab, setTab] = useState<'identificar' | 'masivo'>('identificar');
    const [input, setInput] = useState('');
    const [cards, setCards] = useState<PlateCard[]>([]);
    const [showSdModal, setShowSdModal] = useState(false);
    const [globalLoading, setGlobalLoading] = useState(false);
    const [hasQueried, setHasQueried] = useState(false);
    const [queryMode, setQueryMode] = useState<'full' | 'year'>('full');
    const activeModeRef = useRef<'full' | 'year'>('full');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const enrichingRef = useRef(false);
    const stopEnrichRef = useRef(false);

    useEffect(() => {
        const el = textareaRef.current;
        if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 160)}px`; }
    }, [input]);

    const updateCard = useCallback((originalInput: string, updates: Partial<PlateCard>) => {
        setCards(prev => prev.map(c => c.originalInput === originalInput ? { ...c, ...updates } : c));
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
            const r = await fetch('/api/silverdat/login');
            const d = await r.json();
            if (!d.hasSession) { setShowSdModal(true); return; }
        } catch { setShowSdModal(true); return; }

        runEnrichment(plates, queryMode);
    };

    const handleSdSuccess = () => {
        setShowSdModal(false);
        const plates = cards.map(c => c.originalInput);
        runEnrichment(plates, activeModeRef.current);
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
                    'Marca': sd?.marca || manCat?.marca || '',
                    'Modelo': sd?.modelo || manCat?.modelo || '',
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
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002F82' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 9 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { bottom: { style: 'medium', color: { argb: 'FF002F82' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
        });

        rows.forEach((rowData, i) => {
            const row = ws.addRow(headers.map(h => rowData[h] ?? ''));
            row.height = 18;
            row.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFFFF' : 'FFF0F4FA' } };
                cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF0A1628' } };
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
                cell.border = { bottom: { style: 'thin', color: { argb: 'FFB8C8E8' } }, right: { style: 'thin', color: { argb: 'FFB8C8E8' } } };
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

    return (
        <div className="h-full w-full animate-in fade-in duration-500" style={{ maxWidth: 1240, margin: '0 auto', padding: '0 16px', display: 'flex', flexDirection: 'column' }}>

            {showSdModal && <SilverdatModal onClose={() => setShowSdModal(false)} onSuccess={handleSdSuccess} />}

            {/* Header + tab toggle */}
            <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 4, height: 48, borderRadius: 2, background: 'linear-gradient(180deg,#1240CC,#3366FF)', marginTop: 2, flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#3366FF', marginBottom: 3 }}>Consulta</p>
                        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>Vehículos</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 0 }}>
                    {([
                        ['identificar', 'Identificar'],
                        ['masivo',      'Masivo'],
                    ] as const).map(([t, l]) => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            padding: '7px 20px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                            borderRadius: t === 'identificar' ? '10px 0 0 10px' : '0 10px 10px 0',
                            background: tab === t ? 'rgba(18,64,204,0.35)' : 'rgba(6,14,50,0.5)',
                            color: tab === t ? '#3D7BFF' : 'rgba(178,198,245,0.5)',
                            boxShadow: tab === t ? '0 0 0 1px rgba(51,102,255,0.4) inset' : '0 0 0 1px rgba(61,112,255,0.12) inset',
                            transition: 'all 180ms', letterSpacing: '0.04em',
                        }}>{l}</button>
                    ))}
                </div>
            </div>

            {/* Tab: Masivo */}
            {tab === 'masivo' && (
                <div style={{ flex: 1, minHeight: 0, background: 'rgba(0,7,45,0.85)', border: '1px solid rgba(51,102,255,0.1)', borderRadius: 16, overflow: 'hidden' }}>
                    <IdentificacionMasiva />
                </div>
            )}

            {/* Tab: Identificar (original) */}
            {tab === 'identificar' && <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>

                {/* ── LEFT PANEL ─────────────────────────────────────────── */}
                <div style={{ ...GLASS, padding: 22, flex: '0 0 320px', position: 'sticky', top: 16 }}>
                    <label style={{ fontSize: 10, fontWeight: 800, color: 'rgba(51,102,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'block' }}>
                        Matrículas
                    </label>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleConsultar(); } }}
                        placeholder={"1234ABC\n5678DEF 9012GHI\no pega aquí la lista..."}
                        spellCheck={false}
                        style={{
                            width: '100%', minHeight: 160,
                            background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(51,102,255,0.15)',
                            borderRadius: 10, color: '#FFFFFF',
                            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                            fontSize: 14, fontWeight: 600, letterSpacing: '0.05em',
                            padding: '12px 14px', outline: 'none', resize: 'vertical', lineHeight: 1.8,
                            caretColor: '#3366FF',
                        }}
                    />
                    <p style={{ fontSize: 10, color: 'rgba(178,198,245,0.4)', margin: '6px 0 10px', lineHeight: 1.4 }}>
                        Una o varias. Ctrl+Enter para consultar.
                    </p>

                    {/* Mode selector */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        {([['year', 'Solo año', 'Rápido — solo fecha matriculación'], ['full', 'Info completa', 'Todos los datos + catálogo']] as const).map(([mode, label, title]) => (
                            <button key={mode} title={title} onClick={() => setQueryMode(mode)}
                                style={{
                                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    background: queryMode === mode ? (mode === 'year' ? 'rgba(16,185,129,0.18)' : 'rgba(51,102,255,0.18)') : 'rgba(6,14,50,0.4)',
                                    color: queryMode === mode ? (mode === 'year' ? '#10b981' : '#6699ff') : 'rgba(178,198,245,0.45)',
                                    border: queryMode === mode ? `1px solid ${mode === 'year' ? 'rgba(16,185,129,0.4)' : 'rgba(51,102,255,0.4)'}` : '1px solid rgba(61,112,255,0.1)',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {globalLoading && (
                        <button
                            onClick={() => { stopEnrichRef.current = true; enrichingRef.current = false; setGlobalLoading(false); }}
                            style={{
                                width: '100%', padding: '10px 0', borderRadius: 10, marginBottom: 8,
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}>
                            Detener
                        </button>
                    )}
                    <button
                        onClick={handleConsultar}
                        disabled={!input.trim() || globalLoading}
                        style={{
                            width: '100%', padding: '13px 0', borderRadius: 10,
                            background: globalLoading ? 'rgba(18,64,204,0.3)' : !input.trim() ? 'rgba(18,64,204,0.2)' : 'linear-gradient(135deg,#1240CC,#3366FF)',
                            color: '#fff', border: 'none', fontSize: 13, fontWeight: 800,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            cursor: (!input.trim() || globalLoading) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            opacity: !input.trim() ? 0.4 : 1, transition: 'opacity 0.2s',
                        }}
                    >
                        {globalLoading ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'sdSpin 1s linear infinite' }}>
                                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.2" /><path d="M21 12a9 9 0 00-9-9" />
                                </svg>
                                <style>{`@keyframes sdSpin{to{transform:rotate(360deg)}}`}</style>
                                Consultando...
                            </>
                        ) : 'Consultar'}
                    </button>

                    {/* Stats */}
                    {hasQueried && cards.length > 0 && (
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: 'rgba(178,198,245,0.5)' }}>Total</span>
                                <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{cards.length} matrículas</span>
                            </div>
                            {sdDone > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ color: 'rgba(178,198,245,0.5)' }}>Con datos</span>
                                    <span style={{ color: '#10b981', fontWeight: 700 }}>{sdDone}</span>
                                </div>
                            )}
                            {sdFailed > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ color: 'rgba(178,198,245,0.5)' }}>Sin Silverdat</span>
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{sdFailed}</span>
                                </div>
                            )}
                            {sdPending > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ color: 'rgba(178,198,245,0.5)' }}>Pendientes</span>
                                    <span style={{ color: '#3366FF', fontWeight: 700 }}>{sdPending}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Export */}
                    {cards.length > 0 && !globalLoading && (
                        <button onClick={handleExport} style={{
                            width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
                            color: '#10b981', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                            textTransform: 'uppercase', cursor: 'pointer',
                        }}>
                            Exportar XLSX
                        </button>
                    )}
                </div>

                {/* ── RESULTS ────────────────────────────────────────────── */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {!hasQueried && (
                        <div style={{ textAlign: 'center', padding: '80px 0', opacity: 0.3 }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3366FF" strokeWidth="1.2" style={{ margin: '0 auto 14px', display: 'block' }}>
                                <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                            </svg>
                            <p style={{ color: '#BDD4FF', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Introduce matrículas y pulsa Consultar</p>
                        </div>
                    )}

                    {/* ── Compact year-only table ─────────────────────────── */}
                    {hasQueried && activeModeRef.current === 'year' && cards.length > 0 && (
                        <div style={{ ...GLASS, borderRadius: 14, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'rgba(6,14,50,0.8)', borderBottom: '1px solid rgba(51,102,255,0.2)' }}>
                                        {['#', 'Matrícula', 'Fecha Matric. (SD)', 'Año Fab. (SD)', 'Fecha Local', 'Estado'].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: 'rgba(178,198,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cards.map((card, i) => {
                                        const sd = card.sdVehicle;
                                        const stripe = i % 2 === 1 ? 'rgba(6,14,50,0.25)' : 'transparent';
                                        const statusColor = card.sdStatus === 'ok' ? '#10b981' : card.sdStatus === 'error' ? '#f59e0b' : card.sdStatus === 'loading' ? '#3366FF' : 'rgba(178,198,245,0.3)';
                                        const statusLabel = card.sdStatus === 'ok' ? '✓' : card.sdStatus === 'error' ? card.sdError || 'Sin datos' : card.sdStatus === 'loading' ? '…' : '—';
                                        return (
                                            <tr key={i} style={{ background: stripe, borderBottom: '1px solid rgba(61,112,255,0.07)' }}>
                                                <td style={{ padding: '9px 14px', color: 'rgba(178,198,245,0.3)', fontSize: 11, fontWeight: 700 }}>{i + 1}</td>
                                                <td style={{ padding: '9px 14px', fontFamily: '"JetBrains Mono",monospace', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.06em' }}>{card.plate}</td>
                                                <td style={{ padding: '9px 14px', fontWeight: 700, color: sd?.fecha_matriculacion ? '#10b981' : 'rgba(178,198,245,0.25)', fontFamily: 'monospace' }}>{sd?.fecha_matriculacion || '—'}</td>
                                                <td style={{ padding: '9px 14px', fontWeight: 700, color: sd?.anyo_fabricacion ? '#6699ff' : 'rgba(178,198,245,0.25)', fontFamily: 'monospace' }}>{sd?.anyo_fabricacion || '—'}</td>
                                                <td style={{ padding: '9px 14px', color: 'rgba(178,198,245,0.55)', fontFamily: 'monospace' }}>{card.date || '—'}</td>
                                                <td style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: statusColor, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={statusLabel}>{statusLabel}</td>
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
                        return (
                            <div key={i} style={{ ...GLASS, borderRadius: 14, overflow: 'hidden' }}>

                                {/* ── Header row ─────────────────────────── */}
                                <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                    {/* Plate badge */}
                                    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{ width: 20, height: 34, background: 'linear-gradient(180deg,#003DA5,#002D7A)', borderRadius: '4px 0 0 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: '1px solid rgba(51,102,255,0.3)', borderRight: 'none' }}>
                                            <svg width="9" height="9" viewBox="0 0 18 18" fill="none">{[...Array(12)].map((_, j) => { const a = (j * 30 - 90) * Math.PI / 180; return <circle key={j} cx={9 + 6 * Math.cos(a)} cy={9 + 6 * Math.sin(a)} r="0.8" fill="#FFD700" />; })}</svg>
                                            <span style={{ color: '#FFF', fontSize: 5, fontWeight: 800 }}>E</span>
                                        </div>
                                        <div style={{ height: 34, background: 'rgba(255,255,255,0.04)', borderRadius: '0 4px 4px 0', border: '1px solid rgba(61,112,255,0.2)', borderLeft: 'none', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                                            <span style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: 15, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{card.plate}</span>
                                        </div>
                                    </div>

                                    {/* Date / vehicle summary */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {card.date
                                            ? <span style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF' }}>{card.date}</span>
                                            : <span style={{ fontSize: 13, color: 'rgba(178,198,245,0.4)', fontStyle: 'italic' }}>Sin fecha</span>
                                        }
                                        {sd?.marca && (
                                            <div style={{ fontSize: 12, color: 'rgba(178,198,245,0.65)', marginTop: 2, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {sd.marca} {sd.modelo?.toUpperCase().startsWith(sd.marca.toUpperCase()) ? sd.modelo.slice(sd.marca.length).trim() : sd.modelo}
                                            </div>
                                        )}
                                    </div>

                                    {/* Age */}
                                    {card.date && (
                                        <span style={{ fontSize: 13, fontWeight: 700, color: card.isClassic ? '#F59E0B' : '#10B981', flexShrink: 0 }}>{card.age}</span>
                                    )}

                                    {/* Status badges */}
                                    <div style={{ flexShrink: 0, display: 'flex', gap: 5, alignItems: 'center' }}>
                                        {card.isClassic && card.date && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '3px 7px' }}>Clásico</span>}
                                        {card.type === 'Semirremolque' && <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 5, padding: '3px 7px' }}>Semi</span>}
                                        {card.confidence > 0 && card.confidence < 1 && <span style={{ fontSize: 9, fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, padding: '3px 7px' }} title="Fecha estimada">~</span>}
                                        {/* Silverdat status indicator */}
                                        {card.sdStatus === 'loading' && (
                                            <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, padding: '3px 7px' }}>SD...</span>
                                        )}
                                        {card.sdStatus === 'ok' && (
                                            <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '3px 7px' }}>SD</span>
                                        )}
                                    </div>
                                </div>

                                {/* ── Silverdat data ──────────────────────── */}
                                {sd && (
                                    <div style={{ borderTop: '1px solid rgba(245,158,11,0.12)', background: 'rgba(245,158,11,0.03)', padding: '12px 18px' }}>
                                        {sd.version && (
                                            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'rgba(178,198,245,0.55)', fontStyle: 'italic' }}>
                                                {sd.version}
                                                {sd.vin && <span style={{ marginLeft: 12, fontFamily: 'monospace', fontSize: 10 }}>VIN: {sd.vin}</span>}
                                            </p>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '5px 16px' }}>
                                            {([
                                                ['Combustible', sd.combustible],
                                                ['kW / CV', sd.kw != null ? `${sd.kw}kW / ${sd.cv ?? '—'}CV` : null],
                                                ['Cilindrada', sd.cilindrada != null ? `${sd.cilindrada}cc` : null],
                                                ['Plazas / Puertas', (sd.plazas || sd.puertas) ? `${sd.plazas ?? '—'} / ${sd.puertas ?? '—'}` : null],
                                                ['Tipo', sd.tipo_vehiculo],
                                                ['Etiqueta DGT', sd.etiqueta_dgt],
                                                ['CO2', sd.co2 != null ? `${sd.co2}g/km` : null],
                                                ['Euro', sd.euro],
                                                ['Tara', sd.tara != null ? `${sd.tara}kg` : null],
                                                ['Km', sd.kilometraje != null ? sd.kilometraje.toLocaleString('es-ES') + 'km' : null],
                                                ['Titulares', sd.num_titulares != null ? String(sd.num_titulares) : null],
                                                ['Servicio', sd.servicio],
                                            ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, val]) => (
                                                <div key={label}>
                                                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>{label}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{val}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Prices row */}
                                        {(sd.precio_nuevo || sd.valor_venta || sd.valor_compra) && (
                                            <div style={{ display: 'flex', gap: 18, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(245,158,11,0.08)' }}>
                                                {[['Precio Nuevo', sd.precio_nuevo], ['Valor Venta', sd.valor_venta], ['Valor Compra', sd.valor_compra]].filter(([, v]) => v).map(([label, val]) => (
                                                    <div key={String(label)}>
                                                        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,158,11,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>{label}</span>
                                                        <span style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>€{(val as number).toLocaleString('es-ES')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Catalog match */}
                                        {card.catStatus === 'loading' && (
                                            <p style={{ margin: '10px 0 0', fontSize: 11, color: 'rgba(178,198,245,0.4)' }}>Buscando en catálogo...</p>
                                        )}
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
                                    <div style={{ borderTop: '1px solid rgba(61,112,255,0.1)', padding: '0 18px 14px' }}>
                                        <button
                                            onClick={() => updateCard(card.originalInput, { manualOpen: !card.manualOpen })}
                                            style={{
                                                width: '100%', marginTop: 12, padding: '8px 12px', borderRadius: 8,
                                                background: 'rgba(61,112,255,0.07)', border: '1px solid rgba(61,112,255,0.15)',
                                                color: 'rgba(178,198,245,0.6)', fontSize: 11, fontWeight: 700,
                                                letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            }}
                                        >
                                            <span>Identificar en catálogo</span>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: card.manualOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }}>
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>
                                        {card.manualOpen && (
                                            <ManualForm
                                                card={card}
                                                onUpdate={updates => updateCard(card.originalInput, updates)}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>}
        </div>
    );
}
