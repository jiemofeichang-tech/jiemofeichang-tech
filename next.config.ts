import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static-hoe.hogi.ai',
      },
      {
        protocol: 'https',
        hostname: 'static-oiioii-sg.hogiai.cn',
      },
    ],
  },
  allowedDevOrigins: ['127.0.0.1'],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8787/api/:path*",
      },
      {
        source: "/media/:path*",
        destination: "http://127.0.0.1:8787/media/:path*",
      },
    ];
  },
};

export default nextConfig;
