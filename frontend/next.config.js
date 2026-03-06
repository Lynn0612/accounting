/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // Enable compression
  compress: true,
  // Ignore TypeScript and ESLint errors during builds (for deployment)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;

