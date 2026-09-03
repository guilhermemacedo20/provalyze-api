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
import { ThemeService } from './theme.service';
import { CreateThemeDto } from './dto/themes.dto';

@Controller('theme')
export class ThemeController {
  constructor(private readonly themeService: ThemeService) {}

  @Post()
  createTheme(@Req() req: any, @Body() createThemeDto: CreateThemeDto) {
    return this.themeService.createTheme(req, createThemeDto);
  }

  @Get()
  listThemes(@Req() req: any) {
    return this.themeService.listThemes(req);
  }

  @Get(':id')
  listTheme(@Req() req: any, @Param('id') id: string) {
    return this.themeService.listTheme(req, id);
  }

  @Patch(':id')
  updateTheme(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateThemeDto: CreateThemeDto,
  ) {
    return this.themeService.updateTheme(req, id, updateThemeDto);
  }

  @Delete(':id')
  deleteTheme(@Req() req: any, @Param('id') id: string) {
    return this.themeService.deleteTheme(req, id);
  }
}
