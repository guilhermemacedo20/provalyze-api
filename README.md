<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

API do **Provalyze**: monólito modular (Controller → Service → Prisma). Prefixo global `api`, porta a ser adicionada no .env ou "3333".

## Módulos

Infraestrutura: `PrismaModule` (global) — único acesso ao PostgreSQL.

| Módulo | Domínio | O que implementa |

| **Academic** | Curso, matéria, turma e matrícula | `courses` e `subjects`. Turmas (`classes`): criar com `joinCode` para permitir o acesso, professor na turma (`TeacherAssignment`). Aluno entra com código **ou** é incluído pelo professor (`StudentAssignment`). Sair / remover **não apaga** o usuário: preenche `endedAt`. Membros atuais e usuários padrões = `endedAt` nulo. Admin atribui professor à turma.

| **Users** | Conta e roles (`ADMIN`, `TEACHER`, `STUDENT`) | Listar usuários (ex.: aluno para incluir na turma). Cadastro público **só aluno e professor**.

| **Exams** | Questão, prova, sessão, correção e relatório | Banco de questões (`bodyHtml`, imagens, alternativas). Montar prova: prazo de entrega e de liberação ao aluno, atribuir a turma com ExamAssignment. Aluno inicia só se estiver na turma, prova como PUBLISHED e dentro do prazo. Eventos de monitoramento durante a sessão. Objetiva no gabarito, dissertativa com nota do professor e feedback. Nota = `targetScore * soma(aproveitamento × peso) / soma(pesos)`. Relatório da turma (acertos, erros, em branco, dificuldade) e desempenho do próprio aluno.

| **Auth** | Identidade e autenticação | Login JWT, /me, termos, reset de senha.

## Banco de dados (Docker + Prisma)

O Prisma e o Nest rodam na sua máquina e conectam em `localhost:5432` (porta publicada pelo compose do docker).

Credenciais (iguais ao `docker-compose.yml` e ao `.env` _**em caso de estar em PRD**_):

- usuário `educacao` / senha `educacao` / banco `educacao_provas`
- `DATABASE_URL="postgresql://educacao:educacao@localhost:5432/educacao_provas?schema=public"`

### Subir o banco

```bash
npm run db:up
```

Container: `pfc-postgres`. Se a porta 5432 estiver ocupada, altere o mapeamento no compose (ex.: `"5433:5432"`) e a porta no `.env`.

### Migrations (criar/atualizar tabelas)

Altere os models em `prisma/schema.prisma`. Depois:

```bash
npm run prisma:migrate:dev
```

Cria o SQL em `prisma/migrations/`, aplica no Postgres do Docker. Em ambiente já publicado: `npm run prisma:migrate:deploy`.

Client após mudança de schema para atualização dos comandos: `npm run prisma:generate`.

Reset _**local**_ (apaga dados e reaplica migrations): `npm run prisma:reset`.

### Processo

```bash
.env
npm install
npm run db:up
npm run prisma:migrate:dev
npm run start:dev
```

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
