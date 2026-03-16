/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_BROKER_URL: process.env.BROKER_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_REGISTRY_URL:
      process.env.REGISTRY_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
