import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  webpack: (config) => {
    // Keep Prisma client external (correct)
    config.externals = [...(config.externals ?? []), "@prisma/client"];

    // 🚨 FIX: prevent pg-native from being resolved (this is your error)
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pg-native": false,
    };

    return config;
  },
};

export default nextConfig;