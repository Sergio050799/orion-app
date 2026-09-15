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
    { href: "/flotas",              label: "Estudio Flotas" },
    { href: "/emission",            label: "Centro Emisión" },
    { href: "/gestion-documental",  label: "Documental" },
    { href: "/analysis/vehiculos",  label: "Vehículos" },
    { href: "/analysis/ocr",        label: "Escáner OCR" },
];

function tipoIcon(tipo: string) {
    if (tipo === 'vencimiento') return <span style={{ fontSize: 14 }}>&#9888;</span>;
    if (tipo === 'estado') return <span style={{ fontSize: 14 }}>&#8635;</span>;
    return <span style={{ fontSize: 14 }}>&#8505;</span>;
}

function tipoColor(tipo: string) {
    if (tipo === 'vencimiento') return '#F59E0B';
    if (tipo === 'estado') return '#3366FF';
    return 'rgba(178,198,245,0.6)';
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

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false);
            }
        }
        if (bellOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [bellOpen]);

    // Refresh notifications when opening
    useEffect(() => {
        if (bellOpen) refresh();
    }, [bellOpen, refresh]);

    return (
        <>
            {/* Floating glass topbar */}
            <header
                className="shrink-0 relative z-20"
                style={{
                    position: 'absolute',
                    left: 24, right: 24, top: 24,
                    zIndex: 50,
                    height: 64,
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    padding: '0 22px',
                    borderRadius: 22,
                    background: 'rgba(12, 28, 82, 0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(51, 102, 255, 0.32)',
                    boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
                }}
            >
                {/* Left — logo */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
                        <div
                            className="relative shrink-0"
                            style={{ width: 30, height: 30, filter: 'drop-shadow(0 0 14px rgba(70,120,255,0.6))' }}
                        >
                            <Image src="/ORION_LOGO.png" alt="ORION" fill className="object-contain" priority />
                        </div>
                        <span
                            className="text-white tracking-[0.18em] hidden sm:inline"

                            style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 15, textShadow: '0 0 20px rgba(51,102,255,0.25)' }}
                        >
                            ORION
                        </span>
                    </Link>
                </div>

                {/* Center — nav pills */}
                <nav style={{ display: 'flex', gap: 4, justifyContent: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {navItems.map(({ href, label }) => {
                        const active = isActive(href);
                        return (
                            <Link
                                key={href}
                                href={href}
                                style={active ? {
                                    padding: '8px 16px',
                                    borderRadius: 999,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: '#FFFFFF',
                                    background: 'rgba(18,64,204,0.35)',
                                    boxShadow: '0 0 0 1px rgba(70,120,255,0.5) inset, 0 0 16px rgba(18,64,204,0.3)',
                                    transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                                    whiteSpace: 'nowrap',
                                } : {
                                    padding: '8px 16px',
                                    borderRadius: 999,
                                    fontSize: 13,
                                    color: '#BDD4FF',
                                    transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#FFFFFF'; (e.currentTarget as HTMLElement).style.background = 'rgba(61,112,255,0.14)'; } }}
                                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = '#BDD4FF'; (e.currentTarget as HTMLElement).style.background = ''; } }}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Right — bell + user + logout */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>

                    {/* Notification bell */}
                    <div ref={bellRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setBellOpen(!bellOpen)}
                            style={{
                                position: 'relative',
                                width: 38, height: 38,
                                borderRadius: 12,
                                display: 'grid',
                                placeItems: 'center',
                                color: bellOpen ? '#FFFFFF' : '#BDD4FF',
                                background: bellOpen ? 'rgba(18,64,204,0.25)' : 'rgba(6,14,50,0.5)',
                                border: `1px solid ${bellOpen ? 'rgba(51,102,255,0.35)' : 'rgba(61,112,255,0.22)'}`,
                                cursor: 'pointer',
                                transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                            }}
                            onMouseEnter={e => { if (!bellOpen) { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'rgba(51,102,255,0.35)'; } }}
                            onMouseLeave={e => { if (!bellOpen) { e.currentTarget.style.color = '#BDD4FF'; e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)'; } }}
                            title="Notificaciones"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                            {unreadCount > 0 && (
                                <span style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: '#ef4444',
                                    color: '#fff', fontSize: 9, fontWeight: 800,
                                    display: 'grid', placeItems: 'center',
                                    boxShadow: '0 0 8px rgba(239,68,68,0.6)',
                                    lineHeight: 1,
                                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                            )}
                        </button>

                        {/* Notification dropdown */}
                        {bellOpen && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 12px)', right: 0,
                                width: 380, maxHeight: 440,
                                background: 'rgba(3,10,42,0.98)',
                                border: '1px solid rgba(51,102,255,0.25)',
                                borderRadius: 16,
                                boxShadow: '0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(61,112,255,0.12) inset',
                                overflow: 'hidden',
                                zIndex: 100,
                                display: 'flex', flexDirection: 'column',
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    borderBottom: '1px solid rgba(61,112,255,0.16)',
                                }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>
                                        Notificaciones
                                        {unreadCount > 0 && (
                                            <span style={{
                                                marginLeft: 8, fontSize: 10, fontWeight: 700,
                                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                                border: '1px solid rgba(239,68,68,0.3)',
                                                borderRadius: 999, padding: '2px 8px',
                                            }}>{unreadCount} nueva{unreadCount > 1 ? 's' : ''}</span>
                                        )}
                                    </span>
                                    {unreadCount > 0 && (
                                        <button onClick={markAllAsRead} style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#3366FF', fontSize: 11, fontWeight: 600,
                                        }}>Marcar todas</button>
                                    )}
                                </div>

                                {/* List */}
                                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380 }} className="custom-scrollbar">
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                            <p style={{ color: 'rgba(178,198,245,0.4)', fontSize: 12, margin: 0 }}>Sin notificaciones</p>
                                        </div>
                                    ) : (
                                        notifications.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={() => markAsRead(n.id)}
                                                style={{
                                                    padding: '12px 18px',
                                                    borderBottom: '1px solid rgba(61,112,255,0.10)',
                                                    cursor: 'pointer',
                                                    background: n.leida ? 'transparent' : 'rgba(18,64,204,0.06)',
                                                    transition: 'background 150ms',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(61,112,255,0.12)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = n.leida ? 'transparent' : 'rgba(18,64,204,0.06)')}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <span style={{ color: tipoColor(n.tipo), flexShrink: 0, marginTop: 2 }}>
                                                        {tipoIcon(n.tipo)}
                                                    </span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{
                                                                fontSize: 12, fontWeight: n.leida ? 500 : 700,
                                                                color: n.leida ? '#BDD4FF' : '#FFFFFF',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}>{n.titulo}</span>
                                                            {!n.leida && (
                                                                <span style={{
                                                                    width: 6, height: 6, borderRadius: '50%',
                                                                    background: '#3366FF', flexShrink: 0,
                                                                    boxShadow: '0 0 6px rgba(70,120,255,0.6)',
                                                                }} />
                                                            )}
                                                        </div>
                                                        <p style={{
                                                            margin: '3px 0 0', fontSize: 11,
                                                            color: 'rgba(178,198,245,0.6)', lineHeight: 1.4,
                                                        }}>{n.mensaje}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {mounted && user && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '4px 14px 4px 4px',
                                borderRadius: 999,
                                background: 'rgba(6,14,50,0.5)',
                                border: '1px solid rgba(61,112,255,0.22)',
                                cursor: isAdmin ? 'pointer' : 'default',
                            }}
                            onClick={isAdmin ? () => setAdminOpen(true) : undefined}
                            title={isAdmin ? 'Configuración' : undefined}
                        >
                            <div
                                style={{
                                    width: 32, height: 32,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #1240CC, #3366FF)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    color: '#FFFFFF',
                                }}
                            >
                                {user.charAt(0).toUpperCase()}{user.charAt(1)?.toUpperCase() || ''}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                <strong style={{ fontSize: 13, color: '#FFFFFF' }}>{user}</strong>
                                <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.7)' }}>Admin</span>
                            </div>
                        </div>
                    )}

                    {/* Logout */}
                    <button
                        onClick={logout}
                        style={{
                            position: 'relative',
                            width: 38, height: 38,
                            borderRadius: 12,
                            display: 'grid',
                            placeItems: 'center',
                            color: '#BDD4FF',
                            background: 'rgba(6,14,50,0.5)',
                            border: '1px solid rgba(61,112,255,0.22)',
                            cursor: 'pointer',
                            transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#BDD4FF'; e.currentTarget.style.borderColor = 'rgba(61,112,255,0.22)'; }}
                        title="Cerrar sesión"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
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
