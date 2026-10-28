import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const DASHBOARD_PERIODS = ['month', 'year', 'all'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS, { message: 'Período deve ser month, year ou all' })
  period?: DashboardPeriod;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mês no formato AAAA-MM' })
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Ano no formato AAAA' })
  year?: string;

  @IsOptional()
  @IsString()
  classId?: string;
}
