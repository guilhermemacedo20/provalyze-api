import { ReportAnalysisType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class CreatePedagogicalReportDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsEnum(ReportAnalysisType)
  analysisType!: ReportAnalysisType;
}
