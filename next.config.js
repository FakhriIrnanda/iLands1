/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/**': ['./public/data/**'],
  },
}
module.exports = nextConfig
