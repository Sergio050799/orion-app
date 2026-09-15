"use client";

import React, { useState, useCallback, useMemo } from 'react';
import EmissionUploadModal, { type LabeledPage, labelToCategory } from './EmissionUploadModal';

// ── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'completo' | 'revisar' | 'error' | 'procesando';

interface EmissionDocument {
    id: string;
    pageIndex: number;
    fileName: string;
    docCategory: string;
    docSubtype?: string;
    status: DocStatus;
    progress: number;
    thumbnail?: string;
    // Extracted fields
    plate?: string;
    propietario?: string;
    marca?: string;
    modelo?: string;
    reportMarkdown?: string | null;
    // Catalog
    catalogoCandidatos?: any[];
    catalogoSeleccionado?: string;
}

interface VehicleGroup {
    plate: string;
    propietario?: string;
    marca?: string;
    modelo?: string;
    documents: EmissionDocument[];
    primaryDoc: EmissionDocument;
}

interface Emission {
    id: string;
    name: string;
    createdAt: string;
    documents: EmissionDocument[];
}

type SortDir = 'asc' | 'desc' | null;
type SortKey = 'plate' | 'marca' | 'modelo' | 'status' | null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function countByType(docs: EmissionDocument[]) {
    const fichas = docs.filter(d => d.docCategory === 'ficha').length;
    const permisos = docs.filter(d => d.docCategory === 'permiso').length;
    const auths = docs.filter(d => d.docCategory === 'autorizacion').length;
    return [
        fichas && `${fichas} ficha${fichas > 1 ? 's' : ''}`,
        permisos && `${permisos} permiso${permisos > 1 ? 's' : ''}`,
        auths && `${auths} autorización${auths > 1 ? 'es' : ''}`,
    ].filter(Boolean).join(' · ');
}

function uniquePlates(docs: EmissionDocument[]) {
    return new Set(docs.map(d => d.plate).filter(Boolean)).size;
}

function duplicatePlates(docs: EmissionDocument[]) {
    const plates = docs.map(d => d.plate).filter(Boolean) as string[];
    const counts: Record<string, number> = {};
    for (const p of plates) counts[p] = (counts[p] || 0) + 1;
    return Object.values(counts).filter(c => c > 1).length;
}

