import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './role.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  const contextWith = (user: unknown) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow any user when the route has no required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWith({ role: 'STUDENT' }))).toBe(true);
  });

  it('should allow a user whose role is exactly one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'TEACHER']);

    expect(guard.canActivate(contextWith({ role: 'TEACHER' }))).toBe(true);
  });

  it('should deny a user whose role is not in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(guard.canActivate(contextWith({ role: 'STUDENT' }))).toBe(false);
  });

  it('should deny a role that only contains the required role as a substring', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(guard.canActivate(contextWith({ role: 'SUPER_ADMIN' }))).toBe(
      false,
    );
    expect(guard.canActivate(contextWith({ role: 'ADMIN_JR' }))).toBe(false);
  });

  it('should deny when there is no user or the role is not a string', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(guard.canActivate(contextWith(undefined))).toBe(false);
    expect(guard.canActivate(contextWith({}))).toBe(false);
    expect(guard.canActivate(contextWith({ role: ['ADMIN'] }))).toBe(false);
  });
});