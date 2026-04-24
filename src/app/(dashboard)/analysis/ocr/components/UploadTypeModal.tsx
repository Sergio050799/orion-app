import React, { useState, useCallback } from 'react';

export type DocCategory = 'ficha' | 'permiso' | 'autorizacion' | 'carnet';
export type DocSubtype = 'moderna' | 'antigua' | 'anverso' | 'reverso' | 'ambas';

export interface UploadMeta {
    docCategory: DocCategory;
    docSubtype?: DocSubtype;
}

interface UploadTypeModalProps {
    isBulk: boolean;
    onConfirm: (files: File[], meta: UploadMeta) => void;
    onCancel: () => void;
}

const categories: { key: DocCategory; label: string; hasSubtype: boolean }[] = [
    { key: 'ficha',        label: 'Ficha Técnica',            hasSubtype: true },
    { key: 'permiso',      label: 'Permiso de Circulación',   hasSubtype: false },
    { key: 'autorizacion', label: 'Autorización Provisional', hasSubtype: false },
    { key: 'carnet',       label: 'Carnet de Conducir',       hasSubtype: true },
];

const subtypes: Record<DocCategory, { key: DocSubtype; label: string }[]> = {
    ficha:        [{ key: 'moderna', label: 'Moderna' }, { key: 'antigua', label: 'Antigua' }],
    carnet:       [{ key: 'anverso', label: 'Anverso' }, { key: 'reverso', label: 'Reverso' }, { key: 'ambas', label: 'Ambas caras' }],
    permiso:      [],
    autorizacion: [],
};

export default function UploadTypeModal({ isBulk, onConfirm, onCancel }: UploadTypeModalProps) {
    const [step, setStep] = useState<'category' | 'subtype' | 'files'>('category');
    const [category, setCategory] = useState<DocCategory | null>(null);
    const [subtype, setSubtype] = useState<DocSubtype | null>(null);

    const handleCategorySelect = (cat: DocCategory) => {
        setCategory(cat);
        const catDef = categories.find(c => c.key === cat)!;
        if (catDef.hasSubtype) {
            setStep('subtype');
        } else {
            setStep('files');
        }
    };

    const handleSubtypeSelect = (sub: DocSubtype) => {
        setSubtype(sub);
        setStep('files');
    };

    const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !category) return;
        const files = Array.from(e.target.files);
        const meta: UploadMeta = { docCategory: category, ...(subtype ? { docSubtype: subtype } : {}) };
        onConfirm(files, meta);
    }, [category, subtype, onConfirm]);

    const btnBase = "w-full text-left px-5 py-4 rounded-xl font-bold text-sm transition-all border";
    const btnIdle = "border-[rgba(255,255,255,0.08)] text-white/60 hover:border-[rgba(99,102,241,0.3)] hover:text-white hover:bg-[rgba(99,102,241,0.04)]";
    const btnActive = "border-[rgba(99,102,241,0.4)] text-[#6366f1] bg-[rgba(99,102,241,0.08)]";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={onCancel}
        >
            <div
                className="w-full max-w-md rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200"
                style={{ background: 'rgba(2,6,23,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-base font-black text-white uppercase tracking-wider">
                            {isBulk ? 'Subida masiva' : 'Subir documento'}
                        </h2>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {step === 'category' && 'Paso 1 — Selecciona el tipo de documento'}
                            {step === 'subtype' && 'Paso 2 — Selecciona el subtipo'}
                            {step === 'files' && 'Paso 3 — Selecciona los archivos'}
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Progress dots */}
                <div className="flex gap-2 mb-6">
                    {(['category', 'subtype', 'files'] as const).map((s, i) => (
                        <div
                            key={s}
                            className="h-1 flex-1 rounded-full transition-all"
                            style={{
                                background: step === s ? '#6366f1'
                                    : ((['category', 'subtype', 'files'].indexOf(step) > i) ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)')
                            }}
                        />
                    ))}
                </div>

                {/* Step 1 — Category */}
                {step === 'category' && (
                    <div className="grid grid-cols-2 gap-3">
                        {categories.map(cat => (
                            <button
                                key={cat.key}
                                className={`${btnBase} ${category === cat.key ? btnActive : btnIdle}`}
                                onClick={() => handleCategorySelect(cat.key)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Step 2 — Subtype */}
                {step === 'subtype' && category && (
                    <div className="flex flex-col gap-3">
                        {subtypes[category].map(sub => (
                            <button
                                key={sub.key}
                                className={`${btnBase} ${subtype === sub.key ? btnActive : btnIdle}`}
                                onClick={() => handleSubtypeSelect(sub.key)}
                            >
                                {sub.label}
                            </button>
                        ))}
                        <button
                            className="text-xs font-bold mt-2 transition-colors"
                            style={{ color: 'rgba(255,255,255,0.3)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                            onClick={() => { setCategory(null); setStep('category'); }}
                        >
                            ← Volver
                        </button>
                    </div>
                )}

                {/* Step 3 — Files */}
                {step === 'files' && (
                    <div className="flex flex-col gap-4">
                        <div
                            className="rounded-xl p-4 text-center"
                            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}
                        >
                            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#6366f1' }}>
                                {categories.find(c => c.key === category)?.label}
                                {subtype && ` · ${subtypes[category!].find(s => s.key === subtype)?.label}`}
                            </p>
                            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                {isBulk ? 'Selecciona uno o varios archivos' : 'Selecciona un archivo'}
                            </p>
                        </div>

                        <label
                            className="flex items-center justify-center gap-3 px-6 py-5 rounded-xl cursor-pointer transition-all font-bold text-sm"
                            style={{ border: '2px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; (e.currentTarget as HTMLElement).style.color = '#6366f1'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Elegir archivos
                            <input
                                type="file"
                                className="hidden"
                                multiple={isBulk}
                                accept="image/*,.pdf"
                                onChange={handleFilesSelected}
                            />
                        </label>

                        <button
                            className="text-xs font-bold transition-colors"
                            style={{ color: 'rgba(255,255,255,0.3)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                            onClick={() => {
                                const catDef = categories.find(c => c.key === category);
                                if (catDef?.hasSubtype) { setSubtype(null); setStep('subtype'); }
                                else { setCategory(null); setStep('category'); }
                            }}
                        >
                            ← Volver
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
