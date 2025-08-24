/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用图片优化
  images: {
    unoptimized: false
  },
  
  // 启用严格模式
  reactStrictMode: true,
}

module.exports = nextConfig
