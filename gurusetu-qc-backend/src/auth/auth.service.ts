import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AdminUser, AdminUserDocument } from './schemas/admin-user.schema';
import { AppConfig } from '../config/configuration';

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
export const BCRYPT_ROUNDS = 12;

export interface AdminPrincipal {
  sub: string;
  username: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(AdminUser.name)
    private readonly model: Model<AdminUserDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    const username = this.config.get('auth.adminUsername', { infer: true });
    const existing = await this.model.findOne({ username }).lean().exec();
    if (!existing) {
      // Intentionally does NOT create a user with a default password. An admin
      // account that exists with a guessable credential is worse than no
      // account at all, so login stays closed until someone runs the script.
      this.logger.warn(
        `No admin user '${username}' exists yet. Login is disabled until you run: npm run set-password`,
      );
    }
  }

  async login(
    username: string,
    password: string,
  ): Promise<{ token: string; expiresAt: Date; username: string }> {
    const user = await this.model.findOne({ username }).exec();

    // Uniform failure for unknown user and wrong password, and a bcrypt compare
    // against a dummy hash in the unknown-user case so response timing does not
    // reveal whether the username exists.
    if (!user) {
      await bcrypt.compare(password, `$2a$${BCRYPT_ROUNDS}$${'.'.repeat(53)}`);
      throw new UnauthorizedException('Invalid username or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Too many failed attempts. Try again in ${mins} minute(s).`,
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
        user.failedAttempts = 0;
        this.logger.warn(`Admin '${username}' locked out for ${LOCKOUT_MINUTES}m`);
      }
      await user.save();
      throw new UnauthorizedException('Invalid username or password');
    }

    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    const hours = this.config.get('auth.sessionHours', { infer: true });
    const payload: AdminPrincipal = {
      sub: String(user._id),
      username: user.username,
    };
    const token = await this.jwt.signAsync(payload, { expiresIn: `${hours}h` });
    return {
      token,
      expiresAt: new Date(Date.now() + hours * 3_600_000),
      username: user.username,
    };
  }

  async verify(token: string): Promise<AdminPrincipal> {
    try {
      return await this.jwt.verifyAsync<AdminPrincipal>(token);
    } catch {
      throw new UnauthorizedException('Session expired or invalid');
    }
  }

  async changePassword(
    username: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.model.findOne({ username }).exec();
    if (!user) throw new UnauthorizedException('Account not found');
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();
    this.logger.log(`Password changed for admin '${username}'`);
  }

  /** True when an admin credential has been provisioned. */
  async isProvisioned(): Promise<boolean> {
    const username = this.config.get('auth.adminUsername', { infer: true });
    return (await this.model.countDocuments({ username })) > 0;
  }
}
