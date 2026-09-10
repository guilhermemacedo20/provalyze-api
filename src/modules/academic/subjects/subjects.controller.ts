import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/subjects.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('courses/:courseId/subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  createSubject(
    @Param('courseId') courseId: string,
    @Body() createSubjectDto: CreateSubjectDto,
  ) {
    return this.subjectsService.createSubject(courseId, createSubjectDto);
  }

  @Get()
  listSubjects(@Param('courseId') courseId: string) {
    return this.subjectsService.listSubjects(courseId);
  }

  @Delete(':subjectId')
  deleteSubject(
    @Param('courseId') courseId: string,
    @Param('subjectId') subjectId: string,
  ) {
    return this.subjectsService.deleteSubject(courseId, subjectId);
  }
}
