import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as net from 'net';
import * as path from 'path';
import { AppModule } from './app.module';

/** Check if a port is already in use before starting the server */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port);
  });
}

async function bootstrap() {
  const port = Number(process.env.API_PORT || 3010);

  const inUse = await checkPort(port);
  if (inUse) {
    console.error(`\n❌ Port ${port} đang được sử dụng bởi process khác.`);
    console.error(`   Chạy lệnh sau để kill process trên port ${port}:`);
    console.error(`   Windows: netstat -ano | findstr :${port}  →  taskkill /PID <PID> /F`);
    console.error(`   Linux:   lsof -i :${port}  →  kill -9 <PID>\n`);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true, // Required by WebhookSignatureGuard to verify HMAC over raw bytes
  });

  // Trust proxy: điều chỉnh số hop theo số lớp reverse proxy trước app
  // để req.ip = IP client thật (rate-limit theo IP + audit log chính xác).
  app.set('trust proxy', 1);

  app.useLogger(app.get(Logger));
  app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: false, // CSP managed by frontend (Next.js)
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Cho phép img cross-origin từ frontend
  }));
  app.setGlobalPrefix('api/v1');

  // Serve uploaded files (avatar, lead documents, attachments) at /uploads/*
  // Path ngoài global prefix 'api/v1' để frontend dùng URL ngắn /uploads/...
  //
  // Security hardening:
  // - nosniff: chặn content-sniffing dù MIME whitelist + magic bytes đã validate ở upload
  // - CSP sandbox: file phục vụ không thể tạo origin context execute script
  //   (img tag render bình thường vì sandbox chỉ ảnh hưởng khi truy cập trực tiếp URL)
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày cache (file UUID immutable)
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    },
  });

  // CORS: require FRONTEND_URL in production to prevent silent fallback
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL environment variable is required in production');
  }
  app.enableCors({
    origin: frontendUrl || 'http://localhost:3011',
    credentials: true,
  });

  await app.listen(port);
}

bootstrap();
