import { IsString, Matches } from 'class-validator';

export class UploadQuestionImageDto {
  @IsString()
  @Matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'Envie uma imagem PNG ou JPG',
  })
  image!: string;
}
