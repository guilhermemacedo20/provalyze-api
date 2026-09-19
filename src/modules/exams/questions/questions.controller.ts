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
  UseGuards,
} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto, ListQuestionsDto } from './dto/questions.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
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
