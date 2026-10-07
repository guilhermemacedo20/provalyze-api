import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('exams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEACHER')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get(':answerId/aiValidateQuestion')
  aiValidateQuestion(@Req() req: any, @Param('answerId') answerId: string) {
    return this.examsService.aiValidateQuestion(req, answerId);
  }
}
