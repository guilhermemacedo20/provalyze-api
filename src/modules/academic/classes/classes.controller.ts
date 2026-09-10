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
import { CreateClassDto } from './dto/classes.dto';

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

  @Delete(':id')
  deleteClass(@Req() req: any, @Param('id') id: string) {
    return this.classesService.deleteClass(req, id);
  }
}