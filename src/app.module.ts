import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AcademicModule } from './modules/academic/academic.module';
import { ExamsModule } from './modules/exams/exams.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, AcademicModule, ExamsModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
