/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // Enable compression
  compress: true,
};

module.exports = nextConfig;

