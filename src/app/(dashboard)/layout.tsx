"use client";

import Topbar from "@/components/saas/layout/Topbar";
import { LayoutProvider } from "@/context/LayoutContext";
import { ToastProvider } from "@/components/ui/Toast";
import { NotificationProvider } from "@/context/NotificationContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <LayoutProvider>
            <NotificationProvider>
                <ToastProvider>
                    <div
                        className="h-screen w-screen overflow-hidden"
                        style={{ background: 'var(--t-bg)', color: 'var(--t-text)' }}
                    >
                        <Topbar />
                        <main
                            className="custom-scrollbar"
                            style={{
                                position: 'relative',
                                zIndex: 3,
                                margin: '0 auto',
                                padding: '78px 36px 40px',
                                width: '100%',
                                maxWidth: 1440,
                                height: '100vh',
                                overflowY: 'auto',
                                overflowX: 'hidden',
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
