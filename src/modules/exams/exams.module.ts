import { Module } from '@nestjs/common';
import { QuestionsController } from './questions/questions.controller';
import { QuestionsService } from './questions/questions.service';
import { ExamsController } from './exams/exams.controller';
import { ExamsService } from './exams/exams.service';

@Module({
  controllers: [ExamsController, QuestionsController],
  providers: [ExamsService, QuestionsService],
})
export class ExamsModule {}
