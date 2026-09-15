"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

function MailIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>; }
function LockIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>; }
function CheckIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>; }

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const bgRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouse = (e: MouseEvent) => {
            if (bgRef.current) {
                const x = ((e.clientX / window.innerWidth) * 100).toFixed(1);
                const y = ((e.clientY / window.innerHeight) * 100).toFixed(1);
                bgRef.current.style.setProperty('--mx', `${x}%`);
                bgRef.current.style.setProperty('--my', `${y}%`);
            }
        };
        window.addEventListener('mousemove', handleMouse);
        return () => window.removeEventListener('mousemove', handleMouse);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();
            if (data.success) {
                login(username); // actualiza estado en memoria + localStorage + navega a /dashboard
            } else {
                setError(data.error || "Usuario o contraseña incorrectos");
            }
        } catch {
            setError("Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen overflow-hidden relative">
            {/* Aurora background */}
            <div ref={bgRef} className="orion-aurora-bg">
                <div className="aurora-layer aurora-1" />
                <div className="aurora-layer aurora-2" />
                <div className="aurora-layer aurora-3" />
                <div className="aurora-cursor" />
                <div className="aurora-arc" />
                <div className="aurora-grain" />
                <div className="grain-animated" />
            </div>

            {/* Header */}
            <header style={{
                position: 'absolute', left: 0, right: 0, top: 0,
                zIndex: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '24px 40px',
            }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative', width: 28, height: 28, filter: 'drop-shadow(0 0 14px rgba(70,120,255,0.6))' }}>
                        <Image src="/ORION_LOGO.png" alt="ORION" fill className="object-contain" priority />
                    </div>
                    <span style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 600, fontSize: 'calc(28px * 0.78)', letterSpacing: '0.18em', color: '#FFFFFF', textShadow: '0 0 20px rgba(51,102,255,0.25)' }}>
                        ORION
                    </span>
                </div>
            </header>

            {/* Main — two columns */}
            <main style={{
                position: 'relative', zIndex: 3,
                margin: 'auto',
                display: 'grid',
                gridTemplateColumns: '1.05fr 1fr',
                gap: 80,
                alignItems: 'center',
                padding: '100px 80px 80px',
                width: '100%',
                maxWidth: 1380,
                height: '100%',
            }}>
                {/* Left — pitch */}
                <section>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 14,
                        marginBottom: 28,
                        color: 'rgba(178,198,245,0.7)',
                        letterSpacing: '0.28em',
                        fontSize: 11,
                        textTransform: 'uppercase' as const,
                    }}>
                        <span style={{ width: 40, height: 1, background: 'linear-gradient(90deg, transparent, rgba(70,120,255,0.6), transparent)' }} />
                        <em style={{
                            fontStyle: 'normal',
                            padding: '7px 16px',
                            borderRadius: 999,
                            background: 'rgba(3,10,42,0.72)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(61,112,255,0.22)',
                            color: '#BDD4FF',
                        }}>
                            Acceso seguro
                        </em>
                        <span style={{ width: 40, height: 1, background: 'linear-gradient(90deg, transparent, rgba(70,120,255,0.6), transparent)' }} />
                    </div>

                    <h2 style={{
                        fontFamily: 'var(--font-display), Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: 76,
                        lineHeight: 0.98,
                        letterSpacing: '-0.02em',
                        margin: '0 0 24px',
                        color: '#FFFFFF',
                    }}>
                        Del Caos<br/>al <span style={{
                            background: 'linear-gradient(135deg, #3366FF, #FFFFFF)',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            color: 'transparent',
                            fontWeight: 500,
                        }}>Orden</span>.
                    </h2>

                    <p style={{ fontSize: 16, color: '#BDD4FF', lineHeight: 1.55, maxWidth: 460, margin: '0 0 32px' }}>
                        La plataforma operativa para corredores y aseguradoras que gestionan flotas vehiculares a escala.
                    </p>

                    <ul style={{ listStyle: 'none', margin: '0 0 36px', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            'Emisión automatizada de pólizas',
                            'OCR de documentos en segundos',
                            '1 fuente de verdad para tu flota',
                        ].map(text => (
                            <li key={text} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#BDD4FF', fontSize: 14 }}>
                                <span style={{
                                    flexShrink: 0, color: '#3366FF',
                                    background: 'rgba(18,64,204,0.18)',
                                    padding: 4, borderRadius: '50%',
                                    width: 20, height: 20,
                                    display: 'grid', placeItems: 'center',
                                    border: '1px solid rgba(51,102,255,0.25)',
                                }}>
                                    <CheckIcon />
                                </span>
                                {text}
                            </li>
                        ))}
                    </ul>

                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 24,
                        padding: '18px 24px',
                        borderRadius: 14,
                        background: 'rgba(3,10,42,0.72)',
                        backdropFilter: 'blur(24px)',
                        border: '1px solid rgba(61,112,255,0.22)',
                        maxWidth: 520,
                    }}>
                        {[
                            { v: '2.4M+', l: 'vehículos asegurados' },
                            { v: '340', l: 'corredores activos' },
                            { v: '99.98%', l: 'uptime' },
                        ].map((item, i) => (
                            <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                                {i > 0 && <div style={{ width: 1, height: 32, background: 'linear-gradient(180deg, transparent, rgba(51,102,255,0.3), transparent)' }} />}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <strong style={{ fontFamily: 'var(--font-display), Inter, sans-serif', fontWeight: 500, fontSize: 22, color: '#FFFFFF' }}>{item.v}</strong>
                                    <span style={{ fontSize: 11, color: 'rgba(178,198,245,0.7)', letterSpacing: '0.04em' }}>{item.l}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Right — login card */}
                <section style={{
                    padding: 40,
                    borderRadius: 28,
                    width: '100%',
                    maxWidth: 480,
                    marginLeft: 'auto',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'rgba(12, 28, 82, 0.6)',
                    backdropFilter: 'blur(36px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(36px) saturate(150%)',
                    border: '1px solid rgba(51, 102, 255, 0.32)',
                    boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(61,112,255,0.14) inset',
                }}>
                    <div className="grain-subtle" />
                    {/* Eyebrow */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontSize: 11, letterSpacing: '0.24em', color: '#BDD4FF',
                        textTransform: 'uppercase' as const,
                        padding: '6px 14px', borderRadius: 999,
                        background: 'rgba(6,14,50,0.55)',
                        border: '1px solid rgba(61,112,255,0.22)',
                        marginBottom: 18,
                    }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 0 3px rgba(74,222,128,0.18), 0 0 10px rgba(74,222,128,0.6)' }} />
                        Iniciar sesión
                    </div>

                    <h3 style={{
                        fontFamily: 'var(--font-display), Inter, sans-serif',
                        fontWeight: 500, fontSize: 28, margin: '0 0 6px',
                        letterSpacing: '-0.01em', color: '#FFFFFF',
                    }}>
                        Bienvenido
                    </h3>
                    <p style={{ color: 'rgba(178,198,245,0.7)', margin: '0 0 28px', fontSize: 13 }}>
                        Ingresa con tus credenciales corporativas.
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Email field */}
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#BDD4FF', letterSpacing: '0.06em', fontWeight: 500 }}>Usuario</span>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '0 14px', height: 48,
                                borderRadius: 14,
                                background: 'rgba(3, 10, 42, 0.7)',
                                border: '1px solid rgba(61,112,255,0.22)',
                                transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                            }}>
                                <MailIcon />
                                <input
                                    type="text"
                                    required
                                    autoComplete="username"
                                    autoFocus
                                    placeholder="nombre@empresa.com"
                                    value={username}
                                    onChange={e => { setUsername(e.target.value); setError(""); }}
                                    style={{
                                        flex: 1, background: 'transparent',
                                        border: 0, outline: 'none',
                                        color: '#FFFFFF', fontSize: 14,
                                    }}
                                />
                            </div>
                        </label>

                        {/* Password field */}
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#BDD4FF', letterSpacing: '0.06em', fontWeight: 500 }}>Contraseña</span>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '0 14px', height: 48,
                                borderRadius: 14,
                                background: 'rgba(3, 10, 42, 0.7)',
                                border: '1px solid rgba(61,112,255,0.22)',
                                transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                            }}>
                                <LockIcon />
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    placeholder="••••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    style={{
                                        flex: 1, background: 'transparent',
                                        border: 0, outline: 'none',
                                        color: '#FFFFFF', fontSize: 14,
                                    }}
                                />
                            </div>
                        </label>

                        {error && (
                            <p className="animate-in fade-in duration-200" style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', margin: 0 }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                height: 50, width: '100%',
                                borderRadius: 14,
                                background: loading
                                    ? 'linear-gradient(180deg, #134d97, #0a2472)'
                                    : 'linear-gradient(180deg, #1240CC, #134d97)',
                                border: '1px solid rgba(51,102,255,0.45)',
                                color: '#FFFFFF',
                                fontWeight: 500, fontSize: 14,
                                letterSpacing: '0.04em',
                                cursor: loading ? 'wait' : 'pointer',
                                boxShadow: '0 14px 30px -8px rgba(18,64,204,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset',
                                transition: 'all 180ms cubic-bezier(.4,.0,.2,1)',
                                marginTop: 8,
                            }}
                            onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(180deg, #3366FF, #1240CC)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; } }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(180deg, #1240CC, #134d97)'; (e.currentTarget as HTMLElement).style.transform = ''; }}
                        >
                            {loading ? (
                                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M21 12a9 9 0 11-6.2-8.55"/>
                                </svg>
                            ) : null}
                            {loading ? 'Verificando...' : 'Acceder a Orion'}
                        </button>
                    </form>

                    <footer style={{
                        marginTop: 22,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 8, fontSize: 11,
                        color: 'rgba(178,198,245,0.7)',
                    }}>
                        <span>Protegido por cifrado AES-256</span>
                    </footer>
                </section>
            </main>

            {/* Footer */}
            <footer style={{
                position: 'absolute', left: 0, right: 0, bottom: 24,
                zIndex: 3,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0 40px',
                fontSize: 12,
                color: 'rgba(178,198,245,0.7)',
            }}>
                <span>© 2026 Orion Systems</span>
                <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', borderRadius: 999,
                    background: 'rgba(3,10,42,0.72)',
                    border: '1px solid rgba(61,112,255,0.22)',
                    color: '#BDD4FF',
                }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 0 3px rgba(74,222,128,0.18), 0 0 10px rgba(74,222,128,0.6)' }} />
                    Todos los servicios operativos
                </span>
                <span>Madrid</span>
            </footer>
        </div>
    );
}
