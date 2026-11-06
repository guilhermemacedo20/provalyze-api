import { LogsService } from 'src/infra/logs/logs.service';

export const logsMock = {
  audit: jest.fn(),
} as unknown as LogsService;
