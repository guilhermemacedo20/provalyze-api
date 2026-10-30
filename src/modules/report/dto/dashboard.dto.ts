import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const DASHBOARD_PERIODS = ['semester', 'year', 'all'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS, {
    message: 'Período deve ser semester, year ou all',
  })
  period?: DashboardPeriod;

  @IsOptional()
  @Matches(/^\d{4}-[12]$/, {
    message: 'Semestre no formato AAAA-1 ou AAAA-2',
  })
  semester?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Ano no formato AAAA' })
  year?: string;

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;
}
