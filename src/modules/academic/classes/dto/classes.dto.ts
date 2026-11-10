import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from 'src/common/decorators/trim.decorator';

export class CreateClassDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;
}

export class AddStudentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;
}

export class SetClassVisibilityDto {
  @IsBoolean()
  hidden!: boolean;
}

export class JoinClassDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code!: string;
}
