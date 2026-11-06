import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { ThemeController } from './themes.controller';
import { ThemeService } from './themes.service';

describe('ThemeController', () => {
  const controller = new ThemeController(
    new ThemeService(prismaMock as unknown as PrismaService, logsMock),
  );
  const request = { user: { id: '1', role: 'TEACHER' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a theme', async () => {
    prismaMock.theme.create.mockResolvedValue({
      id: '1',
      name: 'Álgebra',
    });

    const result = await controller.createTheme(request, { name: 'Álgebra' });

    expect(result).toEqual({ id: '1', name: 'Álgebra' });
    expect(prismaMock.theme.create).toHaveBeenCalledWith({
      data: { name: 'Álgebra', userId: '1' },
    });
  });
});
