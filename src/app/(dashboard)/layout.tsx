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
                <div className="h-screen w-screen overflow-hidden relative" style={{ background: '#050607' }}>
                    <Topbar />

                    <main
                        className="custom-scrollbar"
                        style={{
                            position: 'relative',
                            zIndex: 3,
                            margin: '0 auto',
                            padding: '100px 36px 40px',
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
