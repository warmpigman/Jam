/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  experimental: {
    serverActions: {
      bodySizeLimit: '999999999999999GB',
    },
  },
}

export default nextConfig
