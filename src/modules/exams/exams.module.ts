import { Module } from '@nestjs/common';
import { QuestionsController } from './questions/questions.controller';
import { QuestionsService } from './questions/questions.service';
import { ExamsController } from './exams/exams.controller';
import { ExamsService } from './exams/exams.service';
import { ThemeService } from './theme/theme.service';
import { ThemeController } from './theme/theme.controller';

@Module({
  controllers: [ExamsController, QuestionsController, ThemeController],
  providers: [ExamsService, QuestionsService, ThemeService]
})
export class ExamsModule {}
