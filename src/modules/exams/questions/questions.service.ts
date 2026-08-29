import { Injectable } from '@nestjs/common';
import { CreateQuestionDto } from './dto/questions.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(req: any, createQuestion: CreateQuestionDto) {
    return 'This action adds a question';
  }
}
