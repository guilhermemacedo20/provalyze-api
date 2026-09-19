import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { RegisterDto } from './dto/users.dto';

@Controller('users')
export class UsersPublicController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/register')
  registerUser(@Body() registerUser: RegisterDto) {
    return this.usersService.registerUser(registerUser);
  }
}