function groupByPlate(docs: EmissionDocument[]): VehicleGroup[] {
    const map = new Map<string, EmissionDocument[]>();
    for (const doc of docs) {
        const key = doc.plate || `__noplaca_${doc.id}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(doc);
    }
    return Array.from(map.entries()).map(([key, docs]) => {
        const primary = docs.find(d => d.docCategory === 'ficha')
            || docs.find(d => d.docCategory === 'permiso')
            || docs[0];
        return {
            plate: key.startsWith('__noplaca_') ? '' : key,
            propietario: primary.propietario,
            marca: primary.marca,
            modelo: primary.modelo,
            documents: docs,
            primaryDoc: primary,
        };
    });
}

const statusOrder: Record<DocStatus, number> = { error: 0, revisar: 1, procesando: 2, completo: 3 };

function worstStatus(docs: EmissionDocument[]): DocStatus {
    const min = Math.min(...docs.map(d => statusOrder[d.status] ?? 3));
    return (Object.entries(statusOrder).find(([, v]) => v === min)?.[0] ?? 'completo') as DocStatus;
}

const statusConfig: Record<DocStatus, { label: string; color: string; bg: string; border: string }> = {
    completo:   { label: 'Completo',   color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)' },
    revisar:    { label: 'Revisar',    color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)' },
    error:      { label: 'Error',      color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)' },
    procesando: { label: 'Procesando', color: '#1240CC', bg: 'rgba(18,64,204,0.1)',  border: 'rgba(18,64,204,0.2)' },
};

const catLabel: Record<string, string> = {
    ficha: 'Ficha', permiso: 'Permiso', autorizacion: 'Autorización',
};

// ── Sortable Header ───────────────────────────────────────────────────────────

function SortableHeader({ label, sortKey, activeKey, dir, onSort }: {
    label: string; sortKey: SortKey; activeKey: SortKey; dir: SortDir; onSort: (k: SortKey) => void;
}) {
    const isActive = activeKey === sortKey;
    return (
        <th className="th cursor-pointer select-none" onClick={() => onSort(sortKey)}>
            <div className="flex items-center gap-1">
                {label}
                <span className="text-[10px]" style={{ color: isActive ? '#818cf8' : 'rgba(178,198,245,0.5)' }}>
                    {isActive && dir === 'asc' ? '↑' : isActive && dir === 'desc' ? '↓' : '↕'}
                </span>
            </div>
        </th>
    );
}

// ── Emission Detail Table ─────────────────────────────────────────────────────

function EmissionDetailTable({ emission, onBack, onExportExcel, onDeleteDocument, onUpdateName }: {
    emission: Emission;
    onBack: () => void;
    onExportExcel: (ids: string[]) => void;
    onDeleteDocument: (docId: string) => Promise<void>;
    onUpdateName: (name: string) => void;
}) {
    const [sortKey, setSortKey] = useState<SortKey>(null);
    const [sortDir, setSortDir] = useState<SortDir>(null);
    const [filterType, setFilterType] = useState<string>('all');
    const [expandedPlate, setExpandedPlate] = useState<string | null>(null);
    const [selectedPlates, setSelectedPlates] = useState<Set<string>>(new Set());
    // A-4 — Editable name
    const [editingName, setEditingName] = useState(false);
    const [emissionName, setEmissionName] = useState(emission.name);
    // A-3 — Editable fields per expanded group (local only)
    const [editedFields, setEditedFields] = useState<Record<string, {
        plate?: string; propietario?: string; marca?: string; modelo?: string;
    }>>({});

    const handleSort = (key: SortKey) => {
        if (sortKey !== key) { setSortKey(key); setSortDir('asc'); return; }
        if (sortDir === 'asc') { setSortDir('desc'); return; }
        if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
    };

    const groups = useMemo(() => {
        let docs = [...emission.documents];
        if (filterType !== 'all') docs = docs.filter(d => d.docCategory === filterType);
        const grouped = groupByPlate(docs);
        if (sortKey && sortDir) {
            grouped.sort((a, b) => {
                let av: string;
                let bv: string;
                if (sortKey === 'status') {
                    av = String(statusOrder[worstStatus(a.documents)]);
                    bv = String(statusOrder[worstStatus(b.documents)]);
                } else {
                    av = (a as any)[sortKey] ?? '';
                    bv = (b as any)[sortKey] ?? '';
                }
                const cmp = av.toString().localeCompare(bv.toString(), 'es');
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }
        return grouped;
    }, [emission.documents, sortKey, sortDir, filterType]);

    const dups = duplicatePlates(emission.documents);

    // Export: collect primary doc IDs for selected plates
    const selectedDocIds = useMemo(() => {
        const ids: string[] = [];
        for (const g of groups) {
            const key = g.plate || `__noplaca_${g.primaryDoc.id}`;
            if (selectedPlates.has(key)) ids.push(g.primaryDoc.id);
        }
        return ids;
    }, [groups, selectedPlates]);

    const allSelected = groups.length > 0 && selectedPlates.size === groups.length;

    return (
        <div className="flex flex-col gap-4 h-full animate-in fade-in duration-300">
            {/* Header */}
            <div
                className="rounded-2xl p-4 flex items-center justify-between shrink-0"
                style={{ background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(61,112,255,0.16)' }}
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'rgba(178,198,245,0.6)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#BDD4FF')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(178,198,245,0.6)')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                    </button>
                    <div>
                        {/* A-4 — Editable name */}
                        {editingName ? (
                            <input
                                autoFocus
                                className="bg-transparent border-b outline-none text-base font-bold text-white"
                                style={{ borderColor: 'rgba(18,64,204,0.5)' }}
                                value={emissionName}
                                onChange={e => setEmissionName(e.target.value)}
                                onBlur={() => { setEditingName(false); onUpdateName(emissionName); }}
                                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                        ) : (
                            <h2
                                className="text-base font-black text-white cursor-text transition-opacity hover:opacity-70"
                                onClick={() => setEditingName(true)}
                            >
                                {emission.name}
                                <span className="ml-2 text-xs font-normal opacity-30">✏</span>
                            </h2>
                        )}
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(178,198,245,0.6)' }}>
                            {uniquePlates(emission.documents)} vehículos · {countByType(emission.documents)} · {formatDate(emission.createdAt)}
                            {dups > 0 && <span className="ml-2 font-bold" style={{ color: '#F59E0B' }}>⚠ {dups} matrículas duplicadas</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg outline-none"
                        style={{ background: 'rgba(61,112,255,0.12)', border: '1px solid rgba(61,112,255,0.22)', color: '#BDD4FF' }}
                    >
                        <option value="all">Todos los tipos</option>
                        <option value="ficha">Fichas</option>
                        <option value="permiso">Permisos</option>
                        <option value="autorizacion">Autorizaciones</option>
                    </select>
                    <button
                        onClick={() => onExportExcel(selectedDocIds)}
                        disabled={selectedDocIds.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all disabled:opacity-30"
                        style={{ color: '#22C55E', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
                        onMouseEnter={e => { if (selectedDocIds.length > 0) (e.currentTarget.style.background = 'rgba(34,197,94,0.16)'); }}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.08)')}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Table */}
            <div
                className="flex-1 rounded-2xl overflow-hidden flex flex-col"
                style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(61,112,255,0.16)' }}
            >
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 z-10" style={{ borderBottom: '1px solid rgba(61,112,255,0.16)' }}>
                            <tr>
                                <th className="py-3 px-4 w-10">
                                    <input type="checkbox"
                                        checked={allSelected}
                                        onChange={() => {
                                            const allKeys = groups.map(g => g.plate || `__noplaca_${g.primaryDoc.id}`);
                                            setSelectedPlates(allSelected ? new Set() : new Set(allKeys));
                                        }}
                                        style={{ accentColor: '#1240CC' }}
                                    />
                                </th>
                                <SortableHeader label="Matrícula"   sortKey="plate"  activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Propietario" sortKey={null}   activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Marca"       sortKey="marca"  activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <SortableHeader label="Modelo"      sortKey="modelo" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <th className="th">Docs</th>
                                <SortableHeader label="Estado"      sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                                <th className="th w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {groups.length === 0 && (
                                <tr><td colSpan={8} className="text-center py-12 text-sm" style={{ color: 'rgba(178,198,245,0.5)' }}>Sin documentos.</td></tr>
                            )}
                            {groups.map(group => {
                                const groupKey = group.plate || `__noplaca_${group.primaryDoc.id}`;
                                const groupStatus = worstStatus(group.documents);
                                const st = statusConfig[groupStatus];
                                const isExpanded = expandedPlate === groupKey;
                                const isSelected = selectedPlates.has(groupKey);
                                const fields = editedFields[groupKey] || {};

                                return (
                                    <React.Fragment key={groupKey}>
                                        {/* Vehicle group row */}
                                        <tr
                                            className="cursor-pointer group transition-colors"
                                            style={{ borderBottom: '1px solid rgba(6,14,50,0.55)' }}
                                            onClick={() => setExpandedPlate(isExpanded ? null : groupKey)}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                                                <input type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        const n = new Set(selectedPlates);
                                                        n.has(groupKey) ? n.delete(groupKey) : n.add(groupKey);
                                                        setSelectedPlates(n);
                                                    }}
                                                    style={{ accentColor: '#1240CC' }}
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                {group.plate ? (
                                                    <span className="font-mono font-bold text-sm px-2 py-0.5 rounded tracking-widest" style={{ background: 'rgba(51,102,255,0.1)', border: '1px solid rgba(61,112,255,0.22)', color: '#BDD4FF' }}>
                                                        {group.plate}
                                                    </span>
                                                ) : <span className="text-xs" style={{ color: 'rgba(178,198,245,0.5)' }}>—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-xs max-w-[140px] truncate" style={{ color: 'rgba(178,198,245,0.78)' }}>
                                                {group.propietario || <span style={{ color: 'rgba(178,198,245,0.5)' }}>—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-xs font-bold" style={{ color: '#BDD4FF' }}>{group.marca || '—'}</td>
                                            <td className="py-3 px-4 text-xs" style={{ color: 'rgba(178,198,245,0.7)' }}>{group.modelo || '—'}</td>
                                            <td className="py-3 px-4">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#818cf8', background: 'rgba(18,64,204,0.1)', border: '1px solid rgba(18,64,204,0.2)' }}>
                                                    {group.documents.length} doc{group.documents.length !== 1 ? 's' : ''}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-[10px] font-bold transition-colors" style={{ color: isExpanded ? '#818cf8' : 'rgba(178,198,245,0.5)' }}>
                                                {isExpanded ? '▲' : '▼'}
                                            </td>
                                        </tr>

                                        {/* Expanded: split panel */}
                                        {isExpanded && (
                                            <tr style={{ background: 'rgba(18,64,204,0.04)', borderBottom: '2px solid rgba(18,64,204,0.2)', borderLeft: '2px solid rgba(18,64,204,0.3)' }}>
                                                <td colSpan={8} className="px-6 py-5">
                                                    <div className="flex gap-5 min-h-[220px]">
                                                        {/* LEFT — Thumbnail */}
                                                        <div className="w-2/5 shrink-0 flex flex-col gap-2">
                                                            <div
                                                                className="rounded-xl overflow-hidden flex items-center justify-center"
                                                                style={{ background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(61,112,255,0.16)' }}
                                                            >
                                                                {group.primaryDoc.thumbnail ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img src={group.primaryDoc.thumbnail} alt="documento" className="w-full object-contain rounded-xl" style={{ maxHeight: 400 }} />
                                                                ) : (
                                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(51,102,255,0.25)" strokeWidth="1">
                                                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            {/* Sub-doc list */}
                                                            <div className="flex flex-col gap-1">
                                                                {group.documents.map(d => {
                                                                    const ds = statusConfig[d.status];
                                                                    return (
                                                                        <div key={d.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(12,28,82,0.45)' }}>
                                                                            <span className="text-[9px] font-bold truncate max-w-[80px]" style={{ color: 'rgba(178,198,245,0.78)' }}>
                                                                                {catLabel[d.docCategory] || d.docCategory}
                                                                                {d.docSubtype && ` · ${d.docSubtype}`}
                                                                            </span>
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-[9px] font-bold" style={{ color: ds.color }}>{ds.label}</span>
                                                                                <button
                                                                                    onClick={e => { e.stopPropagation(); onDeleteDocument(d.id); }}
                                                                                    className="p-0.5 rounded transition-colors"
                                                                                    style={{ color: 'rgba(178,198,245,0.5)' }}
                                                                                    onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                                                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(178,198,245,0.5)')}
                                                                                >
                                                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* RIGHT — Editable fields + report + catalog */}
                                                        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                                            {/* Editable fields */}
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {[
                                                                    { key: 'plate',       label: 'Matrícula',   placeholder: 'Sin matrícula',   val: fields.plate       ?? group.plate },
                                                                    { key: 'propietario', label: 'Propietario', placeholder: 'Sin propietario',  val: fields.propietario ?? group.propietario ?? '' },
                                                                    { key: 'marca',       label: 'Marca',       placeholder: 'Sin marca',        val: fields.marca       ?? group.marca ?? '' },
                                                                    { key: 'modelo',      label: 'Modelo',      placeholder: 'Sin modelo',       val: fields.modelo      ?? group.modelo ?? '' },
                                                                ].map(({ key, label, placeholder, val }) => (
                                                                    <div key={key} className="flex flex-col gap-1">
                                                                        <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(178,198,245,0.5)' }}>{label}</label>
                                                                        <input
                                                                            className="w-full bg-transparent border-b text-sm outline-none transition-colors"
                                                                            style={{ borderColor: 'rgba(61,112,255,0.22)', color: '#BDD4FF' }}
                                                                            value={val || ''}
                                                                            placeholder={placeholder}
                                                                            onChange={e => setEditedFields(prev => ({
                                                                                ...prev,
                                                                                [groupKey]: { ...(prev[groupKey] || {}), [key]: e.target.value }
                                                                            }))}
                                                                            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.6)')}
                                                                            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)')}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Report */}
                                                            {group.primaryDoc.reportMarkdown ? (
                                                                <div
                                                                    className="text-xs rounded-xl p-4 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar flex-1"
                                                                    style={{ background: 'rgba(12,28,82,0.45)', border: '1px solid rgba(51,102,255,0.1)', color: 'rgba(178,198,245,0.78)', lineHeight: 1.6 }}
                                                                >
                                                                    {group.primaryDoc.reportMarkdown}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs italic" style={{ color: 'rgba(178,198,245,0.5)' }}>Sin informe disponible.</p>
                                                            )}

                                                            {/* Catalog candidates */}
                                                            {group.primaryDoc.catalogoCandidatos && group.primaryDoc.catalogoCandidatos.length > 0 && (
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(178,198,245,0.5)' }}>Catálogo</label>
                                                                    <select
                                                                        className="text-[10px] font-bold px-3 py-2 rounded-lg outline-none"
                                                                        style={{ background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(18,64,204,0.25)', color: '#BDD4FF' }}
                                                                        defaultValue={group.primaryDoc.catalogoCandidatos[0]?.id_veh ?? ''}
                                                                        onClick={e => e.stopPropagation()}
                                                                    >
                                                                        <option value="">-- versión --</option>
                                                                        {group.primaryDoc.catalogoCandidatos.map((c: any) => {
                                                                            const yIni = c.fec_ini_comerc ? new Date(c.fec_ini_comerc).getFullYear() : null;
                                                                            const yFin = c.fec_fin_comerc ? new Date(c.fec_fin_comerc).getFullYear() : null;
                                                                            const yStr = yIni && yFin ? ` ${yIni}–${yFin}` : yIni ? ` desde ${yIni}` : '';
                                                                            return (
                                                                                <option key={c.id_veh} value={c.id_veh} style={{ background: '#020617' }}>
                                                                                    {c.marca} {c.modelo} — {c.version}{yStr} · {c.kw}kw/{c.cv}cv → {c.score ?? 0}%
                                                                                </option>
                                                                            );
                                                                        })}
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EmissionOcrFlow() {
    const [emissions, setEmissions] = useState<Emission[]>([]);
    const [activeEmission, setActiveEmission] = useState<Emission | null>(null);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [processing, setProcessing] = useState(false);

    const handleNewEmission = useCallback(async (pages: LabeledPage[], files: File[]) => {
        setShowUploadModal(false);
        setProcessing(true);

        const emissionId = Math.random().toString(36).substring(7);
        const emissionName = `Emisión masiva #${emissions.length + 1}`;

        const newDocs: EmissionDocument[] = pages.map((page, i) => {
            const meta = labelToCategory[page.label!] || { docCategory: 'ficha' };
            return {
                id: `${emissionId}-${i}`,
                pageIndex: page.pageIndex,
                fileName: page.fileName,
                thumbnail: page.thumbnail,
                docCategory: meta.docCategory,
                docSubtype: meta.docSubtype,
                status: 'procesando',
                progress: 0,
            };
        });

        const newEmission: Emission = {
            id: emissionId,
            name: emissionName,
            createdAt: new Date().toISOString(),
            documents: newDocs,
        };

        setEmissions(prev => [newEmission, ...prev]);
        setActiveEmission(newEmission);
        setProcessing(false);

        const updatedDocs = [...newDocs];
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const doc = newDocs[i];
            if (!page.blob) continue;

            const meta = labelToCategory[page.label!] || { docCategory: 'ficha' };
            const formData = new FormData();
            if (page.isFromPdf && page.sourceFile && page.pdfPageNumber != null) {
                // PDF original + número de página → el backend extrae a resolución nativa con pdf-lib
                formData.append('file', page.sourceFile);
                formData.append('pageNumber', String(page.pdfPageNumber));
            } else {
                // Imagen directa (ya procesada: rotación + autoScan aplicados en el modal)
                formData.append('file', new File([page.blob], page.fileName, { type: page.blob.type || 'image/jpeg' }));
            }
            formData.append('docId', doc.id);
            formData.append('docCategory', meta.docCategory);
            if (meta.docSubtype) formData.append('docSubtype', meta.docSubtype);

            try {
                const res = await fetch('/api/orion/document-intelligence/analyze', {
                    method: 'POST',
                    body: formData,
                });
                if (!res.ok) {
                    const errorText = await res.text();
                    console.error(`[ORION][EMISSION] OCR failed for ${page.fileName}:`, res.status, errorText);
                    updatedDocs[i] = { ...doc, status: 'error', progress: 100 };
                } else {
                    const data = await res.json();
                    const plate       = data.extractedFields?.plate || data.extractedFields?.license_plate || data.extractedFields?.matricula;
                    const marca       = data.extractedFields?.D1 || data.extractedFields?.brand || data.extractedFields?.marca;
                    const modelo      = data.extractedFields?.modelo    // campo normalizado por Jerry (D3 > D2 código interno)
                                     || data.extractedFields?.D3        // fallback explícito D3
                                     || data.extractedFields?.model     // permiso/autorización
                                     || data.extractedFields?.D2;       // último recurso (puede ser código interno)
                    const propietario = data.extractedFields?.holder?.full_name?.value || data.extractedFields?.titular || data.extractedFields?.propietario;
                    const hasFields = plate || marca || modelo;
                    const status: DocStatus = hasFields ? 'completo' : 'revisar';
                    updatedDocs[i] = {
                        ...doc,
                        status,
                        progress: 100,
                        plate,
                        propietario,
                        marca,
                        modelo,
                        catalogoCandidatos: data.catalogoCandidatos || [],
                        reportMarkdown: data.reportMarkdown || null,
                    };
                }
            } catch {
                updatedDocs[i] = { ...doc, status: 'error', progress: 0 };
            }

            const finalEmission = { ...newEmission, documents: [...updatedDocs] };
            setEmissions(prev => prev.map(e => e.id === emissionId ? finalEmission : e));
            setActiveEmission(finalEmission);
        }
    }, [emissions.length]);

    const handleDeleteEmission = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/emission/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setEmissions(prev => prev.filter(e => e.id !== id));
                if (activeEmission?.id === id) setActiveEmission(null);
            }
        } catch { /* silencioso */ }
    }, [activeEmission]);

    const handleDeleteDocument = useCallback(async (emissionId: string, docId: string) => {
        try {
            const res = await fetch(`/api/emission/${emissionId}/documento/${docId}`, { method: 'DELETE' });
            if (res.ok) {
                setEmissions(prev => prev.map(e => {
                    if (e.id !== emissionId) return e;
                    return { ...e, documents: e.documents.filter(d => d.id !== docId) };
                }));
                setActiveEmission(prev => {
                    if (!prev || prev.id !== emissionId) return prev;
                    return { ...prev, documents: prev.documents.filter(d => d.id !== docId) };
                });
            }
        } catch { /* silencioso */ }
    }, []);

    const handleUpdateEmissionName = useCallback((name: string) => {
        if (!activeEmission) return;
        const updated = { ...activeEmission, name };
        setEmissions(prev => prev.map(e => e.id === activeEmission.id ? updated : e));
        setActiveEmission(updated);
    }, [activeEmission]);

    const handleExportExcel = useCallback(async (ids: string[]) => {
        if (!activeEmission || ids.length === 0) return;

        const selectedDocs = activeEmission.documents.filter(d => ids.includes(d.id));
        const byPlate = new Map<string, EmissionDocument[]>();
        for (const doc of selectedDocs) {
            const key = doc.plate || doc.id;
            if (!byPlate.has(key)) byPlate.set(key, []);
            byPlate.get(key)!.push(doc);
        }
        const representativas = Array.from(byPlate.values()).map(docs => {
            const ficha = docs.find(d => d.docCategory === 'ficha');
            return ficha || docs[0];
        });
        const exportIds = representativas.map(d => d.id);

        try {
            const res = await fetch('/api/export/excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: exportIds }),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `orion_emision_${activeEmission.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch { /* silencioso */ }
    }, [activeEmission]);

    // Detail view
    if (activeEmission) {
        return (
            <div className="h-full flex flex-col">
                <EmissionDetailTable
                    emission={activeEmission}
                    onBack={() => setActiveEmission(null)}
                    onExportExcel={handleExportExcel}
                    onDeleteDocument={(docId) => handleDeleteDocument(activeEmission.id, docId)}
                    onUpdateName={handleUpdateEmissionName}
                />
            </div>
        );
    }

    // List view
    return (
        <div className="h-full flex flex-col gap-4 animate-in fade-in duration-500">
            {/* Header */}
            <div
                className="flex items-center justify-between shrink-0 rounded-2xl p-4"
                style={{ background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(61,112,255,0.16)' }}
            >
                <div>
                    <h1 className="text-xl font-black text-white uppercase tracking-tight">Centro de Emisión</h1>
                    <p className="text-xs mt-1" style={{ color: 'rgba(178,198,245,0.6)' }}>
                        Procesa batches de documentos · Fichas · Permisos · Autorizaciones
                    </p>
                </div>
                <button
                    onClick={() => setShowUploadModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all text-white"
                    style={{ background: '#1240CC', boxShadow: '0 0 20px rgba(18,64,204,0.3)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#818cf8')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#1240CC')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Nueva emisión
                </button>
            </div>

            {/* Emissions list */}
            {emissions.length === 0 ? (
                <div
                    className="flex-1 rounded-2xl flex flex-col items-center justify-center gap-4"
                    style={{ background: 'rgba(2,6,23,0.4)', border: '1px dashed rgba(61,112,255,0.22)' }}
                >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(51,102,255,0.25)" strokeWidth="1">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <p className="text-sm font-bold" style={{ color: 'rgba(178,198,245,0.5)' }}>Sin emisiones todavía</p>
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition-all text-white"
                        style={{ background: 'rgba(18,64,204,0.15)', border: '1px solid rgba(18,64,204,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,64,204,0.25)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,64,204,0.15)')}
                    >
                        Crear primera emisión
                    </button>
                </div>
            ) : (
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                    {emissions.map((em) => {
                        const veh = uniquePlates(em.documents);
                        const dups = duplicatePlates(em.documents);
                        const isProcessing = em.documents.some(d => d.status === 'procesando');
                        return (
                            <div
                                key={em.id}
                                className="rounded-2xl px-5 py-4 flex items-center justify-between cursor-pointer group transition-all"
                                style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(51,102,255,0.1)' }}
                                onClick={() => setActiveEmission(em)}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(18,64,204,0.3)')}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(51,102,255,0.1)')}
                            >
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-black text-white">{em.name}</span>
                                        {isProcessing && (
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse" style={{ color: '#818cf8', background: 'rgba(18,64,204,0.12)' }}>
                                                PROCESANDO
                                            </span>
                                        )}
                                        {dups > 0 && (
                                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.1)' }}>
                                                ⚠ {dups} duplicados
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px]" style={{ color: 'rgba(178,198,245,0.6)' }}>
                                        {veh} vehículo{veh !== 1 ? 's' : ''} · {countByType(em.documents)} · {formatDate(em.createdAt)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        className="text-xs font-bold px-4 py-2 rounded-xl transition-all"
                                        style={{ color: '#818cf8', background: 'rgba(18,64,204,0.1)', border: '1px solid rgba(18,64,204,0.25)' }}
                                    >
                                        Ver →
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDeleteEmission(em.id); }}
                                        className="p-2 rounded-xl transition-all"
                                        style={{ color: 'rgba(178,198,245,0.5)', background: 'rgba(6,14,50,0.55)', border: '1px solid rgba(61,112,255,0.16)' }}
                                        onMouseEnter={e => { (e.currentTarget.style.color = '#EF4444'); (e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'); }}
                                        onMouseLeave={e => { (e.currentTarget.style.color = 'rgba(178,198,245,0.5)'); (e.currentTarget.style.borderColor = 'rgba(61,112,255,0.16)'); }}
                                        title="Eliminar emisión"
                                    >
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showUploadModal && (
                <EmissionUploadModal
                    onConfirm={handleNewEmission}
                    onCancel={() => setShowUploadModal(false)}
                />
            )}

            {processing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                    <div className="rounded-2xl p-8 flex flex-col items-center gap-4" style={{ background: 'rgba(2,6,23,0.97)', border: '1px solid rgba(18,64,204,0.25)' }}>
                        <svg className="animate-spin w-10 h-10" style={{ color: '#1240CC' }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-sm font-bold" style={{ color: '#818cf8' }}>Preparando emisión...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
