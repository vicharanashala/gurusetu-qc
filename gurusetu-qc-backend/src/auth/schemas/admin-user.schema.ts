import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminUserDocument = HydratedDocument<AdminUser>;

/**
 * There is exactly one admin. The app deliberately has no registration route —
 * the credential is provisioned out-of-band by `npm run set-password`, which
 * writes the bcrypt hash straight into this collection.
 */
@Schema({ timestamps: true, collection: 'admin_users' })
export class AdminUser {
  @Prop({ required: true, unique: true, index: true })
  username!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop()
  lastLoginAt?: Date;

  /** Consecutive failed attempts; reset on success. Drives lockout. */
  @Prop({ default: 0 })
  failedAttempts!: number;

  @Prop()
  lockedUntil?: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
