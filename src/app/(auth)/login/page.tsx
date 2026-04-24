"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const { login } = useAuth();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) {
            setError("Introduce un usuario para continuar");
            return;
        }
        setLoading(true);
        setError("");
        setTimeout(() => {
            login(username);
            setLoading(false);
        }, 700);
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: '#020617' }}
        >
            {/* Blueprint grid */}
            <div className="absolute inset-0 blueprint-grid opacity-40 pointer-events-none" />

            {/* Glow orb top-left */}
            <div
                className="absolute pointer-events-none"
                style={{
                    top: '15%', left: '20%',
                    width: '500px', height: '500px',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)',
                    filter: 'blur(40px)',
                    animation: 'pulse 5s ease-in-out infinite',
                }}
            />
            {/* Glow orb bottom-right */}
            <div
                className="absolute pointer-events-none"
                style={{
                    bottom: '10%', right: '15%',
                    width: '400px', height: '400px',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 65%)',
                    filter: 'blur(60px)',
                    animation: 'pulse 7s ease-in-out infinite reverse',
                }}
            />

            {/* Card */}
            <div
                className="relative w-full max-w-sm mx-5 animate-in fade-in slide-in-from-bottom-6 duration-700"
                style={{
                    background: 'rgba(2,6,23,0.75)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    backdropFilter: 'blur(32px)',
                    borderRadius: '28px',
                    boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
                }}
            >
                {/* Top accent line */}
                <div
                    className="absolute top-0 left-0 right-0 h-px"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.55), transparent)',
                        borderRadius: '28px 28px 0 0',
                    }}
                />

                {/* Logo + Identity */}
                <div className="pt-10 pb-7 flex flex-col items-center gap-5">
                    <div
                        className="relative"
                        style={{
                            width: '72px', height: '72px',
                            filter: 'drop-shadow(0 0 18px rgba(99,102,241,0.35))',
                        }}
                    >
                        <Image
                            src="/ORION_LOGO.png"
                            alt="ORION"
                            fill
                            className="object-contain"
                            priority
                        />
                    </div>

                    <div className="text-center space-y-1.5">
                        <div className="flex items-center justify-center gap-2.5">
                            <span className="text-2xl font-black tracking-[0.2em] text-white">ORION</span>
                            <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider"
                                style={{
                                    color: '#6366f1',
                                    background: 'rgba(99,102,241,0.1)',
                                    border: '1px solid rgba(99,102,241,0.22)',
                                }}
                            >
                                SaaS
                            </span>
                        </div>
                        <p className="text-xs tracking-wider" style={{ color: 'rgba(255,255,255,0.28)' }}>
                            Sistema de análisis documental
                        </p>
                    </div>
                </div>

                {/* Divider */}
                <div className="mx-8 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-8 pt-7 pb-8 space-y-4">
                    <div>
                        <label
                            className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                            style={{ color: 'rgba(255,255,255,0.32)' }}
                        >
                            Usuario
                        </label>
                        <input
                            type="text"
                            required
                            autoComplete="username"
                            autoFocus
                            className="orion-input"
                            placeholder="Introduce tu usuario"
                            value={username}
                            onChange={e => { setUsername(e.target.value); setError(""); }}
                        />
                    </div>

                    <div>
                        <label
                            className="block text-[10px] font-bold uppercase tracking-widest mb-2"
                            style={{ color: 'rgba(255,255,255,0.32)' }}
                        >
                            Contraseña
                        </label>
                        <input
                            type="password"
                            autoComplete="current-password"
                            className="orion-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="text-xs font-semibold animate-in fade-in duration-200" style={{ color: '#EF4444' }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all duration-200 mt-1 flex items-center justify-center gap-2 disabled:opacity-70"
                        style={{
                            background: loading ? 'rgba(99,102,241,0.6)' : '#6366f1',
                            color: '#020617',
                            boxShadow: '0 0 24px rgba(99,102,241,0.28)',
                        }}
                        onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.boxShadow = '0 0 36px rgba(99,102,241,0.5)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 0 24px rgba(99,102,241,0.28)'; }}
                    >
                        {loading ? (
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                        ) : 'Acceder'}
                    </button>

                    <p className="text-center text-[10px] pt-1" style={{ color: 'rgba(255,255,255,0.18)' }}>
                        ORION · CosmosCore · v1.0
                    </p>
                </form>
            </div>
        </div>
    );
}
