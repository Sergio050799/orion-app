"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
    isAuthenticated: boolean;
    user: string | null;
    login: (username: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [user, setUser] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        fetch('/api/auth/me')
            .then(r => r.json())
            .then((data: { authenticated: boolean; username?: string }) => {
                if (data.authenticated && data.username) {
                    localStorage.setItem('orion_user', data.username);
                    setUser(data.username);
                    setIsAuthenticated(true);
                } else {
                    localStorage.removeItem('orion_user');
                    setUser(null);
                    setIsAuthenticated(false);
                }
            })
            .catch(() => {
                const storedUser = localStorage.getItem('orion_user');
                if (storedUser) { setUser(storedUser); setIsAuthenticated(true); }
            });
    }, []);

    const login = (username: string) => {
        localStorage.setItem("orion_user", username);
        setUser(username);
        setIsAuthenticated(true);
        router.push("/dashboard");
    };

    const logout = () => {
        localStorage.removeItem("orion_user");
        setUser(null);
        setIsAuthenticated(false);
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        router.push("/login");
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
