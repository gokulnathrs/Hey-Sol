import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Don't fail the build on type errors during development
    ignoreBuildErrors: true,
  },
  eslint: {
    // Don't fail the build on lint warnings
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
