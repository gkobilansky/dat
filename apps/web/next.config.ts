import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dat/db", "@dat/shared", "@dat/storage"],
  serverExternalPackages: ["@prisma/client", "bullmq", "ioredis"],
};

export default nextConfig;
