import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { RolesGuard } from 'src/common/guards/role.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';

@Controller('report')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('/dashboard-information')
  dashInformation(@Req() req: any) {
    return this.reportService.dashInformation(req);
  }
}
