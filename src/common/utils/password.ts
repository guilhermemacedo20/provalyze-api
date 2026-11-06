import { BadRequestException } from '@nestjs/common';

const PASSWORD_RULES = [
  {
    label: 'Mínimo de 8 caracteres',
    test: (password: string) => password.length >= 8,
  },
  {
    label: 'Uma letra maiúscula',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    label: 'Uma letra minúscula',
    test: (password: string) => /[a-z]/.test(password),
  },
  { label: 'Um número', test: (password: string) => /[0-9]/.test(password) },
] as const;

export function getPasswordChecks(password: string) {
  return PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    met: rule.test(password),
  }));
}

export function assertPasswordStrength(password: string) {
  const checks = getPasswordChecks(password);
  if (checks.every((check) => check.met)) {
    return checks;
  }

  throw new BadRequestException({
    message: 'A senha não atende aos requisitos.',
    checks,
  });
}
