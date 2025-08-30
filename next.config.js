/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用图片优化
  images: {
    unoptimized: false
  },
  
  // 启用严格模式
  reactStrictMode: true,

  // 配置编译器选项
  compiler: {
    // 在生产环境中移除 console.log
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error']
    } : false,
  },

  // webpack 配置
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // 确保路径解析正确
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    }
    
    return config
  },
  // 避免 Next 在 build 时以已弃用的选项调用 ESLint 导致噪音警告
  // 推荐在本地或 CI 上单独运行 `pnpm lint` 来检查/修复问题
  // eslint: {
  //   ignoreDuringBuilds: true
  // }
}

module.exports = nextConfig
