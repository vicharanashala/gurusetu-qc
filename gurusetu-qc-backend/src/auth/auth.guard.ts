import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

export const AUTH_COOKIE = 'gurusetu_session';

/**
 * Applied globally in AppModule, so every route is closed by default and has to
 * opt out with @Public(). New endpoints are therefore protected the moment they
 * are written, rather than the moment someone remembers to guard them.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Authentication required');

    (req as any).admin = await this.auth.verify(token);
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const fromCookie = (req as any).cookies?.[AUTH_COOKIE];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
    // Bearer is accepted so the API stays usable from curl and scripts.
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
