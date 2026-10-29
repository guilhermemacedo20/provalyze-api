import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AcceptTermsDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  RegisterDto,
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
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: any, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(req, body);
  }

  @Post('/register')
  registerUser(@Body() registerUser: RegisterDto) {
    return this.authService.registerUser(registerUser);
  }

  @Post('accept-terms')
  @UseGuards(JwtAuthGuard)
  acceptTerms(
    @Req() req: { user: { id: string } },
    @Body() _body: AcceptTermsDto,
  ) {
    return this.authService.acceptTerms(req.user);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { email: string; id: string } }) {
    return this.authService.me(req.user);
  }
}