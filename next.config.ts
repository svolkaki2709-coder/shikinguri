import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["iconv-lite"],
  poweredByHeader: false,
  // 家計の情報を扱うので、他サイトへの埋め込み・MIME推測・リファラ送信を止める
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }]
  },
};

export default nextConfig;
