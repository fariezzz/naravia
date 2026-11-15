/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['naravia.kiraya.my.id', '*.kiraya.my.id', 'localhost:3000'],
  // Matikan kompresi gzip bawaan Next.js server karena ia mem-buffer seluruh
  // response sebelum dikirim, sehingga merusak streaming SSE (Server-Sent Events)
  // pada endpoint /api/messages/stream. Chunk baru akan muncul setelah stream selesai.
  compress: false,
};

export default nextConfig;
