"use client";

import { useState } from "react";
import { resolvePlateFromSeed, ResolvedPlate } from "@/core/_source_of_truth/plates/resolver";

interface PlateCalculation {
    plate: string;
    originalInput: string;
    date: string | null;
    age: string;
    isClassic: boolean;
    confidence: number;
    type: "Standard" | "Semirremolque" | "Unknown";
}


export default function PlatesAnalysisPage() {
    const [input, setInput] = useState("");
    const [results, setResults] = useState<PlateCalculation[]>([]);

    const calculateAge = (year: number, month: number | null) => {
        const now = new Date();
        const calcMonth = month ? month - 1 : 0;
        const regDate = new Date(year, calcMonth);
        const diffMs = now.getTime() - regDate.getTime();
        const diffDate = new Date(diffMs);
        const years = Math.abs(diffDate.getUTCFullYear() - 1970);
        if (month) {
            const months = diffDate.getUTCMonth();
            return `${years} años, ${months} meses`;
        }
        return `~${years} años`;
    };

    const getTipoLabel = (type: string) => {
        if (type === "Semirremolque") return "Semirremolque";
        if (type === "Standard") return "Turismo / Furgoneta";
        return "Desconocido";
    };

    const handleExportCsv = () => {
        if (results.length === 0) return;
        const BOM = "\uFEFF";
        const header = "Matrícula;Fecha Estimada;Antigüedad;Tipo";
        const rows = results.map(r =>
            `${r.plate};${r.date || "N/A"};${r.age};${getTipoLabel(r.type)}`
        );
        const csv = BOM + [header, ...rows].join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const today = new Date().toISOString().slice(0, 10);
        a.download = `consulta_matriculas_${today}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCalculate = () => {
        const lines = input.split("\n").filter(l => l.trim().length > 0);
        const newResults: PlateCalculation[] = lines.map(line => {
            const originalInput = line.trim();
            const upperPlate = originalInput.toUpperCase();
            const normalizedPlate = upperPlate.replace(/[\s-]/g, "");

            let isSemi = false;
            let lettersMatch = null;
            let canonicalPlate = normalizedPlate;

            if (/^R\d{4}[A-Z]{3}$/.test(normalizedPlate)) {
                isSemi = true;
                lettersMatch = normalizedPlate.slice(-3);
                canonicalPlate = `R-${normalizedPlate.slice(1, 5)}-${normalizedPlate.slice(5)}`;
            } else {
                const stdMatch = normalizedPlate.match(/\d{4}([B-DF-HJ-NP-TV-Z]{3})/);
                if (stdMatch) {
                    lettersMatch = stdMatch[1];
                    canonicalPlate = `${normalizedPlate.slice(0, 4)} ${normalizedPlate.slice(4)}`;
                }
            }

            const resolved = lettersMatch ? resolvePlateFromSeed(lettersMatch, isSemi) : null;

            if (resolved) {
                return {
                    plate: canonicalPlate,
                    originalInput,
                    date: resolved.month ? `${resolved.month}/${resolved.year}` : `${resolved.year}`,
                    age: calculateAge(resolved.year, resolved.month),
                    isClassic: (new Date().getFullYear() - resolved.year) >= 25,
                    confidence: resolved.confidence,
                    type: resolved.type
                };
            } else {
                return {
                    plate: canonicalPlate || originalInput,
                    originalInput,
                    date: null,
                    age: "Desconocido / Inválido",
                    isClassic: false,
                    confidence: 0,
                    type: "Unknown"
                };
            }
        });
        setResults(newResults);
    };

    return (
        <div className="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">

            {/* Left Card: Input */}
            <div className="flex flex-col gap-6">
                <div className="glass-card p-1 rounded-2xl flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 flex justify-between items-center" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                <line x1="2" y1="10" x2="22" y2="10" />
                            </svg>
                            Entrada Matrículas
                        </h2>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {input.split("\n").filter(x => x.trim()).length} Líneas
                        </span>
                    </div>

                    <textarea
                        className="flex-1 bg-transparent p-6 font-mono text-sm text-white/80 resize-none focus:outline-none leading-relaxed"
                        placeholder={`Pegue aquí su listado de matrículas...\n\n1234BBB\nR-7788-BCH\nR 1234 BTS`}
                        style={{ caretColor: '#6366f1' }}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        spellCheck={false}
                    />

                    <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(2,6,23,0.5)' }}>
                        <button
                            onClick={handleCalculate}
                            disabled={!input.trim()}
                            className="btn-primary w-full py-3 rounded-lg uppercase tracking-widest text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Calcular Antigüedades
                        </button>
                    </div>
                </div>

                {/* Info note */}
                <div
                    className="p-4 rounded-xl flex gap-3 items-center"
                    style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
                >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-black text-xs" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                        i
                    </div>
                    <p className="text-[10px] leading-relaxed font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Soporta formato post-2000 (0000 BBB) y Semirremolques (R 0000 BBB). Guiones o espacios intermedios son autodetectados.
                    </p>
                </div>
            </div>

            {/* Right Card: Results */}
            <div className="flex flex-col h-full">
                <div className="glass-card rounded-2xl flex flex-col h-full overflow-hidden relative">
                    <div className="p-4 flex justify-between items-center shrink-0" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <h2 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Resultados
                        </h2>
                        {results.length > 0 && (
                            <button
                                onClick={handleExportCsv}
                                className="text-[10px] font-bold uppercase tracking-widest transition-colors"
                                style={{ color: '#6366f1' }}
                            >
                                Exportar CSV
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        {results.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-12 text-center" style={{ opacity: 0.25 }}>
                                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                                        <line x1="12" y1="5" x2="12" y2="19" />
                                        <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                </div>
                                <p className="text-sm font-bold text-white uppercase tracking-widest">Esperando Cálculo</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead
                                    className="sticky top-0 z-10"
                                    style={{ background: 'rgba(2,6,23,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    <tr>
                                        <th className="th w-40">Matrícula</th>
                                        <th className="th">Tipo</th>
                                        <th className="th">Fecha Est.</th>
                                        <th className="th">Edad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((res, i) => (
                                        <tr
                                            key={i}
                                            className="group transition-colors"
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                                        >
                                            <td className="p-4">
                                                <div className="font-mono font-bold text-white/85 text-sm group-hover:text-indigo-400 transition-colors">
                                                    {res.plate}
                                                    {res.confidence < 1.0 && res.confidence > 0 && (
                                                        <span className="text-amber-400 ml-2" title="Estimado">*</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                                    {getTipoLabel(res.type)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                {res.date || <span className="italic" style={{ color: 'rgba(255,255,255,0.25)' }}>No Data</span>}
                                            </td>
                                            <td className="p-4">
                                                <div
                                                    className="text-[10px] font-bold px-2 py-1 rounded inline-block uppercase tracking-wide"
                                                    style={!res.date
                                                        ? { color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }
                                                        : res.isClassic
                                                            ? { color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }
                                                            : { color: '#10B981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }
                                                    }
                                                >
                                                    {res.age}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}
