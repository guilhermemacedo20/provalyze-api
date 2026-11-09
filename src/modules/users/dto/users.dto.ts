import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import { Trim } from 'src/common/decorators/trim.decorator';

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
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
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
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
