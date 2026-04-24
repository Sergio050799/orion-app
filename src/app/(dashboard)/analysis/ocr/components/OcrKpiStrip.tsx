import React from 'react';

interface OcrKpiStripProps {
    kpis: { processed: number, pending: number, failed: number, today: number };
}

export default function OcrKpiStrip({ kpis }: OcrKpiStripProps) {
    return (
        <div className="grid grid-cols-3 gap-4 h-20 shrink-0 mt-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Analizados */}
            <div className="glass-card p-4 flex items-center justify-between rounded-2xl">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Analizados
                    </div>
                    <div className="text-2xl font-black text-emerald-400">{kpis.processed}</div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
            </div>

            {/* En Cola */}
            <div className="glass-card p-4 flex items-center justify-between rounded-2xl">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        En Cola
                    </div>
                    <div className="text-2xl font-black text-amber-400">{kpis.pending}</div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    {kpis.pending > 0
                        ? <div className="w-5 h-5 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin" />
                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                    }
                </div>
            </div>

            {/* Revisión / Fallidos */}
            <div className="glass-card p-4 flex items-center justify-between rounded-2xl">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Revisión / Fallidos
                    </div>
                    <div className="text-2xl font-black text-red-400">{kpis.failed}</div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
            </div>

        </div>
    );
}
