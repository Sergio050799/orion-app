"use client";

import { useAuth } from "@/context/AuthContext";
import { useLayout } from "@/context/LayoutContext";
import { usePathname } from "next/navigation";

export default function Topbar() {
    const { logout } = useAuth();
    const { toggleSidebar } = useLayout();
    const pathname = usePathname();

    const getTitle = () => {
        if (pathname.includes("/ocr")) return "Análisis de Fichas Técnicas (OCR)";
        if (pathname.includes("/plates")) return "Cálculo de Antigüedad por Matrícula";
        if (pathname.includes("/detection")) return "Detección Inteligente de Vehículo";
        return "Dispositivo de Análisis v1";
    };

    return (
        <header className="h-16 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur-md shrink-0 transition-colors">

            {/* Left: Brand + Toggle + Breadcrumb */}
            <div className="flex items-center gap-4">
                <button
                    onClick={toggleSidebar}
                    className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                </button>

                {/* Vertical Divider */}
                <div className="h-6 w-[1px] bg-slate-200 dark:bg-white/10" />

                {/* Title Identity */}
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest hidden md:inline-block">
                    {getTitle()}
                </span>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 hidden md:flex">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sistema Operativo</span>
                </div>
                <div className="h-8 w-[1px] bg-slate-200 dark:bg-white/5 hidden md:block" />
                <button
                    onClick={logout}
                    className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-all uppercase tracking-widest group"
                >
                    <span className="hidden md:inline">Logout</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 11 12" /><line x1="21" y1="12" x2="11" y2="12" /></svg>
                </button>
            </div>
        </header>
    );
}
