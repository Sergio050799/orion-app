"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/saas/layout/Sidebar";
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

    if (!isAuthenticated) return null; // Or a loading spinner

    return (
        <LayoutProvider>
            <div className="flex h-screen bg-[#02060C] text-slate-200 overflow-hidden font-sans">
                <Sidebar />
                <div className="flex-1 flex flex-col min-w-0">
                    <Topbar />
                    <main className="flex-1 overflow-y-auto p-6 relative">
                        {children}
                    </main>
                </div>
            </div>
        </LayoutProvider>
    );
}
