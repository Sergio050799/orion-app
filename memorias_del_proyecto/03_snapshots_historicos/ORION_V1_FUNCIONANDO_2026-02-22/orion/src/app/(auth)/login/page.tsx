"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const { login } = useAuth();
    const [error, setError] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            login(username);
        } else {
            setError("Please enter a username");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <div className="w-full max-w-md p-8 space-y-8 bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-[#3CE0FF]">ORION SaaS</h1>
                    <p className="mt-2 text-sm text-slate-400">Enter any credentials to access the demo</p>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-300">Username</label>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-[#3CE0FF] focus:outline-none focus:ring-1 focus:ring-[#3CE0FF]"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-[#3CE0FF] focus:outline-none focus:ring-1 focus:ring-[#3CE0FF]"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-black bg-[#3CE0FF] hover:bg-[#3CE0FF]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3CE0FF]"
                    >
                        Sign in
                    </button>
                </form>
            </div>
        </div>
    );
}
