import { ExamEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
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

export class EventDto {
  @IsEnum(ExamEventType)
  type!: ExamEventType;

  @IsString()
  examQuestionId!: string;
}

export class SubmitExamEventDto {
  @ValidateNested()
  @Type(() => EventDto)
  event!: EventDto;
}
