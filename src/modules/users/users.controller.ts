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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser(@Req() req: any, @Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(req, createUserDto);
  }

  @Get()
  listUsers(@Req() req: any) {
    return this.usersService.listUsers(req);
  }

  @Get(':id')
  getUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.getUser(req, id);
  }

  @Patch(':id')
  updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(req, id, updateUserDto);
  }

  @Delete(':id')
  deleteUser(@Req() req: any, @Param('id') id: string) {
    return this.usersService.deleteUser(req, id);
  }
}