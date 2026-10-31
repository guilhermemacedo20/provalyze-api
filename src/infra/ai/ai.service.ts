import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ANSWER_LENGTH = 500;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

const VALIDATE_ANSWER_PROMPT = `Você corrige uma resposta de prova.
Leia a questão e a resposta do aluno. Devolva apenas JSON com:
- suggestedScore: número de 0 até maxScore, com no máximo uma casa decimal
- justification: texto curto com no máximo 100 caracteres em português explicando a nota a partir do enunciado e da resposta,
distribua a nota pela aderência ao enunciado. Não invente conteúdo que o aluno não escreveu.`;

const ANALYSE_STUDENT_THEMES_PROMPT = `Escreva a análise pedagógica de um aluno.
Use apenas o desempenho por tema e as provas recebidas. Devolva apenas JSON com:
- difficulty: um parágrafo curto em português descrevendo as dificuldades a partir dos temas com menor porcentagem e orientando o que seria bom para o aluno estudar
- recommendation: um parágrafo curto em português com uma recomendação pedagógica objetiva com orientação de qual foco o aluno deve seguir
Não invente tema, nota ou prova que não esteja nos dados.`;

const ANALYSE_CLASS_THEMES_PROMPT = `Identifique lacunas pedagógicas da turma.
Compare cada resposta com o enunciado da questão. Use apenas os dados recebidos, não invente dados.
Devolva apenas JSON neste formato:
{"gaps":[{"theme":"Mantenha o mesmo nome do tema enviado","evidence":"parágrafo curto","suggestion":"parágrafo curto"}]}
Onde:
- evidence: o que as respostas mostram em relação ao enunciado, sem inventar fala do aluno
- suggestion: o que vale revisar com a turma e ensinar aos alunos.
Inclua só temas em que as respostas indicam dificuldade. Se não houver lacuna, devolva {"gaps":[]}, porém se não tiver uma sugestão ao tema retorne apenas o tema enviado
e na evidência identifique o que os alunos estão fazendo corretamente.`;

export type ClassGapQuestion = {
  examTitle: string;
  statement: string;
  points: number;
  targetScore: number;
  correctCount: number;
  answerCount: number;
  answers: { content: string; isCorrect: boolean; score: number }[];
};

export type ClassGapInput = {
  classIds: string[];
  themes: { name: string; questions: ClassGapQuestion[] }[];
};

export type ClassGap = {
  theme: string;
  evidence: string;
  suggestion: string;
};

export type StudentThemeAnalysis = {
  subjectName: string;
  themes: { name: string; percent: number }[];
  exams: {
    title: string;
    subjectName: string;
    finishedAt: Date | null;
    score: number | null;
  }[];
};

export type AnswerToScore = {
  content: string;
  sessionId: string;
  examQuestionId: string;
  examQuestion: {
    points: number;
    question: {
      statement: string;
      theme: { name: string };
    };
    exam: {
      targetScore: number;
      examQuestions: { points: number }[];
    };
  };
};

@Injectable()
export class AIService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async suggestAnswerScore(answer: AnswerToScore) {
    const examQuestion = answer.examQuestion;
    const totalPoints = examQuestion.exam.examQuestions.reduce(
      (total, item) => total + item.points,
      0,
    );
    const maxScore = this.weightedScore(
      examQuestion.points,
      totalPoints,
      examQuestion.exam.targetScore,
    );

    const clean = await this.answerCleaner({
      examAssignments: {
        some: { exam: { sessions: { some: { id: answer.sessionId } } } },
      },
    });

    const suggestion = await this.sendPrompt<{
      suggestedScore: number;
      justification: string;
    }>(
      VALIDATE_ANSWER_PROMPT,
      JSON.stringify({
        statement: examQuestion.question.statement,
        theme: examQuestion.question.theme.name,
        studentAnswer: clean(answer.content),
        maxScore,
      }),
      256,
    );

    if (!suggestion) {
      return null;
    }

    const suggestedScore = this.clampScore(suggestion.suggestedScore, maxScore);
    const justification = suggestion.justification?.trim() ?? '';

