import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  createCourse(@Req() req: any, @Body() createCourseDto: CreateCourseDto) {
    return this.coursesService.createCourse(req, createCourseDto);
  }

  @Get()
  listCourses(@Req() req: any) {
    return this.coursesService.listCourses(req);
  }

  @Get(':id')
  getCourse(@Req() req: any, @Param('id') id: string) {
    return this.coursesService.getCourse(req, id);
  }

  @Patch(':id')
  updateCourse(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(req, id, updateCourseDto);
  }

  @Delete(':id')
  deleteCourse(@Req() req: any, @Param('id') id: string) {
    return this.coursesService.deleteCourse(req, id);
  }
}