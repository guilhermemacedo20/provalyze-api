import { Module } from '@nestjs/common';
import { CoursesController } from './courses/courses.controller';
import { CoursesService } from './courses/courses.service';
import { SubjectsController } from './subjects/subjects.controller';
import { AllSubjectsController } from './subjects/all-subjects.controller';
import { SubjectsService } from './subjects/subjects.service';
import { ClassesController } from './classes/classes.controller';
import { ClassesService } from './classes/classes.service';

@Module({
  controllers: [
    CoursesController,
    SubjectsController,
    AllSubjectsController,
    ClassesController,
  ],
  providers: [CoursesService, SubjectsService, ClassesService],
})
export class AcademicModule {}