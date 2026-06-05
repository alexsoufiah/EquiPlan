import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "bcryptjs", "web-push"],
};

export default nextConfig;
