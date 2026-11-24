/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Pertahanan berlapis terhadap injeksi skrip/plugin/form lintas-origin
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  // HSTS hanya berlaku saat diakses lewat HTTPS (diabaikan browser pada HTTP biasa)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['naravia.kiraya.my.id', '*.kiraya.my.id', 'localhost:3002'],
  // Matikan kompresi gzip bawaan Next.js server karena ia mem-buffer seluruh
  // response sebelum dikirim, sehingga merusak streaming SSE (Server-Sent Events)
  // pada endpoint /api/messages/stream. Chunk baru akan muncul setelah stream selesai.
  compress: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