    await this.prisma.answer.update({
      where: {
        sessionId_examQuestionId: {
          sessionId: answer.sessionId,
          examQuestionId: answer.examQuestionId,
        },
      },
      data: {
        aiSuggestedScore: suggestedScore,
        aiJustification: justification,
      },
    });

    return { suggestedScore, justification, maxScore };
  }

  async analyzeStudentThemes(input: StudentThemeAnalysis) {
    const result = await this.sendPrompt<{
      difficulty: string;
      recommendation: string;
    }>(
      ANALYSE_STUDENT_THEMES_PROMPT,
      JSON.stringify({
        subjectName: input.subjectName,
        themes: input.themes,
        exams: input.exams,
      }),
      512,
    );

    const difficulty = result?.difficulty?.trim();
    const recommendation = result?.recommendation?.trim();

    if (!difficulty || !recommendation) {
      return null;
    }

    return { difficulty, recommendation };
  }

  async analyseClassTheme(input: ClassGapInput) {
    const clean = await this.answerCleaner({ id: { in: input.classIds } });
    const themes = input.themes.map((theme) => ({
      ...theme,
      questions: theme.questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({
          ...answer,
          content: clean(answer.content),
        })),
      })),
    }));

    const result = await this.sendPrompt<{ gaps: ClassGap[] }>(
      ANALYSE_CLASS_THEMES_PROMPT,
      JSON.stringify({ themes }),
      512,
    );

    const gaps = result?.gaps;
    if (!Array.isArray(gaps)) {
      return null;
    }

    return gaps.flatMap((gap) => {
      const theme = gap.theme?.trim();
      const evidence = gap.evidence?.trim();
      const suggestion = gap.suggestion?.trim();

      return [{ theme, evidence, suggestion }];
    });
  }

  private async answerCleaner(classWhere: Prisma.ClassWhereInput) {
    const students = await this.prisma.user.findMany({
      where: {
        anonymizedAt: null,
        studentAssignments: { some: { class: classWhere } },
      },
      select: { name: true, registrationNumber: true },
    });

    const terms = students
      .flatMap((student) => [
        student.registrationNumber?.trim(),
        student.name.trim(),
        ...student.name
          .split(/\s+/)
          .filter((part) => part.length > 2 && !/^d[aeo]s$/i.test(part)),
      ])
      .filter((term): term is string => !!term)
      .sort((a, b) => b.length - a.length)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    const studentPattern = terms.length
      ? new RegExp(`(?<![\\p{L}\\d])(${terms.join('|')})(?![\\p{L}\\d])`, 'giu')
      : null;

    return (content: string) => {
      const withoutEmails = content.replace(EMAIL_PATTERN, '[aluno]');
      const cleaned = studentPattern
        ? withoutEmails.replace(studentPattern, '[aluno]')
        : withoutEmails;
      return cleaned.slice(0, MAX_ANSWER_LENGTH);
    };
  }

  private async sendPrompt<T>(
    prompt: string,
    data: string,
    maxOutputTokens: number,
  ) {
    const aiToken = this.config.get<string>('AI_TOKEN');
    const aiModel = this.config.get<string>('AI_MODEL');

    if (!aiToken || !aiModel) {
      return null;
    }
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: aiToken,
    });

    const response = await ai.models.generateContent({
      model: aiModel,
      contents: data,
      config: {
        systemInstruction: prompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens,
      },
    });

    if (!response.text) {
      return null;
    }

    return JSON.parse(response.text) as T;
  }

  private weightedScore(
    points: number,
    totalPoints: number,
    targetScore: number,
  ) {
    if (totalPoints <= 0) {
      return 0;
    }

    return Math.round((points / totalPoints) * targetScore * 100) / 100;
  }

  private clampScore(score: number, maxScore: number) {
    if (!Number.isFinite(score)) {
      return 0;
    }

    const bounded = Math.min(Math.max(score, 0), maxScore);
    return Math.round(bounded * 100) / 100;
  }
}
