import { execSync } from 'child_process';
import './test-env';

// aplica as migrations do Prisma no banco de teste.
export default function globalSetup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}