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
import { SkipTerms } from 'src/common/decorators/skip-terms.decorator';
import { TERMS_VERSION } from 'src/common/constants/terms';

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

  @Get('terms')
  terms() {
    return { version: TERMS_VERSION };
  }

  @Post('accept-terms')
  @SkipTerms()
  @UseGuards(JwtAuthGuard)
  acceptTerms(
    @Req() req: { user: { id: string } },
    @Body() _body: AcceptTermsDto,
  ) {
    return this.authService.acceptTerms(req.user);
  }

  @Get('me')
  @SkipTerms()
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { email: string; id: string } }) {
    return this.authService.me(req.user);
  }

  @Get('me/export')
  @SkipTerms()
  @UseGuards(JwtAuthGuard)
  exportMe(@Req() req: { user: { id: string } }) {
    return this.authService.exportMe(req.user);
  }
}
