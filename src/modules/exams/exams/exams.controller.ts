import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { SaveExamDto } from './dto/exams.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  createExam(
    @Req() req: AuthenticatedRequest,
    @Body() saveExamDto: SaveExamDto,
  ) {
    return this.examsService.createExam(req, saveExamDto);
  }

  @Get()
  listExams(@Req() req: AuthenticatedRequest) {
    return this.examsService.listExams(req);
  }

  @Get(':id')
  getExam(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.examsService.getExam(req, id);
  }

  @Get(':id/overview')
  getOverview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.examsService.getOverview(req, id);
  }

  @Patch(':id')
  updateExam(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() saveExamDto: SaveExamDto,
  ) {
    return this.examsService.updateExam(req, id, saveExamDto);
  }

  @Post(':id/publish')
  publishExam(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.examsService.publishExam(req, id);
  }

  @Delete(':id')
  deleteExam(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.examsService.deleteExam(req, id);
  }
}