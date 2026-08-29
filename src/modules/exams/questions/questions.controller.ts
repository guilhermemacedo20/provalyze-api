import { Body, Controller, Post, Req } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/questions.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(@Req() req: any, @Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.create(req,createQuestionDto);
  }
}
