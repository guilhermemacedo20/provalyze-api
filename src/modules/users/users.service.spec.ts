import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { UsersService } from './users.service';
import { prismaMock } from 'src/test/mocks/prisma.mock';
import { mailMock } from 'src/test/mocks/mail.mock';

describe('UsersService', () => {
  const service = new UsersService(
    prismaMock as unknown as PrismaService,
    mailMock,
  );
  const admin = { user: { id: '1', role: Role.ADMIN } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should anonymize a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.TEACHER,
    });

    prismaMock.user.create.mockResolvedValue({ id: '1' });

    await service.deleteUser({ user: { id: '1', role: Role.TEACHER } }, '1');

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        name: 'Usuário removido',
        email: 'removido-1@anon.provalyze.local',
        anonymizedAt: expect.any(Date),
      },
    });

    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('should get user by ID', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });

    await expect(service.getUser('1')).resolves.toEqual({
      id: '1',
      role: Role.ADMIN,
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should update user', async () => {
    prismaMock.user.update.mockResolvedValue({
      id: '1',
      name: 'Updated Name',
      email: 'test@example.com',
    });

    await expect(
      service.updateUser('1', {
        name: 'Updated Name',
        email: 'test@example.com',
        role: Role.ADMIN,
      }),
    ).resolves.toEqual({
      id: '1',
      name: 'Updated Name',
      email: 'test@example.com'
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { name: 'Updated Name', email: 'test@example.com', role: Role.ADMIN },
    });
  });

  it('should not allow deletion of the unique administrator', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });
    prismaMock.user.count.mockResolvedValue(1);

    await expect(service.deleteUser(admin, '1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.deleteUser(admin, '1')).rejects.toEqual(
      expect.objectContaining({
        message: 'Não é possível excluir o único administrador do sistema.',
      }),
    );

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('should allow to delete an administrator when another exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: '1',
      role: Role.ADMIN,
    });
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.delete.mockResolvedValue({ id: '1' });

    await service.deleteUser(admin, '1');

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { role: Role.ADMIN, anonymizedAt: null },
    });
    expect(prismaMock.user.delete).toHaveBeenCalled();
  });
});
