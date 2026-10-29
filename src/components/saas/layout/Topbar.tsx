"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/context/NotificationContext";
import { useTheme } from "@/context/ThemeContext";
import AdminPanel from "@/components/saas/admin/AdminPanel";

const navItems = [
    { href: "/dashboard",          label: "Dashboard" },
    { href: "/corredores",         label: "Corredores" },
    { href: "/flotas",             label: "Estudio" },
    { href: "/emission",           label: "Flotas" },
    // { href: "/gestion-documental", label: "Documental" }, // oculto temporalmente
    { href: "/analysis/vehiculos", label: "Vehículos" },
    { href: "/analysis/ocr",       label: "Escáner" },
];

function tipoIcon(tipo: string) {
    if (tipo === 'vencimiento') return <span style={{ fontSize: 14 }}>&#9888;</span>;
    if (tipo === 'estado')      return <span style={{ fontSize: 14 }}>&#8635;</span>;
    return <span style={{ fontSize: 14 }}>&#8505;</span>;
}

function tipoColor(tipo: string) {
    if (tipo === 'vencimiento') return '#f0b94d';
    if (tipo === 'estado')      return '#4387ff';
    return '#6d727a';
}

function SunIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1"   x2="12" y2="3" />
            <line x1="12" y1="21"  x2="12" y2="23" />
            <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1"  y1="12" x2="3"  y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
            <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}

const iconBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    display: 'grid', placeItems: 'center',
    background: 'transparent', border: 'none',
    color: '#c8ccd2', cursor: 'pointer',
    transition: 'color 150ms',
    flexShrink: 0,
};

export default function Topbar() {
    const { logout, user } = useAuth();
    const pathname = usePathname();
    const isAdmin = process.env.NEXT_PUBLIC_ADMIN_MODE === 'true';
    const [adminOpen, setAdminOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { theme, toggle } = useTheme();

    useEffect(() => { setMounted(true); }, []);

    const [bellOpen, setBellOpen] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);
    const { notifications, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();

    const isActive = (href: string) => {
        if (href === '/analysis/vehiculos') return pathname.startsWith('/analysis');
        return pathname === href || pathname.startsWith(href);
    };

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false);
            }
        }
        if (bellOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [bellOpen]);

    useEffect(() => { if (bellOpen) refresh(); }, [bellOpen, refresh]);

    return (
        <>
            <header
                style={{
                    position: 'absolute',
                    left: 0, right: 0, top: 0,
                    zIndex: 50,
                    height: 56,
                    background: 'var(--t-topbar-bg)',
                    borderBottom: '1px solid var(--t-topbar-border)',
                }}
            >
                <div style={{
                    height: '100%',
                    maxWidth: 1440,
                    margin: '0 auto',
                    padding: '0 36px',
                    display: 'grid',
                    gridTemplateColumns: '168px 1fr 200px',
                    alignItems: 'center',
                }}>
                    {/* Brand */}
                    <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
                            <Image src="/ORION_LOGO.png" alt="ORION" fill className="object-contain" priority />
                        </div>
                        <span style={{ fontWeight: 650, letterSpacing: '0.08em', fontSize: 15, color: '#f4f4f5' }}>
                            ORION
                        </span>
                    </Link>

                    {/* Nav */}
                    <nav
                        aria-label="Principal"
                        style={{ display: 'flex', alignItems: 'center', gap: 28, justifyContent: 'center', fontSize: 14, overflowX: 'auto', scrollbarWidth: 'none' }}
                    >
                        {navItems.map(({ href, label }) => {
                            const active = isActive(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    style={{
                                        color: active ? '#4387ff' : '#c8ccd2',
                                        fontWeight: active ? 600 : 400,
                                        textDecoration: 'none',
                                        transition: 'color 150ms',
                                        whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#f4f4f5'; }}
                                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#c8ccd2'; }}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right: bell · theme · user · logout */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>

                        {/* Notification bell */}
                        <div ref={bellRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setBellOpen(!bellOpen)}
                                style={{ ...iconBtn, color: bellOpen ? '#f4f4f5' : '#c8ccd2', position: 'relative' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#f4f4f5'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = bellOpen ? '#f4f4f5' : '#c8ccd2'; }}
                                title="Notificaciones"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                    <path d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5z" />
                                    <path d="M10 18.2a2 2 0 0 0 4 0" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: 'absolute', top: 3, right: 3,
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: '#ef4d5a', color: '#fff',
                                        fontSize: 8, fontWeight: 800,
                                        display: 'grid', placeItems: 'center',
                                    }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                                )}
                            </button>

                            {bellOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                                    width: 380, maxHeight: 440,
                                    background: '#0b0c0f',
                                    border: '1px solid rgba(255,255,255,0.10)',
                                    borderRadius: 12,
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                                    overflow: 'hidden',
                                    zIndex: 100,
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5' }}>
                                            Notificaciones
                                            {unreadCount > 0 && (
                                                <span style={{ marginLeft: 8, fontSize: 10, background: 'rgba(239,77,90,0.12)', color: '#ef4d5a', border: '1px solid rgba(239,77,90,0.3)', borderRadius: 999, padding: '2px 8px' }}>
                                                    {unreadCount} nueva{unreadCount > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </span>
                                        {unreadCount > 0 && (
                                            <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4387ff', fontSize: 11, fontWeight: 600 }}>
                                                Marcar todas
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }} className="custom-scrollbar">
                                        {notifications.length === 0 ? (
                                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                                <p style={{ color: '#6d727a', fontSize: 12, margin: 0 }}>Sin notificaciones</p>
                                            </div>
                                        ) : (
                                            notifications.map(n => (
                                                <div
                                                    key={n.id}
                                                    onClick={() => markAsRead(n.id)}
                                                    style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', background: n.leida ? 'transparent' : 'rgba(67,135,255,0.05)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(67,135,255,0.08)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(67,135,255,0.05)')}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                        <span style={{ color: tipoColor(n.tipo), flexShrink: 0, marginTop: 2 }}>{tipoIcon(n.tipo)}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ fontSize: 12, fontWeight: n.leida ? 500 : 700, color: n.leida ? '#8d9198' : '#f4f4f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {n.titulo}
                                                                </span>
                                                                {!n.leida && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4387ff', flexShrink: 0 }} />}
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6d727a', lineHeight: 1.4 }}>{n.mensaje}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Theme toggle */}
                        {mounted && (
                            <button
                                onClick={toggle}
                                style={iconBtn}
                                onMouseEnter={e => { e.currentTarget.style.color = '#f4f4f5'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#c8ccd2'; }}
                                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                                aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
                            >
                                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                            </button>
                        )}

                        {/* User + admin trigger */}
                        {mounted && user && (
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isAdmin ? 'pointer' : 'default' }}
                                onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                                title={isAdmin ? 'Configuración' : undefined}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: '#4387ff', color: '#ffffff',
                                    display: 'grid', placeItems: 'center',
                                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                                }}>
                                    {user.charAt(0).toUpperCase()}{user.charAt(1)?.toUpperCase() || ''}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                    <strong style={{ fontSize: 12, fontWeight: 650, letterSpacing: '0.04em', color: '#f4f4f5' }}>
                                        {user.toUpperCase()}
                                    </strong>
                                    <span style={{ fontSize: 11, color: '#8d9198' }}>Admin</span>
                                </div>
                            </div>
                        )}

                        {/* Logout */}
                        <button
                            onClick={logout}
                            style={iconBtn}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef4d5a'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#c8ccd2'; }}
                            title="Cerrar sesión"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        </>
    );
}
