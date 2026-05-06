import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@lifeos/schemas",
    "@lifeos/types",
    "@lifeos/ui",
    "@lifeos/utils",
  ],
};

export default nextConfig;
