/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  experimental: {
    serverActions: {
      // Maximum upload file size (configured to 5GB)
      bodySizeLimit: '5gb',
    },
    // Improve HMR stability
    optimizePackageImports: ['react', 'react-dom'],
  },
}

export default nextConfig
