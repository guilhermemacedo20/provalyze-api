import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { RolesGuard } from 'src/common/guards/role.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CreatePedagogicalReportDto } from './dto/create-pedagogical-report.dto';
import { DashboardQueryDto } from './dto/dashboard.dto';

@Controller('report')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('dashboard-information')
  dashInformation(@Req() req: any, @Query() query: DashboardQueryDto) {
    return this.reportService.dashInformation(req, query);
  }

  @Get('classAnalytics')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  classAnalytics(
    @Req() req: any,
    @Query('classId') classId?: string,
    @Query('examId') examId?: string,
  ) {
    return this.reportService.classAnalytics(req, classId, examId);
  }

  @Get('gaps')
  @Roles('TEACHER')
  gapAnalytics(@Req() req: any, @Query('classId') classId?: string) {
    return this.reportService.gapAnalytics(req, classId);
  }

  @Get('pedagogical-reports')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  listPedagogicalReports(@Req() req: any, @Query('classId') classId?: string) {
    return this.reportService.listPedagogicalReports(req, classId);
  }

  @Post('pedagogical-reports')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  createPedagogicalReport(
    @Req() req: any,
    @Body() body: CreatePedagogicalReportDto,
  ) {
    return this.reportService.createPedagogicalReport(req, body);
  }

  @Get('pedagogical-reports/:id')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  getPedagogicalReport(@Req() req: any, @Param('id') id: string) {
    return this.reportService.getPedagogicalReport(req, id);
  }

  @Delete('pedagogical-reports/:id')
  @Roles('TEACHER', 'ADMIN', 'COORDINATOR')
  deletePedagogicalReports(@Req() req: any, @Param('id') id: string) {
    return this.reportService.deletePedagogicalReport(req, id);
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
