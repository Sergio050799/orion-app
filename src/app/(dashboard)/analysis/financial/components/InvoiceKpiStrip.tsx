import React from 'react';

interface InvoiceKpiStripProps {
    data: {
        processed: number;
        pending: number;
        failed: number;
        totalEuros: number;
    };
}

const cardStyle: React.CSSProperties = {
    background: 'rgba(2,6,23,0.6)',
    border: '1px solid rgba(255,255,255,0.07)',
    backdropFilter: 'blur(16px)',
};

export default function InvoiceKpiStrip({ data }: InvoiceKpiStripProps) {
    const formatter = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-5 rounded-2xl flex flex-col justify-center animate-in fade-in slide-in-from-bottom-2 duration-300" style={cardStyle}>
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Analizadas</span>
                <span className="text-2xl font-black text-emerald-400 leading-none">{data.processed}</span>
            </div>
            <div className="p-5 rounded-2xl flex flex-col justify-center animate-in fade-in slide-in-from-bottom-2 duration-500" style={cardStyle}>
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>En Cola</span>
                <span className="text-2xl font-black text-amber-400 leading-none">{data.pending}</span>
            </div>
            <div className="p-5 rounded-2xl flex flex-col justify-center animate-in fade-in slide-in-from-bottom-2 duration-700" style={cardStyle}>
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Fallidas</span>
                <span className="text-2xl font-black text-red-400 leading-none">{data.failed}</span>
            </div>
            <div
                className="p-5 rounded-2xl flex flex-col justify-center relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-1000"
                style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(16,185,129,0.2)', backdropFilter: 'blur(16px)' }}
            >
                <div className="absolute right-0 top-0 bottom-0 w-0.5 rounded-l-full" style={{ background: '#10B981' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#10B981' }}>Total Procesado</span>
                <span className="text-2xl font-black text-white leading-none">{formatter(data.totalEuros || 0)}</span>
            </div>
        </div>
    );
}
