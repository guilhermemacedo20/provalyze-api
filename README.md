<h1 align="center">Provalyze - API</h1>

<p align="center">
  Back-end do Provalyze, plataforma de provas online, banco de questões e acompanhamento pedagógico.
</p>

## Sobre

Monólito NestJS: Controller → Service → Prisma. Prefixo global `api`, porta `3333` (ou `PORT` no `.env`).

## Tecnologias e versões

Versões do repositório.

| Tecnologia                                                           | Versão                           | Uso                        |
| -------------------------------------------------------------------- | -------------------------------- | -------------------------- |
| Node.js                                                              | 20+                              | Runtime                    |
| NestJS (`@nestjs/common`, `core`, `platform-express`,`config`,`jwt`) | 11.0.x                           | HTTP, módulos              |
| TypeScript                                                           | 5.7.3                            | Tipagem                    |
| Prisma                                                               | 6.19.3                           | ORM e migrations           |
| PostgreSQL                                                           | 16 (imagem `postgres:16-alpine`) | Banco de dados             |
| Docker                                                               | -                                | Sobe o Postgres localmente |
| class-validator                                                      | 0.15.1                           | DTOs                       |
| class-transformer                                                    | 0.5.1                            | ValidationPipe transform   |
| passport                                                             | 0.7.0                            | Configuração jwt           |
| jwt                                                                  | 4.0.1                            | Autenticação               |
| ESLint                                                               | 9.18.0                           | Lint                       |
| Jest                                                                 | 30.0.0                           | Testes                     |
| Google GenAi                                                         | 1.0.0                            | IA                         |

Pipe global: `whitelist`, `transform`, `forbidNonWhitelisted`. Auth JWT (`@nestjs/jwt` + Passport) quando o módulo de auth estiver ativo.

## Módulos

`PrismaModule` é global, único acesso ao Postgres.

| Módulo       | Domínio                                       | O que cobre                                                                                                                |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Auth**     | Identidade                                    | Login, `/me`, reset de senha.                                                                                              |
| **Users**    | Conta e roles (`ADMIN`, `TEACHER`, `STUDENT`) | Listagem e cadastro (aluno/professor no fluxo público)                                                                     |
| **Academic** | Curso, matéria, turma                         | Turmas com `joinCode`, `TeacherAssignment` / `StudentAssignment` (`endedAt` ao sair, sem apagar o usuário)                 |
| **Exams**    | Tema, questão, prova                          | Banco de questões por tema (`Theme` → `Question` → `QuestionOption`). Excluir tema apaga as questões (`onDelete: Cascade`) |
| **Report**   | analytics, dashboard e relatórios             | Relatórios gerados a partir do banco de dados, análise de conteúdos e dhashboard ao usuários(Dados gerais)                 |

Temas e questões pertencem ao professor (`userId`). Rotas de tema autenticadas usam o `JwtAuthGuard` + `RolesGuard`

## Variáveis de ambiente

Crie o `.env` na raiz (não commitar):

```env
DATABASE_URL="postgresql://educacao:educacao@localhost:5432/educacao_provas?schema=public"
PORT=3333
JWT_SECRET="secret"
JWT_EXPIRES_IN="1d"
EMAIL_KEY=""
MAIL_FROM="Provalyze <noreply@provalyze.com.br>"
HAS_LOGS=false
AI_MODEL=""
AI_TOKEN=""
```

## Banco (Docker + Prisma)

Prisma e Nest rodam na máquina e conectam em `localhost:5432` definido via docker.

Credenciais iguais ao `docker-compose.yml`:

- usuário `educacao` / senha `educacao` / banco `educacao_provas`
- container: `pfc-postgres`

```bash
npm install
npm run db:up
npm run prisma:migrate:dev
npm run start:dev
```

| Comando                         | Uso                                   |
| ------------------------------- | ------------------------------------- |
| `npm run db:up`                 | Sobe o Postgres                       |
| `npm run prisma:migrate:dev`    | Cria/aplica migration em dev          |
| `npm run prisma:migrate:deploy` | Aplica migrations já existentes (PRD) |
| `npm run prisma:generate`       | Regenera o client                     |
| `npm run prisma:reset`          | Apaga dados e reaplica                |
| `npm run start:dev`             | API em watch                          |
| `npm run test`                  | Testes unitários                      |

Se a porta 5432 estiver ocupada, mude o mapeamento no compose (ex.: `"5433:5432"`) e a porta no `DATABASE_URL`.

## Estrutura

```
src/
  common/           # guards (JWT, roles), decorators, tipos
  infra/            # infraestrutura do projeto
    prisma/
    ai/
    logs/
    mail/
  modules/          # módulos separados por funcionalidade
    auth/
    academic/
    exams/
    users/
    report/
prisma/
  schema.prisma
  migrations/
```
