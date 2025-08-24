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
}

module.exports = nextConfig
