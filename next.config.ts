import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    // serverComponentsExternalPackages moved to root
  },
  serverExternalPackages: ['@napi-rs/canvas', 'sharp', 'pdfjs-dist', 'canvas', 'jsdom'],
};

export default nextConfig;
