const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // Aumentar limite de upload para 50MB (áudios WAV)
  serverExternalPackages: [],
};

// Configurar body size limit via headers
const withBodySizeLimit = (config) => {
  return {
    ...config,
    experimental: {
      ...config.experimental,
      serverActions: {
        bodySizeLimit: '50mb',
      },
    },
  };
};

module.exports = withBodySizeLimit(nextConfig);
