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
  // Don't let `next dev` write AGENTS.md / CLAUDE.md into apps/web; repo-level AGENTS.md is the rulebook.
  agentRules: false,
  experimental: {
    // forbidden() + forbidden.tsx give the staff desk a real HTTP 403 (E-022).
    authInterrupts: true,
    // Assignment uploads go through a server action: ≤ 5 files × 20 MB (phase-2 §C2), plus the form fields.
    serverActions: { bodySizeLimit: '105mb' },
  },
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
