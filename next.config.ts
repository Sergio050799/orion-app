import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fase 1 opt: subir límite de body para evitar "Request body exceeded 10MB" en /api/flotas/carpetas
  // cuando se guarda una carpeta grande (muchos vehículos + oferta + sinco + emisión).
  // middlewareClientMaxBodySize es opción documentada por Next (ver warning del propio runtime) pero
  // aún no está en los tipos; la casteamos para que pase tsc.
  ...({ middlewareClientMaxBodySize: '50mb' } as Partial<NextConfig>),
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // serverComponentsExternalPackages moved to root
  },
  serverExternalPackages: ['@napi-rs/canvas', 'sharp', 'pdfjs-dist', 'canvas', 'jsdom', 'pg'],
};

export default nextConfig;
