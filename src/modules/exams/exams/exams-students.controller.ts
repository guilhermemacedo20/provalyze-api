import { Controller, UseGuards, Get, Param, Req, Post, Body } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { SubmitExamDto } from './dto/exams.dto';

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

  @Get(':classId')
  getStudentClassExams(@Req() req: any, @Param('classId') classId: string) {
    return this.examsService.getStudentClassExams(req, classId);
  }

  @Post(':classId/exams/:examId/submit')
  submitExam(
    @Req() req: any,
    @Param('classId') classId: string,
    @Param('examId') examId: string,
    @Body() body: SubmitExamDto,
  ) {
    return this.examsService.submitExam(req, classId, examId,body);
  }
}
