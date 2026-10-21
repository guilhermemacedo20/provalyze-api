# Teste de carga - fluxo de prova

Script para simular vários alunos fazendo prova ao mesmo tempo e gerar métricas (req/s, req/min, latência) como evidência de desempenho no PFC.

## O que é medido

Cada **aluno virtual** executa, em sequência:

1. `POST /api/auth/login`
2. `GET /api/classes-exams/:classId/exams/:examId` (abre/inicia sessão)
3. Vários `POST .../examEvents` (tipos aleatórios: colar, copiar, trocar aba, etc.)
4. `POST /api/classes-exams/:classId/exams/:examId/submit` (entrega com respostas automáticas e genêricas)

## Pré-requisitos

1. API rodando (ex.: `npm run start:dev` na porta 3333) ou endereço do backend.
2. Prova **publicada**, atribuída à turma, **dentro do prazo** (`startsAt` / `endsAt`).
3. Arquivo JSON com **um aluno por linha**, onde a mesma prova só aceita **uma entrega por aluno**.
4. Para repetir o teste na mesma prova: usar outra prova ou limpar `ExamSession` / `Answer` dessa prova no banco.

## Preparar lista de alunos

Copie o exemplo e preencha com contas reais da turma

Formato:

```json
[
  { "email": "aluno1@...", "password": "..." },
  { "email": "aluno2@...", "password": "..." }
]
```

**Não commite** `students.json` com senhas reais.

## Executar

Na raiz do projeto rode:

```powershell
npm run load-test:exam -- `
  --students=scripts/load-test/students.json `
  --classId=ID_DA_TURMA_SI `
  --examId=ID_DA_PROVA_M2 `
  --concurrency=100
```

Validar configuração sem chamar a API:

```powershell
npm run load-test:exam -- --dry-run --classId=xxx --examId=yyy --students=scripts/load-test/students.json
```

### Cenários

| `--scenario` | Comportamento |
|--------------|----------------|
| `full` (padrão) | login + abrir + entregar |
| `open` | login + abrir prova (carga de leitura/sessão) |
| `login` | só login (carga mínima na autenticação) |

Simular tempo entre abrir e entregar:

```powershell
npm run load-test:exam -- ... --think-ms=30000
```

### Variáveis de ambiente

| Variável | Equivalente |
|----------|-------------|
| `LOAD_TEST_BASE_URL` | `--base-url` |
| `LOAD_TEST_CLASS_ID` | `--classId` |
| `LOAD_TEST_EXAM_ID` | `--examId` |
| `LOAD_TEST_STUDENTS_FILE` | `--students` |
| `LOAD_TEST_CONCURRENCY` | `--concurrency` |
| `LOAD_TEST_SCENARIO` | `--scenario` |
| `LOAD_TEST_REPORT` | `--report` |
| `LOAD_TEST_EVENTS` | `--events=true/false` ou `--no-events` |
| `LOAD_TEST_EVENTS_MIN` / `LOAD_TEST_EVENTS_MAX` | `--events-min` / `--events-max` |

## Interpretação para a turma

- Use `--concurrency=50` (ou 100 com folga) e **50 entradas** no JSON.
- Para stress além da turma real, aumente alunos no JSON ou rode `open`/`login` com concorrência maior.

## Limitações

- Não substitui monitoramento de CPU/RAM/Postgres; recomenda-se observar logs e `docker stats` durante o teste.
- Questões dissertativas recebem texto fixo; correção por IA não é exercitada neste script.
- Eventos anti-cola são aleatórios (2–8 por aluno por padrão); desligue com `LOAD_TEST_EVENTS=false` ou `--no-events`.

---

### 1. Configurar variáveis (uma vez)

Edite `scripts/load-test/.env.load-test`:

| Variável | O que colocar |
|----------|----------------|
| `LOAD_TEST_BASE_URL` | URL da API em PRD **com** `/api` no final. Ex.: se o front usa `NEXT_PUBLIC_API_URL=https://provalyze.seudominio.com/api`, use exatamente isso. |
| `LOAD_TEST_CLASS_ID` | ID da turma (abaixo). |
| `LOAD_TEST_EXAM_ID` | ID da prova (abaixo). |
| `LOAD_TEST_CONCURRENCY` | `number` para a turma inteira, ou `100` se tiver 100 alunos no JSON. |

O `exam-load.mjs` lê `.env.load-test` automaticamente; não precisa exportar variável no PowerShell, a menos que queira sobrescrever algo pontual:

```powershell
$env:LOAD_TEST_BASE_URL = "https://sua-api/api"
npm run load-test:exam
```

### 2. Executar o teste contra PRD

Use uma **prova dedicada ao teste de carga**, porque cada aluno só entrega **uma vez**.

```powershell
cd pfc-api
npm run load-test:exam
```

Métricas em `scripts/load-test/last-report.json`.

### 3. Repetir o teste

- Duplicar a prova no site **ou** limpar sessões/respostas dessa prova no banco de PRD/homolog.
