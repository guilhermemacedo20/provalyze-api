import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/subjects.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('courses/:courseId/subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'COORDINATOR')
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
  listSubjects(@Param('courseId') courseId: string) {
    return this.subjectsService.listSubjects(courseId);
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
