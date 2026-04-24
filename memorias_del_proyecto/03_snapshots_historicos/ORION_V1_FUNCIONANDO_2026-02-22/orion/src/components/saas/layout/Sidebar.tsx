"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayout } from "@/context/LayoutContext";
import Image from "next/image";

const IconAnalysis = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
);

const IconChevronDown = ({ className }: { className?: string }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
);

const IconSettings = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);

const IconPlate = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
);

const IconCar = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /><path d="M5 17h2" /><path d="M15 17h2" /></svg>
);

const IconDoc = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
);

export default function Sidebar() {
    const { isSidebarCollapsed, theme, setTheme } = useLayout();
    const [isAnalysisOpen, setIsAnalysisOpen] = useState(true);
    const pathname = usePathname();

    const isActive = (path: string) => pathname === path || pathname.startsWith(path);

    return (
        <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} h-full bg-slate-50 dark:bg-[#0F172A] border-r border-slate-200 dark:border-white/5 flex flex-col transition-all duration-300 ease-in-out shrink-0`}>

            {/* Header / Logo */}
            <div className={`h-16 flex items-center border-b border-slate-200 dark:border-white/5 shrink-0 transition-all overflow-hidden ${isSidebarCollapsed ? 'justify-center px-0' : 'px-6'}`}>
                <Link href="/analysis/ocr" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="relative w-8 h-8 rounded overflow-hidden shadow-[0_0_15px_rgba(60,224,255,0.3)] shrink-0">
                        <Image src="/ORION_LOGO.png" alt="ORION Logo" fill className="object-cover" />
                    </div>
                    {!isSidebarCollapsed && (
                        <div className="flex flex-col whitespace-nowrap">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white tracking-widest text-sm">ORION</span>
                                <span className="text-[10px] font-bold text-[#3CE0FF] bg-[#3CE0FF]/10 px-1.5 rounded uppercase tracking-wider">SaaS</span>
                            </div>
                        </div>
                    )}
                </Link>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">

                {/* Collapsed Mode: Just Icons */}
                {isSidebarCollapsed ? (
                    <div className="flex flex-col items-center gap-4">
                        <Link href="/analysis/plates" className={`p-3 rounded-xl transition-all ${isActive("/analysis/plates") ? "bg-[#3CE0FF]/10 text-[#3CE0FF]" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"}`} title="Cálculo Matrícula">
                            <IconPlate />
                        </Link>
                        <Link href="/analysis/detection" className={`p-3 rounded-xl transition-all ${isActive("/analysis/detection") ? "bg-[#3CE0FF]/10 text-[#3CE0FF]" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"}`} title="Detectar Coche">
                            <IconCar />
                        </Link>
                        <Link href="/analysis/ocr" className={`p-3 rounded-xl transition-all ${isActive("/analysis/ocr") ? "bg-[#3CE0FF]/10 text-[#3CE0FF]" : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5"}`} title="Análisis OCR">
                            <IconDoc />
                        </Link>
                    </div>
                ) : (
                    /* Expanded Mode */
                    <div className="space-y-1">
                        <button
                            onClick={() => setIsAnalysisOpen(!isAnalysisOpen)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-900 dark:hover:text-slate-300 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <IconAnalysis />
                                Análisis
                            </div>
                            <IconChevronDown className={`transition-transform duration-200 ${isAnalysisOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isAnalysisOpen && (
                            <div className="space-y-1 mt-1">
                                <Link
                                    href="/analysis/plates"
                                    className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${isActive("/analysis/plates")
                                        ? "text-[#3CE0FF] bg-[#3CE0FF]/10 font-semibold shadow-[inset_0_0_0_1px_rgba(60,224,255,0.2)]"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5"
                                        }`}
                                >
                                    <IconPlate />
                                    Cálculo matrícula
                                </Link>
                                <Link
                                    href="/analysis/detection"
                                    className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${isActive("/analysis/detection")
                                        ? "text-[#3CE0FF] bg-[#3CE0FF]/10 font-semibold shadow-[inset_0_0_0_1px_rgba(60,224,255,0.2)]"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5"
                                        }`}
                                >
                                    <IconCar />
                                    Detectar coche
                                </Link>
                                <Link
                                    href="/analysis/ocr"
                                    className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-all ${isActive("/analysis/ocr")
                                        ? "text-[#3CE0FF] bg-[#3CE0FF]/10 font-semibold shadow-[inset_0_0_0_1px_rgba(60,224,255,0.2)]"
                                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/5"
                                        }`}
                                >
                                    <IconDoc />
                                    Análisis Fichas (OCR)
                                </Link>
                            </div>
                        )}
                    </div>
                )}
            </nav>

            {/* Footer / User Settings */}
            <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-slate-950/20">
                {!isSidebarCollapsed ? (
                    <>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 shadow-sm">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3CE0FF] to-[#3CE0FF]/50 flex items-center justify-center text-xs font-bold text-slate-900 shadow-lg shadow-[#3CE0FF]/10">
                                JD
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Juan Demo</p>
                                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Administrador</p>
                            </div>
                            <button className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                                <IconSettings />
                            </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between px-2">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setTheme('dark')}
                                    className={`text-[10px] font-bold transition-colors uppercase tracking-widest ${theme === 'dark' ? 'text-[#3CE0FF]' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    Dark
                                </button>
                                <div className="w-[1px] h-3 bg-slate-300 dark:bg-slate-700" />
                                <button
                                    onClick={() => setTheme('light')}
                                    className={`text-[10px] font-bold transition-colors uppercase tracking-widest ${theme === 'light' ? 'text-[#3CE0FF]' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    Light
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <button className="text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-widest px-1">A-</button>
                                <button className="text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors uppercase tracking-widest px-1">A+</button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex justify-center">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3CE0FF] to-[#3CE0FF]/50 flex items-center justify-center text-xs font-bold text-slate-900 shadow-lg shadow-[#3CE0FF]/10">
                            JD
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
