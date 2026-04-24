"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { useLayout } from "@/context/LayoutContext";
import { usePathname } from "next/navigation";
import AdminPanel from "@/components/saas/admin/AdminPanel";

const navItems = [
    { href: "/corredores",         label: "Corredores" },
    { href: "/flotas",             label: "Estudio de Flotas" },
    { href: "/emission",           label: "Centro de Emisión" },
    { href: "/gestion-documental", label: "Gestión Documental" },
    { href: "/analysis/plates",    label: "Consulta Matrícula" },
    { href: "/analysis/detection", label: "Identificar Vehículo" },
    { href: "/analysis/ocr",       label: "Escáner Documental" },
];

const IconMoon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const IconSun = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

export default function Topbar() {
    const { logout, user } = useAuth();
    const { theme, setTheme } = useLayout();
    const pathname = usePathname();
    const isLight = theme === 'light';
    const isAdmin = process.env.NEXT_PUBLIC_ADMIN_MODE === 'true';
    const [adminOpen, setAdminOpen] = useState(false);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href);

    return (
        <>
            <header
                className="h-14 flex items-center justify-between px-5 shrink-0 relative z-20 transition-all"
                style={{
                    background: 'rgba(2, 6, 23, 0.9)',
                    backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
            >
                {/* Left — logo */}
                <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
                    <div
                        className="relative shrink-0"
                        style={{ width: 26, height: 26, filter: 'drop-shadow(0 0 8px rgba(99,102,241,0.3))' }}
                    >
                        <Image src="/ORION_LOGO.png" alt="ORION" fill className="object-contain" priority />
                    </div>
                    <span className="font-black text-white tracking-[0.18em] text-sm uppercase hidden sm:inline">ORION</span>
                </Link>

                {/* Center — nav pills */}
                <nav className="flex items-center gap-1">
                    {navItems.map(({ href, label }) => {
                        const active = isActive(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                                style={active ? {
                                    color: '#818cf8',
                                    background: 'rgba(99,102,241,0.15)',
                                    border: '1px solid rgba(99,102,241,0.3)',
                                } : {
                                    color: 'rgba(255,255,255,0.42)',
                                    border: '1px solid transparent',
                                }}
                                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; } }}
                                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.42)'; (e.currentTarget as HTMLElement).style.background = ''; } }}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Right — controls */}
                <div className="flex items-center gap-3 shrink-0">

                    {/* Usuario */}
                    {user && (
                        <>
                            <div
                                className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg relative"
                                style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    cursor: isAdmin ? 'pointer' : 'default',
                                }}
                                onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                                title={isAdmin ? 'Configuración' : undefined}
                                onMouseEnter={e => { if (isAdmin) { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; } }}
                                onMouseLeave={e => { if (isAdmin) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; } }}
                            >
                                <div className="relative">
                                    <div
                                        className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0"
                                        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8' }}
                                    >
                                        {user.charAt(0).toUpperCase()}
                                    </div>
                                    {/* Punto indicador admin */}
                                    {isAdmin && (
                                        <span style={{
                                            position: 'absolute', top: -2, right: -2,
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: '#6366f1',
                                            border: '1px solid rgba(2,6,23,0.9)',
                                        }} />
                                    )}
                                </div>
                                <span className="text-[11px] font-bold truncate max-w-[100px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                    {user}
                                </span>
                            </div>
                            <div className="h-5 w-px hidden md:block" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        </>
                    )}

                    {/* Tema */}
                    <button
                        onClick={() => setTheme(isLight ? 'dark' : 'light')}
                        className="p-1.5 rounded-lg transition-all"
                        style={{
                            color: isLight ? '#F59E0B' : 'rgba(255,255,255,0.3)',
                            background: isLight ? 'rgba(245,158,11,0.1)' : 'transparent',
                            border: isLight ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isLight) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; } }}
                        onMouseLeave={e => { if (!isLight) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = ''; } }}
                        title={isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
                    >
                        {isLight ? <IconSun /> : <IconMoon />}
                    </button>

                    <div className="h-5 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

                    {/* Logout */}
                    <button
                        onClick={logout}
                        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest transition-all group"
                        style={{ color: 'rgba(255,255,255,0.3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                    >
                        <span className="hidden md:inline">Salir</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* AdminPanel slide-over */}
            {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        </>
    );
}
