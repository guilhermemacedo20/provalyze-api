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
import { QuestionsService } from './questions.service';
import { CreateQuestionDto} from './dto/questions.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  createQuestion(@Req() req: any, @Body() createQuestionDto: CreateQuestionDto) {
    return this.questionsService.createQuestion(req, createQuestionDto);
  }

  @Get()
  listQuestions(@Req() req: any) {
    return this.questionsService.listQuestions(req);
  }

  @Get(':id')
  listQuestion(@Req() req: any, @Param('id') id: string) {
    return this.questionsService.listQuestion(req, id);
  }

  @Patch(':id')
  updateQuestion(@Req() req: any, @Param('id') id: string, @Body() updateQuestionDto: CreateQuestionDto) {
    return this.questionsService.updateQuestion(req, id, updateQuestionDto);
  }

  @Delete(':id')
  deleteQuestion(@Req() req: any, @Param('id') id: string) {
    return this.questionsService.deleteQuestion(req, id);
  }
}
