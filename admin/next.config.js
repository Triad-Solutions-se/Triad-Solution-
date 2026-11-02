/** @type {import('next').NextConfig} */
const nextConfig = {
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || undefined,
  // PDF-generatorerna läser loggan från public/ med fs — se till att den följer
  // med i serverless-funktionerna (offert-, avtals- och faktura-PDF:er, cron).
  outputFileTracingIncludes: {
    "/admin/api/**/*": ["./public/logos/document-logo.png"],
    "/api/cron/**/*": ["./public/logos/document-logo.png"],
  },
  async redirects() {
    return [{ source: '/', destination: '/admin', permanent: false }];
  },
};
module.exports = nextConfig;
