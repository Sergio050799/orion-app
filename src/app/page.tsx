"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function RootPage() {
  const router = useRouter();

  // Middleware protects all routes — if we reach /, we're authenticated.
  // Just redirect to dashboard.
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#020B1A' }}>
      <div className="orion-loader">
        <div className="orion-loader-ring" />
        <div className="orion-loader-logo">
          <Image src="/ORION_LOGO.png" alt="ORION" width={48} height={48} className="object-contain" priority />
        </div>
      </div>
      <span style={{
        marginTop: 24,
        fontSize: 11,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: 'rgba(178,198,245,0.5)',
        fontWeight: 500,
        animation: 'orionLoaderText 2s ease-in-out infinite',
      }}>
        Cargando
      </span>
    </div>
  );
}
