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
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto } from './dto/courses.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'COORDINATOR')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  createCourse(@Req() req: any, @Body() createCourseDto: CreateCourseDto) {
    return this.coursesService.createCourse(req, createCourseDto);
  }

  @Get()
  listCourses() {
    return this.coursesService.listCourses();
  }

  @Get(':id')
  getCourse(@Param('id') id: string) {
    return this.coursesService.getCourse(id);
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
