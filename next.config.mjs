/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['naravia.kiraya.my.id', '*.kiraya.my.id', 'localhost:3000'],
};

export default nextConfig;
