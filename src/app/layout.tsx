import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

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
