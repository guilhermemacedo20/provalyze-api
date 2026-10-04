import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateCourseDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}