import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { RolesGuard } from 'src/common/guards/role.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('report')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('/dashboard-information')
  dashInformation(@Req() req: any) {
    return this.reportService.dashInformation(req);
  }

  @Get('/classAnalytics')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  classAnalytics(
    @Req() req: any,
    @Query('classId') classId?: string,
    @Query('examId') examId?: string,
  ) {
    return this.reportService.classAnalytics(req, classId, examId);
  }

  @Get('/gaps')
  @Roles('TEACHER')
  gapAnalytics(@Req() req: any, @Query('classId') classId?: string) {
    return this.reportService.gapAnalytics(req, classId);
  }

  @Get(':classId/analytics/:studentId/ai')
  @Roles('TEACHER', 'STUDENT')
  studentThemeAnalysis(
    @Req() req: any,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.reportService.studentThemeAnalysis(req, classId, studentId);
  }

  @Get(':classId/analytics/:studentId')
  @Roles('TEACHER', 'STUDENT')
  studentAnalytics(
    @Req() req: any,
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.reportService.studentAnalytics(req, classId, studentId);
  }
}
