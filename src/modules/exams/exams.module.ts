import { Module } from '@nestjs/common';
import { QuestionsController } from './questions/questions.controller';
import { QuestionsService } from './questions/questions.service';
import { ExamsController } from './exams/exams.controller';
import { ExamsService } from './exams/exams.service';
import { ThemeService } from './theme/themes.service';
import { ThemeController } from './theme/themes.controller';
import { ExamsStudentsController } from './exams/exams-students.controller';

@Module({
  controllers: [
    ExamsController,
    ExamsStudentsController,
    QuestionsController,
    ThemeController,
  ],
  providers: [ExamsService, QuestionsService, ThemeService],
})
export class ExamsModule {}
