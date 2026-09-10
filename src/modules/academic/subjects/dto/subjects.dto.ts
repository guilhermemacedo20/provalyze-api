import { IsString } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  name!: string;
}