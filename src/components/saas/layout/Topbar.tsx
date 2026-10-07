"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/context/NotificationContext";
import AdminPanel from "@/components/saas/admin/AdminPanel";

const navItems = [
    { href: "/dashboard",           label: "Dashboard" },
    { href: "/corredores",          label: "Corredores" },
    { href: "/flotas",              label: "Estudio" },
    { href: "/emission",            label: "Flotas" },
    { href: "/gestion-documental",  label: "Documental" },
    { href: "/analysis/vehiculos",  label: "Vehículos" },
    { href: "/analysis/ocr",        label: "Escáner" },
];

function tipoColor(tipo: string) {
    if (tipo === 'vencimiento') return '#F0B94D';
    if (tipo === 'estado') return '#4387FF';
    return '#8d9198';
}

function tipoIcon(tipo: string) {
    if (tipo === 'vencimiento') return <span style={{ fontSize: 13 }}>&#9888;</span>;
    if (tipo === 'estado') return <span style={{ fontSize: 13 }}>&#8635;</span>;
    return <span style={{ fontSize: 13 }}>&#8505;</span>;
}

export default function Topbar() {
    const { logout, user } = useAuth();
    const pathname = usePathname();
    const isAdmin = process.env.NEXT_PUBLIC_ADMIN_MODE === 'true';
    const [adminOpen, setAdminOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

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

    useEffect(() => {
        if (bellOpen) refresh();
    }, [bellOpen, refresh]);

    return (
        <>
            <header
                style={{
                    position: 'absolute',
                    top: 22, left: 36, right: 36,
                    zIndex: 50,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    background: '#050607',
                }}
            >
                {/* Brand — ancho fijo 168px como en la referencia */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 168, flexShrink: 0 }}>
                    <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                        <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
                            <Image src="/ORION_LOGO.png" alt="ORION" fill style={{ objectFit: 'contain' }} priority />
                        </div>
                        <span style={{
                            fontWeight: 650, fontSize: 15, letterSpacing: '0.08em',
                            color: '#F4F4F5', fontFamily: 'inherit',
                        }}>
                            ORION
                        </span>
                    </Link>
                </div>

                {/* Nav centrada */}
                <nav style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 28,
                    fontSize: 14,
                }}>
                    {navItems.map(({ href, label }) => {
                        const active = isActive(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                style={{
                                    color: active ? '#4387FF' : '#c8ccd2',
                                    fontWeight: active ? 600 : 400,
                                    textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                    transition: 'color 120ms',
                                }}
                                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#F4F4F5'; }}
                                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#c8ccd2'; }}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Account — ancho fijo 168px */}
                <div style={{ width: 168, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, flexShrink: 0 }}>

                    {/* Bell */}
                    <div ref={bellRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setBellOpen(!bellOpen)}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: bellOpen ? '#F4F4F5' : '#c8ccd2',
                                display: 'grid', placeItems: 'center',
                                padding: 0, transition: 'color 120ms', position: 'relative',
                                width: 18, height: 18,
                            }}
                            onMouseEnter={e => { if (!bellOpen) e.currentTarget.style.color = '#F4F4F5'; }}
                            onMouseLeave={e => { if (!bellOpen) e.currentTarget.style.color = '#c8ccd2'; }}
                            title="Notificaciones"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <path d="M6 16.5h12l-1.2-2.1V10a4.8 4.8 0 0 0-9.6 0v4.4L6 16.5z" />
                                <path d="M10 18.2a2 2 0 0 0 4 0" />
                            </svg>
                            {unreadCount > 0 && (
                                <span style={{
                                    position: 'absolute', top: -2, right: -2,
                                    width: 13, height: 13, borderRadius: '50%',
                                    background: '#EF4D5A', color: '#fff',
                                    fontSize: 7, fontWeight: 800,
                                    display: 'grid', placeItems: 'center',
                                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                            )}
                        </button>

                        {/* Notification dropdown */}
                        {bellOpen && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 14px)', right: 0,
                                width: 360, maxHeight: 420,
                                background: '#0D0F12',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 12,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                overflow: 'hidden', zIndex: 100,
                                display: 'flex', flexDirection: 'column',
                            }}>
                                <div style={{
                                    padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                                }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F4F4F5' }}>
                                        Notificaciones
                                        {unreadCount > 0 && (
                                            <span style={{
                                                marginLeft: 8, fontSize: 10, fontWeight: 700,
                                                background: 'rgba(239,77,90,0.12)', color: '#EF4D5A',
                                                border: '1px solid rgba(239,77,90,0.25)',
                                                borderRadius: 999, padding: '2px 7px',
                                            }}>{unreadCount} nueva{unreadCount > 1 ? 's' : ''}</span>
                                        )}
                                    </span>
                                    {unreadCount > 0 && (
                                        <button onClick={markAllAsRead} style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#4387FF', fontSize: 11, fontWeight: 600,
                                        }}>Marcar todas</button>
                                    )}
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360 }} className="custom-scrollbar">
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                                            <p style={{ color: '#6d727a', fontSize: 12, margin: 0 }}>Sin notificaciones</p>
                                        </div>
                                    ) : (
                                        notifications.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={() => markAsRead(n.id)}
                                                style={{
                                                    padding: '11px 16px',
                                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                    cursor: 'pointer',
                                                    background: n.leida ? 'transparent' : 'rgba(67,135,255,0.04)',
                                                    transition: 'background 120ms',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(67,135,255,0.04)')}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <span style={{ color: tipoColor(n.tipo), flexShrink: 0, marginTop: 2 }}>
                                                        {tipoIcon(n.tipo)}
                                                    </span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{
                                                                fontSize: 12, fontWeight: n.leida ? 500 : 600,
                                                                color: n.leida ? '#8d9198' : '#F4F4F5',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}>{n.titulo}</span>
                                                            {!n.leida && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4387FF', flexShrink: 0 }} />}
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

                    {/* Avatar */}
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: '#4387FF',
                        display: 'grid', placeItems: 'center',
                        fontSize: 11, fontWeight: 700, color: '#FFFFFF',
                        flexShrink: 0, cursor: isAdmin ? 'pointer' : 'default',
                    }}
                        onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                        title={isAdmin ? 'Configuración' : undefined}
                    >
                        {mounted && user ? `${user.charAt(0).toUpperCase()}${user.charAt(1)?.toUpperCase() || ''}` : ''}
                    </div>

                    {/* Who */}
                    {mounted && user && (
                        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                            <strong style={{ fontSize: 12, fontWeight: 650, letterSpacing: '0.04em', color: '#F4F4F5' }}>
                                {user.toUpperCase()}
                            </strong>
                            <span style={{ fontSize: 11, color: '#8d9198' }}>Admin</span>
                        </div>
                    )}

                    {/* Logout */}
                    <button
                        onClick={logout}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#6d727a', display: 'grid', placeItems: 'center',
                            padding: 0, transition: 'color 120ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4D5A')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#6d727a')}
                        title="Cerrar sesión"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>
            </header>

            {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
        </>
    );
}
