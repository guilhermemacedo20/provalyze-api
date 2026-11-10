import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from 'src/common/decorators/trim.decorator';

export class CreateThemeDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
