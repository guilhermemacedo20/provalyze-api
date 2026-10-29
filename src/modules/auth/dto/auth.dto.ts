import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
  IsString,
  Length,
  MinLength,
  IsBoolean,
  IsOptional,
} from 'class-validator';

const TERMS_MESSAGE =
  'É necessário aceitar os Termos de Uso e a Política de Privacidade.';

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
  newPassword!: string;

  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
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
  newPassword!: string;
}

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  @IsString()
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @Equals(true, { message: TERMS_MESSAGE })
  acceptTerms!: boolean;
}

export class AcceptTermsDto {
  @Equals(true, { message: TERMS_MESSAGE })
  acceptTerms!: boolean;
}