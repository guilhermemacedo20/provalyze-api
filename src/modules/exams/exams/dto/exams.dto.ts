import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SubmitExamAnswerDto {
  @IsString()
  examQuestionId!: string;

  @IsOptional()
  @IsString()
  optionId?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class SubmitExamDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitExamAnswerDto)
  answers!: SubmitExamAnswerDto[];
}
