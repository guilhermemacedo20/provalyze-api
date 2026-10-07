import { ExamEventType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExamQuestionInputDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000)
  points!: number;
}

export class SaveExamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome da prova' })
  @MaxLength(120)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  // Total de pontos da prova, escolhido pelo professor. Omitido = 10.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000)
  totalScore?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionInputDto)
  questions!: ExamQuestionInputDto[];

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  classIds!: string[];

  // true = já publica ao salvar e false/omitido = rascunho.
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

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
