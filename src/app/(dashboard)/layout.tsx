"use client";

import "@/styles/orion-ui.css";
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
                        <main className="app-scroll custom-scrollbar">
                            <div className="app-main">{children}</div>
                        </main>
                    </div>
                </ToastProvider>
            </NotificationProvider>
        </LayoutProvider>
    );
}
