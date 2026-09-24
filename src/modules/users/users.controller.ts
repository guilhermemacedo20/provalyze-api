import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';
import { RolesGuard } from 'src/common/guards/role.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUserFromAdmin(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUserFromAdmin(createUserDto);
  }

  @Get()
  @Roles('ADMIN', 'TEACHER', 'COORDINATOR')
  listUsers(@Req() req: any) {
    return this.usersService.listUsers(req);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(`ADMIN`, `COORDINATOR`, `STUDENT`, `TEACHER`)
  deleteUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.deleteUser(req, id);
  }
}
