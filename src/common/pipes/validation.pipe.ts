import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

const number = (msg: string) => msg.match(/\d+/)?.[0] ?? '';

const TRANSLATIONS: [string, (msg: string) => string][] = [
  ['should not exist', () => 'não é permitido'],
  ['should not be empty', () => 'não pode ficar vazio'],
  ['must be an email', () => 'deve ser um e-mail válido'],
  ['must be a string', () => 'deve ser um texto'],
  ['must be a boolean', () => 'deve ser verdadeiro ou falso'],
  ['must be a number', () => 'deve ser um número'],
  ['must be a valid ISO 8601 date string', () => 'deve ser uma data válida'],
  ['must be an array', () => 'deve ser uma lista'],
  ['elements must be unique', () => 'não pode ter itens repetidos'],
  [
    'must be one of the following values',
    (msg) => `deve ser um destes valores: ${msg.split(': ').pop()}`,
  ],
  [
    'must be longer than or equal to',
    (msg) => `deve conter pelo menos ${number(msg)} caracteres`,
  ],
  [
    'must be shorter than or equal to',
    (msg) => `deve conter no máximo ${number(msg)} caracteres`,
  ],
  ['must not be less than', (msg) => `deve ser no mínimo ${number(msg)}`],
  ['must not be greater than', (msg) => `deve ser no máximo ${number(msg)}`],
  [
    'must contain at least',
    (msg) => `deve ter pelo menos ${number(msg)} itens`,
  ],
];

function translate(field: string, msg: string) {
  const translation = TRANSLATIONS.find(([text]) => msg.includes(text));
  return translation ? `O campo ${field} ${translation[1](msg)}.` : msg;
}

function messages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}).map((msg) =>
      translate(error.property, msg),
    ),
    ...messages(error.children ?? []),
  ]);
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new BadRequestException(messages(errors)),
  });
}
