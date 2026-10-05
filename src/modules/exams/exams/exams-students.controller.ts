import { Controller, UseGuards, Get, Param, Req } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('classes-exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STUDENT')
export class ExamsStudentsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get(':classId/exams/:examId')
  getExam(
    @Req() req: any,
    @Param('classId') classId: string,
    @Param('examId') examId: string,
  ) {
    return this.examsService.getExam(req, classId, examId);
  }

  @Get(':id')
  getStudentClassExam(@Req() req: any, @Param('id') classId: string) {
    return this.examsService.getStudentClassExam(req, classId);
  }
}
