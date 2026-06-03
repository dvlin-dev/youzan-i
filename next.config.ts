import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // 项目讲解幻灯：/docs 直接访问 public/docs.html（演示分享用）
    return [{ source: "/docs", destination: "/docs.html" }];
  },
};

export default nextConfig;
