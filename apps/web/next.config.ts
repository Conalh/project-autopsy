import type { NextConfig } from "next";

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store"
  }
];

const nextConfig: NextConfig = {
  transpilePackages: ["@project-autopsy/core"],
  async headers() {
    return [
      { source: "/", headers: noStoreHeaders },
      { source: "/report", headers: noStoreHeaders },
      { source: "/runs", headers: noStoreHeaders },
      { source: "/runs/:path*", headers: noStoreHeaders },
      { source: "/share/:path*", headers: noStoreHeaders },
      { source: "/compare", headers: noStoreHeaders },
      { source: "/ops", headers: noStoreHeaders },
      { source: "/api/:path*", headers: noStoreHeaders }
    ];
  }
};

export default nextConfig;
