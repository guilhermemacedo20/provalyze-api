import { IsString } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  name!: string;
}

export class UpdateCourseDto {
  @IsString()
  name!: string;
}