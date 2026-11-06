import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Self-contained server bundle for container deploys (Dockerfile). Traced from the monorepo root
  // so workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(dirname, '../..'),
  transpilePackages: ['@edvora/core', '@edvora/integrations', '@edvora/ui'],
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }],
  },
  // No external runtime dependencies: everything must work on Iran's national network.
  poweredByHeader: false,
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname, '../..'),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
