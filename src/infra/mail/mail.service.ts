import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  async sendPasswordReset(to: string, code: string, time: Date) {
    const apiKey = this.config.get<string>('EMAIL_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    const expiresAt = time.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    if (!apiKey || !from) {
      console.info('Configurações do .env não foram definidas');
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Redefinição de senha - Provalyze',
        html: `<p>Seu código é <strong>${code}</strong>. Expira em ${expiresAt}</p>`,
      }),
    });

    if (!response.ok) {
      console.info(`Falha ao enviar e-mail`);
      return;
    }
  }
}
