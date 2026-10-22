import { ExamsService } from './exams.service';
import { aiMock } from 'src/test/mocks/ai.mock';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { logsMock } from 'src/test/mocks/logs.mock';
import { prismaMock } from 'src/test/mocks/prisma.mock';

describe('ExamsService', () => {
  const service = new ExamsService(
    prismaMock as unknown as PrismaService,
    logsMock,
    aiMock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
