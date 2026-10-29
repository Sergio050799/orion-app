import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

// Tipografías alojadas en el proyecto (src/app/fonts): mismas fuentes que el diseño, sin red.
const inter = localFont({ src: "./fonts/Inter-latin-variable.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
const spaceGrotesk = localFont({ src: "./fonts/SpaceGrotesk-latin-variable.woff2", weight: "300 700", variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
    title: "ORION | Del Caos al Orden",
    description: "Plataforma de seguros de flotas vehiculares.",
    icons: { icon: '/ORION_LOGO.png' },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" data-theme="dark" suppressHydrationWarning>
            <head>
                {/* Prevent FOUC: read saved theme and apply before paint */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('orion-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();` }} />
            </head>
            <body className={`${inter.variable} ${spaceGrotesk.variable} font-[var(--font-inter)] antialiased`}>
                <AuthProvider>
                    <ThemeProvider>
                        {children}
                    </ThemeProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
