import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

/**
 * Chặn mọi thao tác ghi khi chạy bản demo (DEMO_MODE=true).
 * Khách vẫn xem (GET) thoải mái; POST/PUT/PATCH/DELETE bị chặn kèm message
 * để frontend tự hiện toast (sonner). App thật (DEMO_MODE khác 'true') không bị ảnh hưởng.
 *
 * Chừa cửa đăng nhập/gia hạn/đăng xuất, nếu không khách không vào được demo.
 */
@Injectable()
export class DemoReadonlyGuard implements CanActivate {
  private readonly enabled = process.env.DEMO_MODE === 'true';

  // Đường dẫn ghi vẫn cho phép trong demo (login/refresh/logout).
  private readonly allowedWritePaths = ['/auth/login', '/auth/refresh', '/auth/logout'];

  private readonly writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.enabled) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!this.writeMethods.includes(req.method)) return true;

    // req.path đã bỏ query string; so khớp phần đuôi vì có global prefix /api/v1.
    const isAllowed = this.allowedWritePaths.some((p) => req.path.endsWith(p));
    if (isAllowed) return true;

    throw new ForbiddenException('Đây là bản demo, không cho phép tạo/sửa/xóa dữ liệu');
  }
}
