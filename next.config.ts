import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // QPDF's Emscripten wrapper contains Node fallback requires, even though we
  // only run its WebAssembly filesystem inside the browser. Use webpack for
  // production builds and mark Node built-ins unavailable in browser bundles.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
