import { existsSync, readFileSync } from 'fs';
import { join } from 'path';


// Configura as variáveis de ambiente dos testes de integração ANTES de a aplicação ser carregada. 
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://educacao:educacao@localhost:5432/educacao_provas_test?schema=public';

function readEnvTestFile(): Record<string, string> {
  const file = join(__dirname, '..', '..', '..', '.env.test');
  if (!existsSync(file)) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

const fromFile = readEnvTestFile();

process.env.DATABASE_URL = fromFile.DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
process.env.JWT_SECRET = 'jwt-secret-dos-testes-de-integracao';
process.env.JWT_EXPIRES_IN = '1d';
process.env.HAS_LOGS = 'false';
// Sem chave de e-mail: o MailService nunca chama a API externa (Resend).
process.env.EMAIL_KEY = '';
process.env.MAIL_FROM = '';

const databaseName = new URL(process.env.DATABASE_URL).pathname;
if (!databaseName.includes('test')) {
  throw new Error(
    `Testes de integração recusados: o banco "${databaseName}" não parece ser de teste. ` +
      'Use um banco cujo nome contenha "test" (ex.: educacao_provas_test).',
  );
}