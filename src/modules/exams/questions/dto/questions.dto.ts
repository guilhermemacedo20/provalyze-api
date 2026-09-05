import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf
} from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  statement!: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  themeId!: string;

  @IsOptional()
  @IsString()
  correctOption?: string;

  @ValidateIf(
    (dto: CreateQuestionDto) => dto.type === QuestionType.MULTIPLE_CHOICE,
  )
  @IsArray()
  @Type(() => CreateQuestionOptionDto)
  @ArrayMinSize(2)
  options?: CreateQuestionOptionDto[];
}

export class CreateQuestionOptionDto {
  @IsString()
  label!: string;

  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class ListQuestionsDto {
  @IsOptional()
  @IsString()
  themeId?: string;
}
