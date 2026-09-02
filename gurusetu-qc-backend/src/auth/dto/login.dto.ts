import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'New password must be at least 12 characters' })
  @MaxLength(500)
  newPassword!: string;
}
