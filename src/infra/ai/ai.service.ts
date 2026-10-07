import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const VALIDATE_ANSWER_PROMPT = `Você corrige uma resposta de prova.
Leia a questão e a resposta do aluno. Devolva apenas JSON com:
- suggestedScore: número de 0 até maxScore, com no máximo uma casa decimal
- justification: texto curto com no máximo 100 caracteres em português explicando a nota a partir do enunciado e da resposta,
distribua a nota pela aderência ao enunciado. Não invente conteúdo que o aluno não escreveu.`;

const ANALYSE_EXAM_PROMPT = `Você escreve uma análise pedagógica do resultado de uma prova.
Use apenas os dados recebidos. Devolva apenas JSON com:
- analysis: dois parágrafos curtos em português
O primeiro diz como o aluno foi em relação à nota alvo.
O segundo aponta os temas com mais dificuldade e o que vale revisar, em tom de orientação.`;

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

    const suggestion = await this.sendPrompt<{
      suggestedScore: number;
      justification: string;
    }>(
      VALIDATE_ANSWER_PROMPT,
      JSON.stringify({
        statement: examQuestion.question.statement,
        theme: examQuestion.question.theme.name,
        studentAnswer: answer.content,
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

  async analyzeExamResult(sessionId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: { select: { title: true, targetScore: true } },
        answers: {
          include: {
            examQuestion: {
              include: {
                question: {
                  select: {
                    statement: true,
                    type: true,
                    theme: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    const result = await this.sendPrompt<{ analysis: string }>(
      ANALYSE_EXAM_PROMPT,
      JSON.stringify({
        title: session.exam.title,
        score: session.score,
        targetScore: session.exam.targetScore,
        answers: session.answers.map((answer) => ({
          theme: answer.examQuestion.question.theme.name,
          statement: answer.examQuestion.question.statement,
          type: answer.examQuestion.question.type,
          studentAnswer: answer.content,
          isCorrect: answer.isCorrect,
          score: answer.score,
          gradeStatus: answer.gradeStatus,
        })),
      }),
      512,
    );

    if (!result?.analysis?.trim()) {
      return null;
    }

    return { analysis: result.analysis.trim() };
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
