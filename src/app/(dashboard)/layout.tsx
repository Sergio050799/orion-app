"use client";

import Topbar from "@/components/saas/layout/Topbar";
import { LayoutProvider } from "@/context/LayoutContext";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationProvider } from "@/context/NotificationContext";

// Auth is handled by middleware — no client-side redirect needed.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <LayoutProvider>
            <NotificationProvider>
            <ToastProvider>
                <div className="h-screen w-screen overflow-hidden relative" style={{ background: '#00072d' }}>
                    {/* Static background with lateral glow */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(ellipse 60% 40% at 50% 100%, #051650 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 50% 110%, rgba(61,112,255,0.22) 0%, transparent 50%), linear-gradient(180deg, #000520 0%, #00072d 60%, #000418 100%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Lateral glow left */}
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: '20%',
                        background: 'linear-gradient(to right, rgba(18,64,204,0.10), transparent)',
                        pointerEvents: 'none',
                    }} />
                    {/* Lateral glow right */}
                    <div style={{
                        position: 'absolute', top: 0, bottom: 0, right: 0,
                        width: '20%',
                        background: 'linear-gradient(to left, rgba(51,102,255,0.08), transparent)',
                        pointerEvents: 'none',
                    }} />

                    {/* Film grain */}
                    <div className="aurora-grain" />

                    <Topbar />

                    <main
                        className="custom-scrollbar"
                        style={{
                            position: 'relative',
                            zIndex: 3,
                            margin: '0 auto',
                            padding: '106px 24px 20px',
                            width: '100%',
                            maxWidth: 1680,
                            height: '100vh',
                            overflowY: 'auto',
                            overflowX: 'auto',
                            minWidth: 0,
                        }}
                    >
                        {children}
                    </main>
                </div>
            </ToastProvider>
            </NotificationProvider>
        </LayoutProvider>
    );
}
