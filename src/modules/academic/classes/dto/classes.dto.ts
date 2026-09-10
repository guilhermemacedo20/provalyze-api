import { IsString } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  teacherId!: string;
}

export class AddStudentDto {
  @IsString()
  studentId!: string;
}