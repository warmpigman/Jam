/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  experimental: {
    serverActions: {
      // Maximum upload file size (configured to 5GB) idk how to get this to use the .env
      // If you need to change this value, update it here and also in nginx/conf.d/default.conf
      bodySizeLimit: '5gb',
    },
    // Improve HMR stability
    optimizePackageImports: ['react', 'react-dom'],
    // Prevent stale HMR updates
    swcMinify: true,
  },
  // Add webpack configuration to fix HMR issues
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Improve React refresh behavior
      config.optimization.runtimeChunk = 'single';
    }
    return config;
  },
}

export default nextConfig
