import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // O painel mora em https://portal.cambui.mg.gov.br/cms (mesmo domínio do site, sem subdomínio novo; o Nginx repassa o
  // prefixo). Fixo AQUI e não em variável de ambiente: o valor precisa ser idêntico no build e no start, e um
  // descompasso quebra todos os links do painel. O Payload usa este basePath sozinho (admin, API e /_next/static).
  basePath: '/cms',
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
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
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
