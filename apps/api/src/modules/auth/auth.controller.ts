import { Controller, Post, Get, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login-credentials.dto';
import { RefreshTokenDto } from './dto/refresh-token-request.dto';
import { Public } from './decorators/public-route.decorator';
import { CurrentUser } from './decorators/current-user-param.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ auth: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const tokens = await this.authService.login(
      dto.email,
      dto.password,
      req.headers['user-agent'],
      req.ip,
    );
    return { data: tokens };
  }

  @Public()
  @Post('refresh')
  @Throttle({ auth: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const tokens = await this.authService.refreshTokens(
      dto.refreshToken,
      req.headers['user-agent'],
      req.ip,
    );
    return { data: tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { data: { message: 'Đăng xuất thành công' } };
  }

  @Get('me')
  async me(@CurrentUser() user: Record<string, unknown>) {
    return { data: user };
  }
}
