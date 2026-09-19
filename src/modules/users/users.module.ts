import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersPublicController } from './users-public.controller';

@Module({
  controllers: [UsersController, UsersPublicController],
  providers: [UsersService],
})
export class UsersModule {}
