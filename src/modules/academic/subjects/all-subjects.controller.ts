import { Controller, Get, Req } from '@nestjs/common';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class AllSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  listAllSubjects(@Req() req: any) {
    return this.subjectsService.listAllSubjects(req);
  }
}