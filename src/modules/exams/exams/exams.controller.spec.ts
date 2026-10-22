import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { logsMock } from 'src/test/mocks/logs.mock';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { aiMock } from 'src/test/mocks/ai.mock';

describe('ExamsController', () => {
  const controller = new ExamsController(
    new ExamsService(prismaMock as unknown as PrismaService, logsMock, aiMock),
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
