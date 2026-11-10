import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from 'src/common/decorators/trim.decorator';

export class CreateCourseDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

export class UpdateCourseDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
