"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Topbar from "@/components/saas/layout/Topbar";
import { LayoutProvider } from "@/context/LayoutContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isAuthenticated) {
            router.push("/login");
        }
    }, [isAuthenticated, router]);

    if (!isAuthenticated) return null;

    return (
        <LayoutProvider>
            <div id="orion-app-root" className="flex flex-col h-screen overflow-hidden relative" style={{ background: 'var(--orion-deep)' }}>
                <div className="blueprint-grid absolute inset-0 pointer-events-none z-0" />
                <Topbar />
                <main className="flex-1 overflow-y-auto p-5 relative z-10 custom-scrollbar">
                    {children}
                </main>
            </div>
        </LayoutProvider>
    );
}
