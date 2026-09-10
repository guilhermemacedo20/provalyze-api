import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto, AddStudentDto } from './dto/classes.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  createClass(@Req() req: any, @Body() createClassDto: CreateClassDto) {
    return this.classesService.createClass(req, createClassDto);
  }

  @Get()
  listClasses(@Req() req: any) {
    return this.classesService.listClasses(req);
  }

  @Get(':id')
  getClass(@Req() req: any, @Param('id') id: string) {
    return this.classesService.getClass(req, id);
  }

  @Post(':id/students')
  addStudent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() addStudentDto: AddStudentDto,
  ) {
    return this.classesService.addStudent(req, id, addStudentDto.studentId);
  }

  @Delete(':id/students/:studentId')
  removeStudent(
    @Req() req: any,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.classesService.removeStudent(req, id, studentId);
  }

  @Delete(':id')
  deleteClass(@Req() req: any, @Param('id') id: string) {
    return this.classesService.deleteClass(req, id);
  }
}