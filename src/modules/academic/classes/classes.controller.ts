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
import { ClassesService } from './classes.service';
import { CreateClassDto, AddStudentDto } from './dto/classes.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'TEACHER', 'COORDINATOR')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  createClass(@Req() req: any, @Body() createClassDto: CreateClassDto) {
    return this.classesService.createClass(req, createClassDto);
  }

  @Get()
  listClasses() {
    return this.classesService.listClasses();
  }

  @Get(':id')
  getClass(@Param('id') id: string) {
    return this.classesService.getClass(id);
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
