"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayout } from "@/context/LayoutContext";
import Image from "next/image";
import AdminPanel from "@/components/saas/admin/AdminPanel";

// ─── Iconos ───────────────────────────────────────────────────────────────────

const IconDashboard = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
);
const IconCorredores = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
);
const IconFlotas = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="2"/>
        <path d="M16 8h4l3 3v5h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
);
const IconEmision = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
);
const IconPlate = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
);
const IconCar = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 002 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
);
const IconDoc = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const IconSettings = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.1a2 2 0 01-1-1.72v-.51a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);
const IconChevronDown = ({ open }: { open: boolean }) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: 'transform 0.25s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
        <path d="m6 9 6 6 6-6"/>
    </svg>
);

// ─── Datos de nav ─────────────────────────────────────────────────────────────

const OPERATIVO = [
    { href: "/flotas",    label: "Dashboard",           Icon: IconDashboard },
    { href: "/corredores",label: "Corredores",           Icon: IconCorredores },
    { href: "/flotas",    label: "Estudio de Flotas",   Icon: IconFlotas },
    { href: "/emission",  label: "Centro de Emisión",   Icon: IconEmision },
];

const HERRAMIENTAS = [
    { href: "/analysis/plates",    label: "Consulta Matrícula",    Icon: IconPlate },
    { href: "/analysis/detection", label: "Identificar Vehículo",  Icon: IconCar },
    { href: "/analysis/ocr",       label: "Escáner Documental",    Icon: IconDoc },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
    const { isSidebarCollapsed } = useLayout();
    const [opOpen, setOpOpen]     = useState(true);
    const [toolOpen, setToolOpen] = useState(true);
    const [adminOpen, setAdminOpen] = useState(false);
    const pathname = usePathname();
    const isAdmin = process.env.NEXT_PUBLIC_ADMIN_MODE === 'true';

    const isActive = (href: string) => pathname === href || pathname.startsWith(href);

    const ACCENT = '#6366f1';

    return (
        <aside style={{
            width: isSidebarCollapsed ? '64px' : '240px',
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            background: 'rgba(2, 6, 23, 0.97)',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(24px)',
            flexShrink: 0, height: '100%',
            display: 'flex', flexDirection: 'column',
            position: 'relative', zIndex: 20, overflow: 'hidden',
        }}>
            {/* Accent line top */}
            <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)` }} />

            {/* Logo */}
            <div className="h-14 flex items-center shrink-0 px-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Link href="/flotas" className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 relative" style={{ width: 28, height: 28, filter: `drop-shadow(0 0 8px rgba(99,102,241,0.3))`, transition: 'filter 0.2s ease' }}>
                        <Image src="/ORION_LOGO.png" alt="ORION" fill className="object-contain" priority />
                    </div>
                    <div className="flex items-center gap-2 min-w-0" style={{
                        maxWidth: isSidebarCollapsed ? '0px' : '180px',
                        opacity: isSidebarCollapsed ? 0 : 1,
                        overflow: 'hidden', whiteSpace: 'nowrap',
                        transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
                    }}>
                        <span className="font-black text-white tracking-[0.18em] text-sm uppercase">ORION</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                            style={{ color: ACCENT, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            SaaS
                        </span>
                    </div>
                </Link>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-3 custom-scrollbar">
                {isSidebarCollapsed ? (
                    /* Modo icono — todos los items verticales */
                    <div className="flex flex-col items-center gap-0.5 px-2">
                        {[...OPERATIVO, ...HERRAMIENTAS].map(({ href, label, Icon }) => {
                            const active = isActive(href);
                            return (
                                <Link key={`${href}-${label}`} href={href} title={label}
                                    className="w-full flex items-center justify-center p-2.5 rounded-xl transition-all duration-150"
                                    style={active
                                        ? { color: ACCENT, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }
                                        : { color: 'rgba(255,255,255,0.32)', border: '1px solid transparent' }}
                                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
                                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.32)'; }}>
                                    <Icon />
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    /* Modo expandido — dos secciones */
                    <div className="px-3 space-y-1">
                        <NavSection label="Operativo" open={opOpen} onToggle={() => setOpOpen(v => !v)} items={OPERATIVO} isActive={isActive} accent={ACCENT} />
                        <NavSection label="Herramientas" open={toolOpen} onToggle={() => setToolOpen(v => !v)} items={HERRAMIENTAS} isActive={isActive} accent={ACCENT} />
                    </div>
                )}
            </nav>

            {/* Footer: usuario (clickable si admin mode) */}
            <div className="shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {!isSidebarCollapsed ? (
                    <div
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                        style={{ border: '1px solid rgba(255,255,255,0.06)', cursor: isAdmin ? 'pointer' : 'default' }}
                        onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                        onMouseEnter={e => { if (isAdmin) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0"
                            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.25)', color: ACCENT }}>
                            U
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold truncate" style={{ color: 'rgba(255,255,255,0.78)' }}>Usuario</p>
                            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.28)' }}>
                                {isAdmin ? 'Administrador' : 'Operador'}
                            </p>
                        </div>
                        {isAdmin && (
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, flexShrink: 0 }}>⚙</span>
                        )}
                    </div>
                ) : (
                    <div className="flex justify-center">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black"
                            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.25)', color: ACCENT, cursor: isAdmin ? 'pointer' : 'default' }}
                            onClick={isAdmin ? () => setAdminOpen(true) : undefined}>
                            U
                        </div>
                    </div>
                )}
            </div>

            {/* AdminPanel slide-over */}
            {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        </aside>
    );
}

// ─── NavSection ───────────────────────────────────────────────────────────────

function NavSection({ label, open, onToggle, items, isActive, accent }: {
    label: string;
    open: boolean;
    onToggle: () => void;
    items: { href: string; label: string; Icon: React.ComponentType }[];
    isActive: (href: string) => boolean;
    accent: string;
}) {
    return (
        <div>
            <button onClick={onToggle}
                className="w-full flex items-center justify-between px-2 py-2 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.28)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}>
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                <IconChevronDown open={open} />
            </button>
            <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <div style={{ overflow: 'hidden' }}>
                    <div className="space-y-0.5 pb-1">
                        {items.map(({ href, label, Icon }) => {
                            const active = isActive(href);
                            return (
                                <Link key={`${href}-${label}`} href={href}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
                                    style={active
                                        ? { color: accent, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }
                                        : { color: 'rgba(255,255,255,0.42)', border: '1px solid transparent' }}
                                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; } }}
                                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.42)'; (e.currentTarget as HTMLElement).style.background = ''; } }}>
                                    <span style={{ color: active ? accent : 'rgba(255,255,255,0.28)', flexShrink: 0 }}>
                                        <Icon />
                                    </span>
                                    <span className="truncate">{label}</span>
                                    {active && <span className="ml-auto w-1 h-1 rounded-full shrink-0" style={{ background: accent, opacity: 0.8 }} />}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
