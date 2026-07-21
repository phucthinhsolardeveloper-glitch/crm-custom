// PM2 ecosystem config for production
// Usage: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'crm-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3010,
      },
      max_memory_restart: '512M',
    },
    {
      name: 'crm-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3011,
        // Server-side fetch (SSR, proxy route, middleware) gọi NestJS qua localhost
        // thay vì public URL (Cloudflare round-trip). Giảm ~70ms per fetch.
        INTERNAL_API_URL: 'http://127.0.0.1:3010/api/v1',
      },
      max_memory_restart: '512M',
    },
  ],
};
