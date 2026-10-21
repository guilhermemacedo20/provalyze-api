#!/usr/bin/env node
/**
 * Teste de carga - fluxo de prova (aluno).
 *
 * Simula N alunos em paralelo: login → abrir prova → eventos aleatórios → entregar.
 * Cada linha em STUDENTS_FILE precisa ser um aluno distinto (a prova só aceita uma entrega por aluno).
 *
 * Uso:
 *   node scripts/load-test/exam-load.mjs --students scripts/load-test/students.json --classId xxx --examId yyy
 *
 * Variáveis de ambiente (alternativa aos flags):
 *   LOAD_TEST_BASE_URL, LOAD_TEST_CLASS_ID, LOAD_TEST_EXAM_ID, LOAD_TEST_STUDENTS_FILE,
 *   LOAD_TEST_CONCURRENCY, LOAD_TEST_SCENARIO, LOAD_TEST_REPORT,
 *   LOAD_TEST_EVENTS, LOAD_TEST_EVENTS_MIN, LOAD_TEST_EVENTS_MAX
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const EXAM_EVENT_TYPES = [
  'PASTE',
  'COPY',
  'CUT',
  'TAB_SWITCH',
  'WINDOW_BLUR',
  'CONTEXT_MENU',
];
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const path = resolve(__dirname, '.env.load-test');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

function parseBool(value, defaultValue) {
  if (value === undefined || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return true;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function parseArgs(argv) {
  const scenario = process.env.LOAD_TEST_SCENARIO ?? 'full';
  const out = {
    baseUrl: process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:3333/api',
    classId: process.env.LOAD_TEST_CLASS_ID ?? '',
    examId: process.env.LOAD_TEST_EXAM_ID ?? '',
    studentsFile:
      process.env.LOAD_TEST_STUDENTS_FILE ??
      resolve(__dirname, 'students.example.json'),
    concurrency: Number(process.env.LOAD_TEST_CONCURRENCY ?? '100'),
    scenario,
    report:
      process.env.LOAD_TEST_REPORT ??
      resolve(__dirname, 'last-report.json'),
    thinkMs: Number(process.env.LOAD_TEST_THINK_MS ?? '0'),
    sendEvents: parseBool(
      process.env.LOAD_TEST_EVENTS,
      scenario !== 'login',
    ),
    eventsMin: Number(process.env.LOAD_TEST_EVENTS_MIN ?? '2'),
    eventsMax: Number(process.env.LOAD_TEST_EVENTS_MAX ?? '8'),
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--base-url='))
      out.baseUrl = arg.slice('--base-url='.length);
    else if (arg.startsWith('--classId='))
      out.classId = arg.slice('--classId='.length);
    else if (arg.startsWith('--examId='))
      out.examId = arg.slice('--examId='.length);
    else if (arg.startsWith('--students='))
      out.studentsFile = resolve(arg.slice('--students='.length));
    else if (arg.startsWith('--concurrency='))
      out.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg.startsWith('--scenario='))
      out.scenario = arg.slice('--scenario='.length);
    else if (arg.startsWith('--report='))
      out.report = resolve(arg.slice('--report='.length));
    else if (arg.startsWith('--think-ms='))
      out.thinkMs = Number(arg.slice('--think-ms='.length));
    else if (arg === '--no-events') out.sendEvents = false;
    else if (arg.startsWith('--events='))
      out.sendEvents = parseBool(arg.slice('--events='.length), true);
    else if (arg.startsWith('--events-min='))
      out.eventsMin = Number(arg.slice('--events-min='.length));
    else if (arg.startsWith('--events-max='))
      out.eventsMax = Number(arg.slice('--events-max='.length));
  }

  if (out.eventsMin > out.eventsMax) {
    const swap = out.eventsMin;
    out.eventsMin = out.eventsMax;
    out.eventsMax = swap;
  }

  return out;
}

function printHelp() {
  console.log(`
Teste de carga - Provalyze (fluxo de prova)

Flags:
  --base-url=http://localhost:3333/api
  --classId=<id da turma>
  --examId=<id da prova publicada e dentro do prazo>
  --students=<caminho.json>   array [{ "email", "password" }, ...]
  --concurrency=100           quantos fluxos simultâneos
  --scenario=full|open|login  full = login+abrir+eventos+entregar (padrão)
  --report=<caminho.json>     salva métricas para evidência
  --think-ms=0                pausa entre abrir e entregar (simula tempo de prova)
  --no-events                 não envia POST examEvents
  --events-min=2 --events-max=8   quantidade aleatória por aluno
  --dry-run                   só valida arquivo de alunos e config

Requisitos:
  - API no ar (ex.: npm run start:dev)
  - Prova PUBLICADA, atribuída à turma, dentro do prazo
  - Um aluno por entrada no JSON (entrega duplicada falha)
  - Para repetir o teste na mesma prova, resetar sessões/respostas no banco ou usar outra prova
`);
}

function loadStudents(path) {
  if (!existsSync(path)) {
    throw new Error(`Arquivo de alunos não encontrado: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('STUDENTS_FILE deve ser um JSON array não vazio');
  }
  for (const row of list) {
    if (!row?.email || !row?.password) {
      throw new Error('Cada aluno precisa de email e password');
    }
  }
  return list;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestJson(baseUrl, path, options = {}) {
  const started = performance.now();
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }

  const ms = performance.now() - started;
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    ms,
    error: response.ok ? null : typeof data === 'string' ? data : JSON.stringify(data),
    data,
  };
}

function buildAnswers(examPayload) {
  const questions = examPayload?.questions;
  if (!Array.isArray(questions)) {
    throw new Error('Resposta de abrir prova sem questions (prova indisponível?)');
  }

  return questions.map((question) => {
    if (question.type === 'MULTIPLE_CHOICE') {
      const option = question.options?.[0];
      if (!option?.id) {
        throw new Error(`Questão ${question.id} sem alternativas`);
      }
      return { examQuestionId: question.id, optionId: option.id };
    }
    return {
      examQuestionId: question.id,
      content: 'Resposta automática - teste de carga.',
    };
  });
}

function buildRandomEventPlan(questions, min, max) {
  if (!questions.length) return [];

  const target = randomInt(min, max);
  const plan = [];
  const used = new Set();

  for (let attempt = 0; attempt < target * 4 && plan.length < target; attempt += 1) {
    const question = pickRandom(questions);
    const type = pickRandom(EXAM_EVENT_TYPES);
    const key = `${question.id}:${type}`;
    if (used.has(key)) continue;
    used.add(key);
    plan.push({ examQuestionId: question.id, type });
  }

  return plan;
}

async function sendRandomExamEvents(config, token, examPayload, record) {
  const questions = examPayload?.questions ?? [];
  if (!config.sendEvents || questions.length === 0) {
    return { planned: 0, ok: 0, failed: 0 };
  }

  const plan = buildRandomEventPlan(
    questions,
    config.eventsMin,
    config.eventsMax,
  );
  let ok = 0;
  let failed = 0;

  for (const event of plan) {
    const result = record(
      'examEvent',
      await requestJson(
        config.baseUrl,
        `/classes-exams/${config.classId}/exams/${config.examId}/examEvents`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event }),
        },
      ),
    );
    if (result.ok) ok += 1;
    else failed += 1;
  }

  return { planned: plan.length, ok, failed };
}

async function runStudentFlow(config, student, index) {
  const steps = [];
  const record = (name, result) => {
    steps.push({
      name,
      ok: result.ok,
      status: result.status,
      ms: Math.round(result.ms * 100) / 100,
      error: result.error,
    });
    return result;
  };

  const login = record(
    'login',
    await requestJson(config.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: student.email,
        password: student.password,
      }),
    }),
  );

  if (!login.ok || !login.data?.accessToken) {
    return {
      index,
      email: student.email,
      ok: false,
      steps,
      error: login.error ?? 'Login sem accessToken',
    };
  }

  const token = login.data.accessToken;

  if (config.scenario === 'login') {
    return { index, email: student.email, ok: true, steps };
  }

  const open = record(
    'openExam',
    await requestJson(
      config.baseUrl,
      `/classes-exams/${config.classId}/exams/${config.examId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  );

  if (!open.ok) {
    return {
      index,
      email: student.email,
      ok: false,
      steps,
      error: open.error ?? 'Falha ao abrir prova',
    };
  }

  if (open.data?.available === false) {
    return {
      index,
      email: student.email,
      ok: false,
      steps,
      error: open.data?.message ?? 'Prova indisponível',
    };
  }

  const eventStats = await sendRandomExamEvents(
    config,
    token,
    open.data,
    record,
  );

  if (config.scenario === 'open') {
    return {
      index,
      email: student.email,
      ok: true,
      steps,
      eventStats,
    };
  }

  if (config.thinkMs > 0) {
    await sleep(config.thinkMs);
  }

  let answers;
  try {
    answers = buildAnswers(open.data);
  } catch (error) {
    return {
      index,
      email: student.email,
      ok: false,
      steps,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const submit = record(
    'submitExam',
    await requestJson(
      config.baseUrl,
      `/classes-exams/${config.classId}/exams/${config.examId}/submit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      },
    ),
  );

  if (!submit.ok) {
    return {
      index,
      email: student.email,
      ok: false,
      steps,
      error: submit.error ?? 'Falha ao entregar prova',
    };
  }

  return {
    index,
    email: student.email,
    ok: true,
    steps,
    score: submit.data?.score ?? null,
    eventStats,
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => runner()));
  return results;
}

function summarizeStep(stepName, flows) {
  const ms = flows
    .flatMap((f) => f.steps.filter((s) => s.name === stepName && s.ok))
    .map((s) => s.ms)
    .sort((a, b) => a - b);

  if (ms.length === 0) {
    return { count: 0, p50: null, p95: null, max: null, avg: null };
  }

  const sum = ms.reduce((a, b) => a + b, 0);
  const p = (pct) => ms[Math.min(ms.length - 1, Math.ceil((pct / 100) * ms.length) - 1)];

  return {
    count: ms.length,
    avg: Math.round((sum / ms.length) * 100) / 100,
    p50: p(50),
    p95: p(95),
    max: ms[ms.length - 1],
  };
}

function main() {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    process.exit(0);
  }

  if (!config.classId || !config.examId) {
    console.error('Informe --classId e --examId (ou LOAD_TEST_CLASS_ID / LOAD_TEST_EXAM_ID).');
    printHelp();
    process.exit(1);
  }

  const students = loadStudents(config.studentsFile);
  const virtualCount = Math.min(config.concurrency, students.length);
  const roster = students.slice(0, virtualCount);

  if (config.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          baseUrl: config.baseUrl,
          classId: config.classId,
          examId: config.examId,
          scenario: config.scenario,
          sendEvents: config.sendEvents,
          eventsMin: config.eventsMin,
          eventsMax: config.eventsMax,
          studentsLoaded: students.length,
          willRun: roster.length,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (students.length < config.concurrency) {
    console.warn(
      `[aviso] concurrency=${config.concurrency}, mas só há ${students.length} alunos no JSON. ` +
        `Serão executados ${roster.length} fluxos em paralelo.`,
    );
  }

  console.log(
    `Iniciando teste: ${roster.length} alunos em paralelo | cenário=${config.scenario} | eventos=${config.sendEvents ? `${config.eventsMin}-${config.eventsMax}/aluno` : 'off'} | ${config.baseUrl}`,
  );

  const startedAt = new Date();
  const t0 = performance.now();

  runPool(roster, config.concurrency, (student, index) =>
    runStudentFlow(config, student, index),
  )
    .then((flows) => {
      const durationMs = performance.now() - t0;
      const finishedAt = new Date();
      const okFlows = flows.filter((f) => f.ok);
      const failFlows = flows.filter((f) => !f.ok);

      const httpRequests = flows.reduce((acc, f) => acc + f.steps.length, 0);
      const durationSec = durationMs / 1000;
      const rps = durationSec > 0 ? httpRequests / durationSec : 0;
      const rpm = rps * 60;

      const report = {
        meta: {
          tool: 'exam-load.mjs',
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: Math.round(durationMs),
          durationSec: Math.round(durationSec * 100) / 100,
          baseUrl: config.baseUrl,
          classId: config.classId,
          examId: config.examId,
          scenario: config.scenario,
          concurrencyRequested: config.concurrency,
          studentsExecuted: roster.length,
          sendEvents: config.sendEvents,
          eventsPerStudent: config.sendEvents
            ? { min: config.eventsMin, max: config.eventsMax }
            : null,
        },
        examEvents: (() => {
          const stats = flows.map((f) => f.eventStats).filter(Boolean);
          const planned = stats.reduce((n, s) => n + (s.planned ?? 0), 0);
          const ok = stats.reduce((n, s) => n + (s.ok ?? 0), 0);
          const failed = stats.reduce((n, s) => n + (s.failed ?? 0), 0);
          return { planned, ok, failed };
        })(),
        throughput: {
          httpRequests,
          requestsPerSecond: Math.round(rps * 100) / 100,
          requestsPerMinute: Math.round(rpm * 100) / 100,
        },
        outcomes: {
          success: okFlows.length,
          failed: failFlows.length,
          successRatePercent:
            flows.length > 0
              ? Math.round((okFlows.length / flows.length) * 10000) / 100
              : 0,
        },
        latencyMs: {
          login: summarizeStep('login', flows),
          openExam: summarizeStep('openExam', flows),
          examEvent: summarizeStep('examEvent', flows),
          submitExam: summarizeStep('submitExam', flows),
          endToEnd: (() => {
            const totals = okFlows
              .map((f) => f.steps.reduce((s, step) => s + step.ms, 0))
              .sort((a, b) => a - b);
            if (!totals.length) return summarizeStep('__none__', []);
            const sum = totals.reduce((a, b) => a + b, 0);
            const p = (pct) =>
              totals[Math.min(totals.length - 1, Math.ceil((pct / 100) * totals.length) - 1)];
            return {
              count: totals.length,
              avg: Math.round((sum / totals.length) * 100) / 100,
              p50: p(50),
              p95: p(95),
              max: totals[totals.length - 1],
            };
          })(),
        },
        failures: failFlows.slice(0, 20).map((f) => ({
          email: f.email,
          error: f.error,
          steps: f.steps,
        })),
      };

      writeFileSync(config.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

      console.log('\n--- Resultado ---');
      console.log(`Sucesso: ${report.outcomes.success}/${flows.length}`);
      console.log(
        `Requisições HTTP: ${httpRequests} (~${report.throughput.requestsPerSecond} req/s, ~${report.throughput.requestsPerMinute} req/min)`,
      );
      if (report.examEvents.planned > 0) {
        console.log(
          `Eventos de prova: ${report.examEvents.ok}/${report.examEvents.planned} ok (${report.examEvents.failed} falhas)`,
        );
      }
      console.log(`Latência fim-a-fim (ok): p50=${report.latencyMs.endToEnd.p50}ms p95=${report.latencyMs.endToEnd.p95}ms`);
      console.log(`Relatório salvo em: ${config.report}`);

      if (failFlows.length > 0) {
        console.log('\nPrimeiras falhas:');
        for (const f of failFlows.slice(0, 5)) {
          console.log(`  - ${f.email}: ${f.error}`);
        }
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

main();
