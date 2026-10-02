import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogsService } from '../logs/logs.service';

@Injectable()
export class MailService {
  constructor(
    private readonly config: ConfigService,
    private readonly logs: LogsService,
  ) {}

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
    try {
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
    } catch (err) {
      this.logs.audit('', `Ocorreu um erro ao enviar o e-mail: ${err}`);
      return { message: `Ocorreu um erro ao enviar o e-mail: ${err}` };
    }
  }

  async sendCreateUser(to: string) {
    const apiKey = this.config.get<string>('EMAIL_KEY');
    const from = this.config.get<string>('MAIL_FROM');

    if (!apiKey || !from) {
      console.info('Configurações do .env não foram definidas');
      return;
    }
    
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: 'Conta criada - Provalyze',
          html: `<h2>Conta criada com sucesso!</h2> 
        <p> Sua conta no <strong>Provalyze</strong> foi criada. </p> 
        <p> Para realizar seu primeiro acesso, acesse o site: </p>
        <p> <a href="https://www.provalyze.com.br"> https://www.provalyze.com.br </a> </p> 
        <p> Depois, clique em <strong>"Esqueci minha senha"</strong> e informe seu e-mail para cadastrar sua senha. </p> 
        <p> Após definir sua senha, você poderá acessar sua conta normalmente. </p> 
        <p> <strong>Provalyze</strong> </p>`,
        }),
      });

      if (!response.ok) {
        console.info(`Falha ao enviar e-mail`);
        return;
      }
    } catch (err) {
      this.logs.audit('', `Ocorreu um erro ao enviar o e-mail: ${err}`);
      return { message: `Ocorreu um erro ao enviar o e-mail: ${err}` };
    }
  }
}
