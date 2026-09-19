import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.loginUser(body);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Post('change-password')
  changePassword(@Body() body: ChangePasswordDto) {
    return this.authService.changePassword(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { email: string; id: string } }) {
    return this.authService.me(req.user);
  }
}
