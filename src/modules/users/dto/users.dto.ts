import { IsEmail, IsEnum, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  name!: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}

export class UpdateUserDto {
  @IsString()
  name!: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value as string;
  })
  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}
