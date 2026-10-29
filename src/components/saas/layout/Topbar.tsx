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
    { href: "/analysis/vehiculos", label: "Vehículos" },
    { href: "/analysis/ocr",       label: "Escáner" },
];

function tipoColor(tipo: string) {
    if (tipo === 'vencimiento') return 'var(--warn)';
    if (tipo === 'estado')      return 'var(--blue)';
    return 'var(--quiet)';
}

function tipoIcon(tipo: string) {
    if (tipo === 'vencimiento') return <span style={{ fontSize: 14 }}>&#9888;</span>;
    if (tipo === 'estado')      return <span style={{ fontSize: 14 }}>&#8635;</span>;
    return <span style={{ fontSize: 14 }}>&#8505;</span>;
}

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}

function BellIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5z" />
            <path d="M10 18.2a2 2 0 0 0 4 0" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

const ICON_BTN: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 6,
    display: 'grid', placeItems: 'center',
    background: 'transparent', border: 'none',
    color: 'var(--sub)', cursor: 'pointer',
    transition: 'background 160ms, color 160ms',
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
        if (href === '/analysis/vehiculos') return pathname.startsWith('/analysis') && !pathname.startsWith('/analysis/ocr');
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

    const initials = user ? (user.charAt(0).toUpperCase() + (user.charAt(1)?.toUpperCase() || '')) : '?';

    return (
        <>
            <style>{`
                .topbar-nav-link{
                    position:relative;
                    color:var(--sub);font-size:15px;font-weight:400;
                    text-decoration:none;white-space:nowrap;
                    transition:color .16s;
                    padding-bottom:1px;
                }
                .topbar-nav-link{flex-shrink:0}
                @media (max-width:640px){.tb-word{display:none}}
                .topbar-nav-link:hover{color:var(--text)}
                .topbar-nav-link.active{color:var(--text);font-weight:600}
                .topbar-nav-link.active::after{
                    content:"";position:absolute;left:0;right:0;bottom:-15px;
                    height:2px;background:var(--blue);
                }
                .topbar-icon-btn{
                    width:36px;height:36px;border-radius:6px;
                    display:grid;place-items:center;
                    background:transparent;border:none;
                    color:var(--sub);cursor:pointer;
                    transition:background .16s,color .16s;
                }
                .topbar-icon-btn:hover{background:var(--hover);color:var(--text)}
                .topbar-icon-btn.danger:hover{color:var(--danger)}
            `}</style>

            <header style={{
                position: 'absolute', left: 0, right: 0, top: 0,
                zIndex: 50, height: 72,
                background: 'var(--bg)',
                borderBottom: '1px solid var(--line)',
            }}>
                <div style={{
                    height: '100%', maxWidth: 1640, margin: '0 auto',
                    padding: '0 clamp(18px,3cqw,48px)',
                    display: 'flex', alignItems: 'center',
                    gap: 'clamp(18px,3cqw,60px)',
                }}>
                    {/* Brand */}
                    <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', flexShrink: 0 }}>
                        <div style={{ position: 'relative', width: 25, height: 27, flexShrink: 0 }}>
                            <Image src="/ORION_LOGO.png" alt="ORION" fill sizes="40px" className="object-contain" priority />
                        </div>
                        <span className="tb-word" style={{
                            fontWeight: 600, letterSpacing: '0.14em', fontSize: 20,
                            color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1,
                        }}>
                            ORION
                        </span>
                    </Link>

                    {/* Nav */}
                    <nav
                        aria-label="Principal"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 'clamp(16px,2.2cqw,34px)',
                            flex: 1, overflowX: 'auto', scrollbarWidth: 'none',
                        }}
                    >
                        {navItems.map(({ href, label }) => {
                            const active = isActive(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className={`topbar-nav-link${active ? ' active' : ''}`}
                                    aria-current={active ? 'page' : undefined}
                                >
                                    {label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

                        {/* Bell */}
                        <div ref={bellRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setBellOpen(!bellOpen)}
                                className="topbar-icon-btn"
                                title="Notificaciones"
                                aria-label="Notificaciones"
                                style={{ position: 'relative', color: bellOpen ? 'var(--text)' : undefined }}
                            >
                                <BellIcon />
                                {unreadCount > 0 && (
                                    <span style={{
                                        position: 'absolute', top: 4, right: 4,
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: 'var(--danger)', color: '#fff',
                                        fontSize: 8, fontWeight: 800,
                                        display: 'grid', placeItems: 'center',
                                    }}>
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </button>

                            {bellOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                                    width: 380, maxHeight: 440,
                                    background: 'var(--soft)',
                                    border: '1px solid var(--line)',
                                    borderRadius: 10,
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                                    overflow: 'hidden', zIndex: 100,
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line)' }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                            Notificaciones
                                            {unreadCount > 0 && (
                                                <span style={{ marginLeft: 8, fontSize: 10.5, background: 'rgba(224,92,92,.1)', color: 'var(--danger)', border: '1px solid rgba(224,92,92,.25)', borderRadius: 999, padding: '2px 8px' }}>
                                                    {unreadCount} nueva{unreadCount > 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </span>
                                        {unreadCount > 0 && (
                                            <button onClick={markAllAsRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 11, fontWeight: 600 }}>
                                                Marcar todas
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }} className="custom-scrollbar">
                                        {notifications.length === 0 ? (
                                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                                <p style={{ color: 'var(--quiet)', fontSize: 12.5, margin: 0 }}>Sin notificaciones</p>
                                            </div>
                                        ) : (
                                            notifications.map(n => (
                                                <div
                                                    key={n.id}
                                                    onClick={() => markAsRead(n.id)}
                                                    style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', cursor: 'pointer', background: n.leida ? 'transparent' : 'rgba(73,137,255,.06)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(73,137,255,.06)')}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                        <span style={{ color: tipoColor(n.tipo), flexShrink: 0, marginTop: 2 }}>{tipoIcon(n.tipo)}</span>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ fontSize: 12.5, fontWeight: n.leida ? 500 : 700, color: n.leida ? 'var(--quiet)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {n.titulo}
                                                                </span>
                                                                {!n.leida && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />}
                                                            </div>
                                                            <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'var(--quiet)', lineHeight: 1.4 }}>{n.mensaje}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Theme */}
                        {mounted && (
                            <button
                                onClick={toggle}
                                className="topbar-icon-btn"
                                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                                aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
                            >
                                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                            </button>
                        )}

                        {/* Avatar + user */}
                        {mounted && user && (
                            <div
                                style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: isAdmin ? 'pointer' : 'default', marginLeft: 2 }}
                                onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                                title={isAdmin ? 'Configuración' : undefined}
                            >
                                <div style={{
                                    width: 32, height: 32, borderRadius: '50%',
                                    background: '#213c78', color: '#fff',
                                    display: 'grid', placeItems: 'center',
                                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                                }}>
                                    {initials}
                                </div>
                            </div>
                        )}

                        {/* Logout */}
                        <button
                            onClick={logout}
                            className="topbar-icon-btn danger"
                            title="Cerrar sesión"
                            aria-label="Cerrar sesión"
                            style={ICON_BTN}
                        >
                            <LogoutIcon />
                        </button>
                    </div>
                </div>
            </header>

            {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        </>
    );
}
