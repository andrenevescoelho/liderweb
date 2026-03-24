const path = require('path');
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  experimental: { outputFileTracingRoot: path.join(__dirname, '../') },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
  transpilePackages: ['@soundtouchjs/audio-worklet', '@soundtouchjs/core'],
};
module.exports = nextConfig;
