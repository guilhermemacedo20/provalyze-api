import { MailService } from 'src/infra/mail/mail.service';

export const mailMock = {
  sendCreateUser: jest.fn(),
  sendPasswordReset: jest.fn(),
} as unknown as MailService;
