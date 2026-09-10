import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto, ListQuestionsDto } from './dto/questions.dto';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  createQuestion(
    @Req() req: any,
    @Body() createQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.createQuestion(req, createQuestionDto);
  }

  @Get()
  listQuestions(@Req() req: any, @Query() query: ListQuestionsDto) {
    return this.questionsService.listQuestions(req, query);
  }

  @Get(':id')
  listQuestion(@Req() req: any, @Param('id') id: string) {
    return this.questionsService.listQuestion(req, id);
  }

  @Patch(':id')
  updateQuestion(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateQuestionDto: CreateQuestionDto,
  ) {
    return this.questionsService.updateQuestion(req, id, updateQuestionDto);
  }

  @Delete(':id')
  deleteQuestion(@Req() req: any, @Param('id') id: string) {
    return this.questionsService.deleteQuestion(req, id);
  }
}
