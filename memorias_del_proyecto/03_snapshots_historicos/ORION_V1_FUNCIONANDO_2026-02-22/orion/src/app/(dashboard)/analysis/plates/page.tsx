"use client";

import { useState } from "react";
import { resolvePlateFromSeed, ResolvedPlate } from "@/core/_source_of_truth/plates/resolver";

// Types
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
        const calcMonth = month ? month - 1 : 0; // Default to Jan if only year is known
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

    const handleCalculate = () => {
        const lines = input.split("\n").filter(l => l.trim().length > 0);
        const newResults: PlateCalculation[] = lines.map(line => {
            const originalInput = line.trim();
            const upperPlate = originalInput.toUpperCase();

            // Normalize: Remove spaces, hyphens
            const normalizedPlate = upperPlate.replace(/[\s-]/g, "");

            let isSemi = false;
            let lettersMatch = null;
            let canonicalPlate = normalizedPlate; // What to display

            // Check for Semirremolque: Starts with R, then 4 digits, then 3 letters
            if (/^R\d{4}[A-Z]{3}$/.test(normalizedPlate)) {
                isSemi = true;
                // Extract last 3 letters
                lettersMatch = normalizedPlate.slice(-3);
                // Canonical format: R-0000-BBB
                canonicalPlate = `R-${normalizedPlate.slice(1, 5)}-${normalizedPlate.slice(5)}`;
            } else {
                // Check post-2000 standard: 4 digits, 3 letters (ignoring vowels conditionally, but regex accepts them here for extracting)
                const stdMatch = normalizedPlate.match(/\d{4}([B-DF-HJ-NP-TV-Z]{3})/);
                if (stdMatch) {
                    lettersMatch = stdMatch[1];
                    // Canonical format: 0000 BBB
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
                <div className="bg-white dark:bg-slate-900/40 p-1 rounded-2xl flex-1 flex flex-col border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-950/50 p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
                        <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-blue-500 dark:text-[#3CE0FF]" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                            Entrada Matrículas
                        </h2>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{input.split("\n").filter(x => x.trim()).length} Líneas</span>
                    </div>

                    <textarea
                        className="flex-1 bg-transparent p-6 font-mono text-sm text-slate-700 dark:text-slate-300 resize-none focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-700 leading-relaxed"
                        placeholder={`Pegue aquí su listado de matrículas...\n\n1234BBB\nR-7788-BCH\nR 1234 BTS`}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        spellCheck={false}
                    />

                    <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/30">
                        <button
                            onClick={handleCalculate}
                            disabled={!input.trim()}
                            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-[#3CE0FF] dark:hover:bg-[#3ce0ff]/90 text-white dark:text-slate-950 py-3 rounded-lg uppercase tracking-widest text-xs font-black shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Calcular Antigüedades
                        </button>
                    </div>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 dark:border-[#3CE0FF]/20 bg-blue-50 dark:bg-[#3CE0FF]/5 flex gap-3 items-center backdrop-blur-sm shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-[#3CE0FF]/10 flex items-center justify-center shrink-0">
                        <span className="text-blue-600 dark:text-[#3CE0FF] font-black text-xs">i</span>
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                        Soporta formato post-2000 (0000 BBB) y Semirremolques (R 0000 BBB). Guiones o espacios intermedios son autodetectados.
                    </p>
                </div>
            </div>

            {/* Right Card: Results */}
            <div className="flex flex-col h-full">
                <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm flex flex-col h-full overflow-hidden relative">
                    <div className="bg-slate-50 dark:bg-slate-950/50 p-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center shrink-0">
                        <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-emerald-500" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            Resultados
                        </h2>
                        {results.length > 0 && (
                            <button className="text-[10px] font-bold text-blue-600 dark:text-[#3CE0FF] hover:opacity-80 transition-colors uppercase tracking-widest">
                                Exportar CSV
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        {results.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-40 dark:opacity-30 pointer-events-none p-12 text-center">
                                <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center mb-4 text-slate-500">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                </div>
                                <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">Esperando Cálculo</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-200 dark:border-white/5">
                                    <tr>
                                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-40">Matrícula</th>
                                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fecha Est.</th>
                                        <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Edad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {results.map((res, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                            <td className="p-4">
                                                <div className="font-mono font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-[#3CE0FF] transition-colors">
                                                    {res.plate}
                                                    {res.confidence < 1.0 && res.confidence > 0 && <span className="text-amber-500 ml-2" title="Estimado">*</span>}
                                                </div>
                                                <div className="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                                                    {res.type}
                                                </div>
                                            </td>
                                            <td className="p-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                {res.date || <span className="text-slate-400 italic">No Data</span>}
                                            </td>
                                            <td className="p-4">
                                                <div className={`text-[10px] font-bold px-2 py-1 rounded inline-block uppercase tracking-wide ${!res.date ? 'bg-slate-200 text-slate-500 dark:bg-slate-800' :
                                                    res.isClassic ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500' :
                                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-500'
                                                    }`}>
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
