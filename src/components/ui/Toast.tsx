"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useRef,
    useEffect,
} from "react";

/* ── Types ────────────────────────────────────────────── */

type ToastType = "success" | "error" | "info";

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    exiting: boolean;
}

interface ToastContextValue {
    toast: (message: string, type?: ToastType) => void;
}

/* ── Constants ────────────────────────────────────────── */

const MAX_TOASTS = 3;
const DURATION = 3000;
const EXIT_MS = 280;

const TYPE_COLOR: Record<ToastType, string> = {
    success: "#10B981",
    error: "#EF4444",
    info: "#3366FF",
};

/* ── Context ──────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

/* ── Hook ─────────────────────────────────────────────── */

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
    return ctx;
}

/* ── Provider ─────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);

    /* auto-dismiss */
    useEffect(() => {
        if (toasts.length === 0) return;

        const timers: ReturnType<typeof setTimeout>[] = [];

        toasts.forEach((t) => {
            if (t.exiting) return;

            const exit = setTimeout(() => {
                setToasts((prev) =>
                    prev.map((x) => (x.id === t.id ? { ...x, exiting: true } : x))
                );

                const remove = setTimeout(() => {
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }, EXIT_MS);

                timers.push(remove);
            }, DURATION);

            timers.push(exit);
        });

        return () => timers.forEach(clearTimeout);
    }, [toasts]);

    const toast = useCallback((message: string, type: ToastType = "success") => {
        const id = ++idRef.current;

        setToasts((prev) => {
            const next = [...prev, { id, message, type, exiting: false }];
            /* keep only the newest MAX_TOASTS */
            return next.slice(-MAX_TOASTS);
        });
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}

            {/* ── Keyframes (injected once) ── */}
            <style>{`
                @keyframes orion-toast-in {
                    from { opacity: 0; transform: translateX(100%); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes orion-toast-out {
                    from { opacity: 1; transform: translateX(0); }
                    to   { opacity: 0; transform: translateX(100%); }
                }
            `}</style>

            {/* ── Toast container ── */}
            <div
                style={{
                    position: "fixed",
                    bottom: 24,
                    right: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    zIndex: 9999,
                    pointerEvents: "none",
                }}
            >
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        style={{
                            pointerEvents: "auto",
                            display: "flex",
                            alignItems: "center",
                            background: "rgba(0,7,45,0.95)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderLeft: `4px solid ${TYPE_COLOR[t.type]}`,
                            borderRadius: 8,
                            padding: "10px 16px",
                            fontSize: 13,
                            color: "#e2e8f0",
                            maxWidth: 340,
                            boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                            animation: t.exiting
                                ? `orion-toast-out ${EXIT_MS}ms ease-in forwards`
                                : `orion-toast-in 280ms ease-out forwards`,
                        }}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
