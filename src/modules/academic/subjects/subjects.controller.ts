import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/subjects.dto';

@Controller('courses/:courseId/subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  createSubject(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Body() createSubjectDto: CreateSubjectDto,
  ) {
    return this.subjectsService.createSubject(req, courseId, createSubjectDto);
  }

  @Get()
  listSubjects(@Req() req: any, @Param('courseId') courseId: string) {
    return this.subjectsService.listSubjects(req, courseId);
  }

  @Delete(':subjectId')
  deleteSubject(
    @Req() req: any,
    @Param('courseId') courseId: string,
    @Param('subjectId') subjectId: string,
  ) {
    return this.subjectsService.deleteSubject(req, courseId, subjectId);
  }
}