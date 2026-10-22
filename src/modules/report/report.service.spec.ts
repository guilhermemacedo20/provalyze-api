import { aiMock } from 'src/test/mocks/ai.mock';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { logsMock } from 'src/test/mocks/logs.mock';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { ReportService } from './report.service';

describe('ReportService', () => {
  const service = new ReportService(
    prismaMock as unknown as PrismaService,
    aiMock,
    logsMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
