"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface LayoutContextType {
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
    theme: 'dark' | 'light';
    setTheme: (theme: 'dark' | 'light') => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

    // Load from localStorage on mount
    useEffect(() => {
        const savedSidebar = localStorage.getItem("orion_sidebar_collapsed");
        if (savedSidebar) {
            setIsSidebarCollapsed(JSON.parse(savedSidebar));
        }

        const savedTheme = localStorage.getItem("orion_theme") as 'dark' | 'light';
        if (savedTheme) {
            setThemeState(savedTheme);
            if (savedTheme === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    }, []);

    const setTheme = (newTheme: 'dark' | 'light') => {
        setThemeState(newTheme);
        localStorage.setItem("orion_theme", newTheme);
        if (newTheme === 'light') {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    };

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const newState = !prev;
            localStorage.setItem("orion_sidebar_collapsed", JSON.stringify(newState));
            return newState;
        });
    };

    return (
        <LayoutContext.Provider value={{ isSidebarCollapsed, toggleSidebar, theme, setTheme }}>
            {children}
        </LayoutContext.Provider>
    );
}

export function useLayout() {
    const context = useContext(LayoutContext);
    if (context === undefined) {
        throw new Error("useLayout must be used within a LayoutProvider");
    }
    return context;
}
