#!/usr/bin/env node
/**
 * Teste de carga - fluxo de prova (aluno).
 *
 * Simula N alunos em paralelo: login → abrir prova → eventos aleatórios → entregar.
 * Cada linha em STUDENTS_FILE precisa ser um aluno distinto (a prova só aceita uma entrega por aluno).
 *
 * Uso:
 *   node scripts/load-test/exam-load.mjs --students scripts/load-test/students.json --classId xxx --examId yyy
 *   node scripts/load-test/exam-load.mjs --mode=stress
 *
 * Variáveis de ambiente (alternativa aos flags):
 *   LOAD_TEST_BASE_URL, LOAD_TEST_CLASS_ID, LOAD_TEST_EXAM_ID, LOAD_TEST_STUDENTS_FILE,
 *   LOAD_TEST_CONCURRENCY, LOAD_TEST_SCENARIO, LOAD_TEST_REPORT,
 *   LOAD_TEST_EVENTS, LOAD_TEST_EVENTS_MIN, LOAD_TEST_EVENTS_MAX,
 *   LOAD_TEST_MODE, LOAD_TEST_STAGES, LOAD_TEST_MAX_P95_MS, LOAD_TEST_MAX_ERROR_RATE
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { cpus, freemem, totalmem } from 'node:os';

const EXAM_EVENT_TYPES = [
  'PASTE',
  'COPY',
  'CUT',
  'TAB_SWITCH',
  'WINDOW_BLUR',
  'CONTEXT_MENU',
];
import { resolve, dirname, isAbsolute } from 'node:path';
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

function parseStages(value) {
  return String(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
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
    durationSec: Number(process.env.LOAD_TEST_DURATION_SEC ?? '0'),
    sendEvents: parseBool(
      process.env.LOAD_TEST_EVENTS,
      scenario !== 'login',
    ),
    eventsMin: Number(process.env.LOAD_TEST_EVENTS_MIN ?? '2'),
    eventsMax: Number(process.env.LOAD_TEST_EVENTS_MAX ?? '8'),
    mode: process.env.LOAD_TEST_MODE ?? 'exam',
    stages: parseStages(
      process.env.LOAD_TEST_STAGES ?? '50,100,200,300,500,750,1000',
    ),
    maxP95Ms: Number(process.env.LOAD_TEST_MAX_P95_MS ?? '10000'),
    maxErrorRate: Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? '5'),
    cooldownMs: Number(process.env.LOAD_TEST_COOLDOWN_MS ?? '5000'),
    timeoutMs: Number(process.env.LOAD_TEST_TIMEOUT_MS ?? '30000'),
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
    else if (arg.startsWith('--duration-sec='))
      out.durationSec = Number(arg.slice('--duration-sec='.length));
    else if (arg === '--no-events') out.sendEvents = false;
    else if (arg.startsWith('--events='))
      out.sendEvents = parseBool(arg.slice('--events='.length), true);
    else if (arg.startsWith('--events-min='))
      out.eventsMin = Number(arg.slice('--events-min='.length));
    else if (arg.startsWith('--events-max='))
      out.eventsMax = Number(arg.slice('--events-max='.length));
    else if (arg.startsWith('--mode='))
      out.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--stages='))
      out.stages = parseStages(arg.slice('--stages='.length));
    else if (arg.startsWith('--max-p95-ms='))
      out.maxP95Ms = Number(arg.slice('--max-p95-ms='.length));
    else if (arg.startsWith('--max-error-rate='))
      out.maxErrorRate = Number(arg.slice('--max-error-rate='.length));
    else if (arg.startsWith('--cooldown-ms='))
      out.cooldownMs = Number(arg.slice('--cooldown-ms='.length));
    else if (arg.startsWith('--timeout-ms='))
      out.timeoutMs = Number(arg.slice('--timeout-ms='.length));
  }

  if (!isAbsolute(out.studentsFile)) {
    out.studentsFile = resolve(process.cwd(), out.studentsFile);
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
  --duration-sec=0            > 0 = teste sustentado: cada aluno entra uma vez, fica abrindo a
                              prova e enviando eventos por esse tempo e entrega no final
  --no-events                 não envia POST examEvents
  --events-min=2 --events-max=8   quantidade aleatória por aluno
  --dry-run                   só valida arquivo de alunos e config

Modo limite (stress):
  --mode=exam|stress          exam = uma rodada com --concurrency alunos (padrão)
                              stress = rodadas crescentes até o sistema ficar lento
  --stages=50,100,200,300,500,750,1000   alunos simultâneos em cada rodada
  --max-p95-ms=3000           para quando o p95 de alguma etapa passar disso
  --max-error-rate=5          para quando a taxa de erro (%) passar disso
  --cooldown-ms=5000          pausa entre rodadas
  --timeout-ms=30000          requisição acima disso conta como erro

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

let requestTimeoutMs = 30000;

async function requestJson(baseUrl, path, options = {}) {
  const started = performance.now();
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(requestTimeoutMs),
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

async function sendRandomExamEvents(config, headers, examPayload, record) {
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
          headers,
          body: JSON.stringify({ event }),
        },
      ),
    );
    if (result.ok) ok += 1;
    else failed += 1;
  }

  return { planned: plan.length, ok, failed };
}

function makeRecorder(steps) {
  return (name, result) => {
    steps.push({
      name,
      ok: result.ok,
      status: result.status,
      ms: Math.round(result.ms * 100) / 100,
      at: performance.now(),
      error: result.error,
    });
    return result;
  };
}

async function runSustainedStudent(config, student, index, endAt) {
  const steps = [];
  const record = makeRecorder(steps);
  const fail = (error) => ({ index, email: student.email, ok: false, steps, error });

  const login = record(
    'login',
    await requestJson(config.baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: student.email, password: student.password }),
    }),
  );
  if (!login.ok || !login.data?.accessToken) {
    return fail(login.error ?? 'Login sem accessToken');
  }
  const headers = { Authorization: `Bearer ${login.data.accessToken}` };
  const eventStats = { planned: 0, ok: 0, failed: 0 };
  let lastExam = null;
  let iterations = 0;

  while (performance.now() < endAt) {
    const open = record(
      'openExam',
      await requestJson(
        config.baseUrl,
        `/classes-exams/${config.classId}/exams/${config.examId}`,
        { headers },
      ),
    );
    if (!open.ok) return fail(open.error ?? 'Falha ao abrir prova');
    if (open.data?.available === false) {
      return fail(open.data?.message ?? 'Prova indisponível');
    }
    lastExam = open.data;
    const stats = await sendRandomExamEvents(config, headers, open.data, record);
    eventStats.planned += stats.planned;
    eventStats.ok += stats.ok;
    eventStats.failed += stats.failed;
    iterations += 1;
    if (config.thinkMs > 0) await sleep(config.thinkMs);
  }

  if (config.scenario !== 'full' || !lastExam) {
    return { index, email: student.email, ok: true, steps, eventStats, iterations };
  }

  const submit = record(
    'submitExam',
    await requestJson(
      config.baseUrl,
      `/classes-exams/${config.classId}/exams/${config.examId}/submit`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ answers: buildAnswers(lastExam) }),
      },
    ),
  );
  if (!submit.ok) return fail(submit.error ?? 'Falha ao entregar prova');

  return { index, email: student.email, ok: true, steps, eventStats, iterations };
}

async function runStudentFlow(config, student, index) {
  const steps = [];
  const record = makeRecorder(steps);

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
  const authHeaders = { Authorization: `Bearer ${token}` };

  if (config.scenario === 'login') {
    return { index, email: student.email, ok: true, steps };
  }

  const open = record(
    'openExam',
    await requestJson(
      config.baseUrl,
      `/classes-exams/${config.classId}/exams/${config.examId}`,
      { headers: authHeaders },
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
    authHeaders,
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
        headers: authHeaders,
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

function percentile(sorted, pct) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1)];
}

function summarizeEndToEnd(flows) {
  const totals = flows
    .filter((f) => f.ok)
    .map((f) => f.steps.reduce((s, step) => s + step.ms, 0))
    .sort((a, b) => a - b);
  if (!totals.length) return summarizeStep('__none__', []);
  const sum = totals.reduce((a, b) => a + b, 0);
  return {
    count: totals.length,
    avg: Math.round((sum / totals.length) * 100) / 100,
    p50: Math.round(percentile(totals, 50)),
    p95: Math.round(percentile(totals, 95)),
    max: Math.round(totals[totals.length - 1]),
  };
}

function summarizeRun(flows, durationMs) {
  const okFlows = flows.filter((f) => f.ok);
  const steps = flows.flatMap((f) => f.steps);
  const httpRequests = steps.length;
  const httpErrors = steps.filter((s) => !s.ok).length;
  const durationSec = durationMs / 1000;
  const rps = durationSec > 0 ? httpRequests / durationSec : 0;
  const statusCount = {};
  for (const step of steps) {
    const key = step.status === 0 ? 'timeout/rede' : String(step.status);
    statusCount[key] = (statusCount[key] ?? 0) + 1;
  }
  const stats = flows.map((f) => f.eventStats).filter(Boolean);

  return {
    durationSec: Math.round(durationSec * 100) / 100,
    examEvents: {
      planned: stats.reduce((n, s) => n + (s.planned ?? 0), 0),
      ok: stats.reduce((n, s) => n + (s.ok ?? 0), 0),
      failed: stats.reduce((n, s) => n + (s.failed ?? 0), 0),
    },
    throughput: {
      httpRequests,
      httpErrors,
      httpErrorRatePercent:
        httpRequests > 0 ? Math.round((httpErrors / httpRequests) * 10000) / 100 : 0,
      requestsPerSecond: Math.round(rps * 100) / 100,
      requestsPerMinute: Math.round(rps * 60 * 100) / 100,
      successfulRequestsPerSecond:
        durationSec > 0
          ? Math.round(((httpRequests - httpErrors) / durationSec) * 100) / 100
          : 0,
      statusCount,
    },
    outcomes: {
      success: okFlows.length,
      failed: flows.length - okFlows.length,
      successRatePercent:
        flows.length > 0 ? Math.round((okFlows.length / flows.length) * 10000) / 100 : 0,
    },
    latencyMs: {
      login: summarizeStep('login', flows),
      openExam: summarizeStep('openExam', flows),
      examEvent: summarizeStep('examEvent', flows),
      submitExam: summarizeStep('submitExam', flows),
      endToEnd: summarizeEndToEnd(flows),
    },
  };
}

function cpuSnapshot() {
  return cpus().reduce(
    (acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return { idle: acc.idle + cpu.times.idle, total: acc.total + total };
    },
    { idle: 0, total: 0 },
  );
}

function startMachineMonitor() {
  const samples = [];
  let memoryPeak = 0;
  let last = cpuSnapshot();
  const timer = setInterval(() => {
    const current = cpuSnapshot();
    const total = current.total - last.total;
    if (total > 0) {
      samples.push(100 - ((current.idle - last.idle) / total) * 100);
    }
    last = current;
    memoryPeak = Math.max(memoryPeak, (1 - freemem() / totalmem()) * 100);
  }, 500);

  return () => {
    clearInterval(timer);
    const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    return {
      cpuAvgPercent: avg === null ? null : Math.round(avg),
      cpuPeakPercent: samples.length ? Math.round(Math.max(...samples)) : null,
      memoryPeakPercent: Math.round(memoryPeak),
      cores: cpus().length,
    };
  };
}

function worstP95(summary) {
  return Math.max(
    ...Object.entries(summary.latencyMs)
      .filter(([name]) => name !== 'endToEnd')
      .map(([, step]) => step.p95 ?? 0),
  );
}

function buildTimeline(flows, t0, bucketSec, totalSec) {
  const buckets = new Map();
  for (const step of flows.flatMap((f) => f.steps)) {
    const key = Math.floor((step.at - t0) / 1000 / bucketSec);
    const bucket = buckets.get(key) ?? { requests: 0, errors: 0, ms: [] };
    bucket.requests += 1;
    if (!step.ok) bucket.errors += 1;
    bucket.ms.push(step.ms);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, bucket]) => {
      const sorted = bucket.ms.sort((a, b) => a - b);
      const fromSec = key * bucketSec;
      const toSec = Math.min((key + 1) * bucketSec, Math.max(totalSec, fromSec + 1));
      return {
        fromSec,
        toSec: Math.round(toSec * 10) / 10,
        requests: bucket.requests,
        errors: bucket.errors,
        requestsPerSecond:
          Math.round((bucket.requests / (toSec - fromSec)) * 100) / 100,
        p50Ms: Math.round(percentile(sorted, 50)),
        p95Ms: Math.round(percentile(sorted, 95)),
      };
    });
}

async function runSustainedRound(config, roster) {
  const stopMonitor = startMachineMonitor();
  const t0 = performance.now();
  const endAt = t0 + config.durationSec * 1000;
  const flows = await Promise.all(
    roster.map((student, index) =>
      runSustainedStudent(config, student, index, endAt),
    ),
  );
  const durationMs = performance.now() - t0;
  return {
    flows,
    summary: summarizeRun(flows, durationMs),
    machine: stopMonitor(),
    timeline: buildTimeline(flows, t0, 10, durationMs / 1000),
  };
}

async function runRound(config, roster, offset) {
  const stopMonitor = startMachineMonitor();
  const t0 = performance.now();
  const flows = await runPool(roster, roster.length, (student, index) =>
    runStudentFlow(config, student, offset + index),
  );
  const durationMs = performance.now() - t0;
  return {
    flows,
    summary: summarizeRun(flows, durationMs),
    machine: stopMonitor(),
    timeline: buildTimeline(flows, t0, 1, durationMs / 1000),
  };
}

function printFailures(flows) {
  const failed = flows.filter((f) => !f.ok);
  if (!failed.length) return;
  console.log('\nPrimeiras falhas:');
  for (const f of failed.slice(0, 5)) {
    console.log(`  - ${f.email}: ${String(f.error).slice(0, 200)}`);
  }
}

async function runExamMode(config, students) {
  const roster = students.slice(0, Math.min(config.concurrency, students.length));

  if (students.length < config.concurrency) {
    console.warn(
      `[aviso] concurrency=${config.concurrency}, mas só há ${students.length} alunos no JSON. ` +
        `Serão executados ${roster.length} fluxos em paralelo.`,
    );
  }

  const sustained = config.durationSec > 0;
  console.log(
    `Iniciando teste${sustained ? ` sustentado de ${config.durationSec}s` : ''}: ${roster.length} alunos em paralelo | cenário=${config.scenario} | eventos=${config.sendEvents ? `${config.eventsMin}-${config.eventsMax}/abertura` : 'off'} | ${config.baseUrl}`,
  );

  const startedAt = new Date();
  const { flows, summary, machine, timeline } = sustained
    ? await runSustainedRound(config, roster)
    : await runRound(config, roster, 0);
  const deliveries = flows.filter((f) =>
    f.steps.some((step) => step.name === 'submitExam' && step.ok),
  ).length;

  const report = {
    meta: {
      tool: 'exam-load.mjs',
      mode: sustained ? 'sustained' : 'exam',
      durationSecRequested: sustained ? config.durationSec : null,
      thinkMs: config.thinkMs,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
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
    ...summary,
    deliveries,
    openExamPerStudent: sustained
      ? Math.round(
          (flows.reduce((n, f) => n + (f.iterations ?? 0), 0) / flows.length) * 10,
        ) / 10
      : 1,
    machine,
    timeline,
    failures: flows
      .filter((f) => !f.ok)
      .slice(0, 20)
      .map((f) => ({
        email: f.email,
        error: f.error,
        steps: f.steps.filter((step) => !step.ok).slice(0, 5),
      })),
  };

  mkdirSync(dirname(config.report), { recursive: true });
  writeFileSync(config.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n--- Resultado ---');
  console.log(`Sucesso: ${summary.outcomes.success}/${flows.length} | provas entregues: ${deliveries}`);
  if (sustained) {
    console.log('\nJanela      req/s   p50     p95     erros');
    for (const window of timeline) {
      console.log(
        `${String(window.fromSec).padStart(4)}-${String(window.toSec).padEnd(5)}s ${String(window.requestsPerSecond).padStart(7)} ${String(window.p50Ms).padStart(5)}ms ${String(window.p95Ms).padStart(5)}ms ${String(window.errors).padStart(6)}`,
      );
    }
    console.log('');
  }
  console.log(
    `Requisições HTTP: ${summary.throughput.httpRequests} (~${summary.throughput.requestsPerSecond} req/s, ~${summary.throughput.requestsPerMinute} req/min)`,
  );
  if (summary.examEvents.planned > 0) {
    console.log(
      `Eventos de prova: ${summary.examEvents.ok}/${summary.examEvents.planned} ok (${summary.examEvents.failed} falhas)`,
    );
  }
  if (!sustained) {
    console.log(
      `Latência fim-a-fim (ok): p50=${summary.latencyMs.endToEnd.p50}ms p95=${summary.latencyMs.endToEnd.p95}ms`,
    );
  }
  console.log(
    `CPU da máquina: média ${machine.cpuAvgPercent}% | pico ${machine.cpuPeakPercent}% | memória pico ${machine.memoryPeakPercent}%`,
  );
  console.log(`Relatório salvo em: ${config.report}`);

  printFailures(flows);
  if (summary.outcomes.failed > 0) process.exitCode = 1;
}

async function runStressMode(config, students) {
  console.log(
    `Teste de limite: rodadas ${config.stages.join(', ')} | para com p95 > ${config.maxP95Ms}ms ou erro > ${config.maxErrorRate}% | ${config.baseUrl}`,
  );

  const startedAt = new Date();
  const stages = [];
  let offset = 0;
  let stopReason = 'todas as rodadas concluídas';

  for (const size of config.stages) {
    if (offset + size > students.length) {
      stopReason = `alunos insuficientes para a rodada de ${size} (restam ${students.length - offset}). Rode o setup com mais --students.`;
      break;
    }

    const roster = students.slice(offset, offset + size);
    const { flows, summary, machine } = await runRound(config, roster, offset);
    offset += size;

    const p95 = worstP95(summary);
    const errorRate = summary.throughput.httpErrorRatePercent;
    const healthy = p95 <= config.maxP95Ms && errorRate <= config.maxErrorRate;
    stages.push({
      concurrentStudents: size,
      healthy,
      worstStepP95Ms: Math.round(p95),
      ...summary,
      machine,
      sampleFailures: flows
        .filter((f) => !f.ok)
        .slice(0, 5)
        .map((f) => ({ email: f.email, error: String(f.error).slice(0, 300) })),
    });

    console.log(
      `[${healthy ? 'ok' : 'LENTO'}] ${String(size).padStart(5)} alunos | ${summary.throughput.requestsPerSecond} req/s | p95 pior etapa ${Math.round(p95)}ms | erros ${errorRate}% | login p95 ${summary.latencyMs.login.p95 ?? '-'}ms | entrega p95 ${summary.latencyMs.submitExam.p95 ?? '-'}ms | CPU ${machine.cpuAvgPercent}% (pico ${machine.cpuPeakPercent}%)`,
    );

    if (!healthy) {
      stopReason =
        errorRate > config.maxErrorRate
          ? `taxa de erro ${errorRate}% acima de ${config.maxErrorRate}% com ${size} alunos`
          : `p95 de ${Math.round(p95)}ms acima de ${config.maxP95Ms}ms com ${size} alunos`;
      break;
    }

    if (config.cooldownMs > 0) await sleep(config.cooldownMs);
  }

  const lastHealthy = [...stages].reverse().find((stage) => stage.healthy) ?? null;
  const peak = stages.reduce(
    (best, stage) =>
      stage.throughput.successfulRequestsPerSecond >
      (best?.throughput.successfulRequestsPerSecond ?? 0)
        ? stage
        : best,
    null,
  );

  const report = {
    meta: {
      tool: 'exam-load.mjs',
      mode: 'stress',
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      classId: config.classId,
      examId: config.examId,
      scenario: config.scenario,
      stagesRequested: config.stages,
      thresholds: { maxP95Ms: config.maxP95Ms, maxErrorRatePercent: config.maxErrorRate },
      studentsAvailable: students.length,
      studentsUsed: offset,
    },
    conclusion: {
      stopReason,
      maxHealthyConcurrentStudents: lastHealthy?.concurrentStudents ?? 0,
      requestsPerSecondAtMaxHealthy: lastHealthy?.throughput.requestsPerSecond ?? 0,
      peakSuccessfulRequestsPerSecond:
        peak?.throughput.successfulRequestsPerSecond ?? 0,
      peakAtConcurrentStudents: peak?.concurrentStudents ?? 0,
    },
    stages,
  };

  mkdirSync(dirname(config.report), { recursive: true });
  writeFileSync(config.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('\n--- Conclusão ---');
  console.log(`Parada: ${stopReason}`);
  console.log(
    `Maior rodada saudável: ${report.conclusion.maxHealthyConcurrentStudents} alunos simultâneos (~${report.conclusion.requestsPerSecondAtMaxHealthy} req/s)`,
  );
  console.log(
    `Pico de vazão (requisições com sucesso): ~${report.conclusion.peakSuccessfulRequestsPerSecond} req/s com ${report.conclusion.peakAtConcurrentStudents} alunos`,
  );
  console.log(`Relatório salvo em: ${config.report}`);
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

  if (!['exam', 'stress'].includes(config.mode)) {
    console.error('Use --mode=exam ou --mode=stress.');
    process.exit(1);
  }

  requestTimeoutMs = config.timeoutMs;
  const students = loadStudents(config.studentsFile);

  if (config.dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          mode: config.mode,
          baseUrl: config.baseUrl,
          classId: config.classId,
          examId: config.examId,
          scenario: config.scenario,
          sendEvents: config.sendEvents,
          eventsMin: config.eventsMin,
          eventsMax: config.eventsMax,
          studentsLoaded: students.length,
          willRun:
            config.mode === 'stress'
              ? config.stages
              : Math.min(config.concurrency, students.length),
          studentsNeededForAllStages:
            config.mode === 'stress'
              ? config.stages.reduce((a, b) => a + b, 0)
              : undefined,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const run = config.mode === 'stress' ? runStressMode : runExamMode;
  run(config, students).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

main();
