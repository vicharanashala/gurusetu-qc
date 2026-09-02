import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { AUTH_COOKIE } from './auth.guard';
import { AppConfig } from '../config/configuration';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Whether an admin credential exists — lets the UI explain a closed login. */
  @Public()
  @Get('status')
  async status() {
    return { provisioned: await this.auth.isProvisioned() };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, expiresAt, username } = await this.auth.login(
      dto.username,
      dto.password,
    );
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('auth.cookieSecure', { infer: true }),
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    // The token is also returned so non-browser clients can use Bearer auth.
    return { username, expiresAt, token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    const admin = (req as any).admin as { username: string } | undefined;
    return { username: admin?.username };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const admin = (req as any).admin as { username: string };
    await this.auth.changePassword(
      admin.username,
      dto.currentPassword,
      dto.newPassword,
    );
    return { ok: true };
  }
}
