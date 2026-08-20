import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lifeos/schemas", "@lifeos/types"],
};

export default nextConfig;
