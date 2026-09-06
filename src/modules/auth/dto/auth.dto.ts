import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePasswordDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  actualPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
