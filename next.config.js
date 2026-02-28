const path = require('path');
const { execSync } = require('child_process');
const packageJson = require('./package.json');

const getVersionFromGit = () => {
  try {
    const commitCount = execSync('git rev-list --count --first-parent HEAD').toString().trim();
    const shortSha = execSync('git rev-parse --short HEAD').toString().trim();
    return `${packageJson.version}.${commitCount}-${shortSha}`;
  } catch {
    return `${packageJson.version}.dev`;
  }
};

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
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || getVersionFromGit(),
  },
};

module.exports = nextConfig;
