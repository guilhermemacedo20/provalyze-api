import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Trim } from 'src/common/decorators/trim.decorator';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export class CreateQuestionOptionDto {
  @IsIn(OPTION_LABELS)
  label!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  statement!: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @IsNotEmpty()
  themeId!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ValidateIf(
    (dto: CreateQuestionDto) => dto.type === QuestionType.MULTIPLE_CHOICE,
  )
  @IsIn(OPTION_LABELS)
  correctOption?: string;

  @ValidateIf(
    (dto: CreateQuestionDto) => dto.type === QuestionType.MULTIPLE_CHOICE,
  )
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionOptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  options?: CreateQuestionOptionDto[];
}

export class ListQuestionsDto {
  @IsOptional()
  @IsString()
  themeId?: string;
}
