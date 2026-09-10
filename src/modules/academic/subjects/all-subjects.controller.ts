import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';

@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AllSubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  listAllSubjects() {
    return this.subjectsService.listAllSubjects();
  }
}
