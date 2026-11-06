import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { logsMock } from 'src/test/mocks/logs.mock';
import { ThemeService } from './themes.service';

describe('ThemeService', () => {
  const service = new ThemeService(
    prismaMock as unknown as PrismaService,
    logsMock,
  );
  const request = { user: { id: '1', role: 'TEACHER' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a theme', async () => {
    prismaMock.theme.create.mockResolvedValue({
      id: '1',
      name: 'Álgebra',
      userId: '1',
    });

    await expect(
      service.createTheme(request, { name: 'Álgebra' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Álgebra',
      userId: '1',
    });

    expect(prismaMock.theme.create).toHaveBeenCalledWith({
      data: { name: 'Álgebra', userId: '1' },
    });
  });

  it('should get a theme by id', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({
      id: '1',
      name: 'Álgebra',
    });

    await expect(service.listTheme(request, '1')).resolves.toEqual({
      id: '1',
      name: 'Álgebra',
    });

    expect(prismaMock.theme.findFirst).toHaveBeenCalledWith({
      where: { id: '1', userId: '1' },
    });
  });

  it('should update a theme', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.theme.update.mockResolvedValue({
      id: '1',
      name: 'Geometria',
    });

    await expect(
      service.updateTheme(request, '1', { name: 'Geometria' }),
    ).resolves.toEqual({
      id: '1',
      name: 'Geometria',
    });

    expect(prismaMock.theme.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'Geometria' },
    });
  });

  it('should delete a theme', async () => {
    prismaMock.theme.findFirst.mockResolvedValue({ id: '1' });
    prismaMock.theme.delete.mockResolvedValue({ id: '1' });

    await service.deleteTheme(request, '1');

    expect(prismaMock.theme.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should list themes', async () => {
    prismaMock.theme.findMany.mockResolvedValue([]);

    await expect(service.listThemes(request)).resolves.toEqual([]);

    expect(prismaMock.theme.findMany).toHaveBeenCalledWith({
      where: { userId: '1' },
    });
  });

  it('should throw when the theme does not exist', async () => {
    prismaMock.theme.findFirst.mockResolvedValue(null);

    const listedTheme = service.listTheme(request, '1');

    await expect(listedTheme).rejects.toBeInstanceOf(NotFoundException);
    await expect(listedTheme).rejects.toThrow('Tema não encontrado');
    expect(prismaMock.theme.delete).not.toHaveBeenCalled();
  });

  it('should not update a theme that does not belong to the teacher', async () => {
    prismaMock.theme.findFirst.mockResolvedValue(null);

    const updatedTheme = service.updateTheme(request, '1', {
      name: 'Geometria',
    });

    await expect(updatedTheme).rejects.toBeInstanceOf(NotFoundException);
    await expect(updatedTheme).rejects.toThrow('Tema não encontrado');
    expect(prismaMock.theme.update).not.toHaveBeenCalled();
  });
});
