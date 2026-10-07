import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Exam,
  ExamSession,
  ExamStatus,
  GradeStatus,
  Prisma,
  QuestionType,
  SessionStatus,
} from '@prisma/client';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { AIService } from 'src/infra/ai/ai.service';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { EXAM_TOTAL_SCORE } from './exams.constants';
import {
  SaveExamDto,
  SubmitExamDto,
  SubmitExamEventDto,
} from './dto/exams.dto';

const examQuestionsInclude = {
  question: {
    include: {
      theme: { select: { name: true } },
      questionOptions: { orderBy: { label: 'asc' as const } },
    },
  },
};

type ExamQuestionWithOptions = Prisma.ExamQuestionGetPayload<{
  include: typeof examQuestionsInclude;
}>;

type StudentClass = Prisma.ClassGetPayload<{
  select: {
    id: true;
    name: true;
    subject: { select: { name: true; course: { select: { name: true } } } };
  };
}>;

const classWithSubject = {
  subject: { include: { course: { select: { name: true } } } },
} satisfies Prisma.ClassInclude;

const examListInclude = {
  examQuestions: { select: { points: true } },
  assignments: { include: { class: { include: classWithSubject } } },
} satisfies Prisma.ExamInclude;

const examDetailInclude = {
  teacher: { select: { name: true } },
  examQuestions: {
    orderBy: { order: 'asc' },
    include: {
      question: {
        include: { theme: { select: { id: true, name: true } } },
      },
      answers: { select: { isCorrect: true } },
    },
  },
  assignments: {
    include: {
      class: {
        include: {
          ...classWithSubject,
          studentAssignments: {
            where: { endedAt: null },
            select: { userId: true },
          },
        },
      },
    },
  },
} satisfies Prisma.ExamInclude;

type ExamListRow = Prisma.ExamGetPayload<{ include: typeof examListInclude }>;
type ExamDetailRow = Prisma.ExamGetPayload<{
  include: typeof examDetailInclude;
}>;

export type StudentExamStatus =
  'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED' | 'GRADED' | 'EXPIRED';

export function effectiveExamStatus(
  status: ExamStatus,
  endsAt: Date,
  now: Date = new Date(),
): ExamStatus {
  if (status === ExamStatus.PUBLISHED && endsAt.getTime() < now.getTime()) {
    return ExamStatus.ENDED;
  }
  return status;
}

function studentStatus(
  session:
    | {
        status: SessionStatus;
        answers: { gradeStatus: GradeStatus }[];
      }
    | undefined,
): StudentExamStatus {
  if (!session || session.status === SessionStatus.PENDING) {
    return 'NOT_STARTED';
  }
  if (session.status === SessionStatus.STARTED) return 'IN_PROGRESS';
  if (session.status === SessionStatus.EXPIRED) return 'EXPIRED';

  const allGraded =
    session.answers.length > 0 &&
    session.answers.every((a) => a.gradeStatus !== GradeStatus.PENDING);
  return allGraded ? 'GRADED' : 'FINISHED';
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// 7.5 -> "7,5" (para as mensagens de erro em português)
function fmtPoints(value: number) {
  return String(round2(value)).replace('.', ',');
}

function sumQuestionPoints(questions: { points: number }[]) {
  return round2(questions.reduce((sum, q) => sum + q.points, 0));
}

function mapClass(c: ExamListRow['assignments'][number]['class']) {
  return {
    id: c.id,
    name: c.name,
    subjectName: c.subject.name,
    courseName: c.subject.course.name,
  };
}

function mapListItem(exam: ExamListRow, now: Date) {
  return {
    id: exam.id,
    title: exam.title,
    status: effectiveExamStatus(exam.status, exam.endsAt, now),
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    durationMinutes: exam.durationMinutes,
    questionsCount: exam.examQuestions.length,
    totalPoints: exam.examQuestions.reduce((sum, q) => sum + q.points, 0),
    classes: exam.assignments.map((a) => mapClass(a.class)),
  };
}

function mapDetail(exam: ExamDetailRow, now: Date) {
  const studentIds = new Set<string>();
  const classes = exam.assignments.map((a) => {
    a.class.studentAssignments.forEach((s) => studentIds.add(s.userId));
    return {
      ...mapClass(a.class),
      studentsCount: a.class.studentAssignments.length,
    };
  });

  const questions = exam.examQuestions.map((eq) => ({
    examQuestionId: eq.id,
    questionId: eq.questionId,
    order: eq.order,
    points: eq.points,
    statement: eq.question.statement,
    type: eq.question.type,
    themeId: eq.question.theme.id,
    themeName: eq.question.theme.name,
    // % de acertos já registrados nas respostas; null enquanto ninguém respondeu.
    correctRate: eq.answers.length
      ? Math.round(
          (eq.answers.filter((a) => a.isCorrect).length / eq.answers.length) *
            100,
        )
      : null,
  }));

  return {
    id: exam.id,
    title: exam.title,
    status: effectiveExamStatus(exam.status, exam.endsAt, now),
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    durationMinutes: exam.durationMinutes,
    targetScore: exam.targetScore,
    teacherName: exam.teacher.name,
    classes,
    studentsCount: studentIds.size,
    questions,
    totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
  };
}

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
    private readonly aiService: AIService,
  ) {}

  async getStudentClassExams(req: any, classId: string) {
    const userId = req.user.id;
    const schoolClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        studentAssignments: {
          some: { userId, endedAt: null },
        },
      },
      select: {
        id: true,
        name: true,
        subject: {
          select: { name: true, course: { select: { name: true } } },
        },
        examAssignments: {
          include: {
            exam: {
              include: {
                sessions: { where: { userId }, take: 1 },
              },
            },
          },
          orderBy: { exam: { startsAt: 'asc' } },
        },
      },
    });

    if (!schoolClass) {
      throw new UnauthorizedException('Aluno não está nessa turma');
    }

    return {
      classId: schoolClass.id,
      className: schoolClass.name,
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      exams: schoolClass.examAssignments.map((assignment) =>
        this.toStudentExam(
          schoolClass,
          assignment.exam,
          assignment.exam.sessions[0],
        ),
      ),
    };
  }

  async getStudentExam(req: any, classId: string, examId: string) {
    const userId = req.user.id;
    await this.assertStudentInClass(userId, classId);
    const exam = await this.findAssignedExam(classId, examId);

    let session = await this.prisma.examSession.findFirst({
      where: { examId, userId },
    });

    if (session?.status === SessionStatus.FINISHED) {
      return this.finishedExam(exam, session);
    }

    const closed = this.closedExam(exam);
    if (closed) {
      return closed;
    }

    if (session?.status === SessionStatus.EXPIRED) {
      return this.blocked(exam, 'Tempo da prova esgotado');
    }

    if (!session) {
      session = await this.prisma.examSession.create({
        data: {
          examId: exam.id,
          userId,
          status: SessionStatus.STARTED,
          startedAt: new Date(),
        },
      });
      await this.logs.audit(`Iniciou a prova ${exam.title}`, userId);
    }

    if (!session.startedAt) {
      session = await this.prisma.examSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.STARTED, startedAt: new Date() },
      });
    }

    const expiresAt = this.expiresAt(exam, session.startedAt as Date);

    if (session.startedAt && new Date() > expiresAt) {
      await this.prisma.examSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });

      return this.blocked(exam, 'Tempo da prova esgotado');
    }

    const examQuestions = await this.prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      include: examQuestionsInclude,
    });

    return {
      available: true,
      id: exam.id,
      title: exam.title,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      sessionId: session.id,
      startedAt: session.startedAt,
      expiresAt,
      targetScore: exam.targetScore,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      questions: this.shuffle(examQuestions).map((examQuestion) => ({
        id: examQuestion.id,
        questionId: examQuestion.questionId,
        points: examQuestion.points,
        statement: examQuestion.question.statement,
        type: examQuestion.question.type,
        themeName: examQuestion.question.theme.name,
        imageUrl: examQuestion.question.imageUrl,
        options: this.shuffle(examQuestion.question.questionOptions).map(
          (option) => ({
            id: option.id,
            label: option.label,
            text: option.text,
          }),
        ),
      })),
    };
  }

  async submitExam(
    req: any,
    classId: string,
    examId: string,
    body: SubmitExamDto,
  ) {
    const userId = req.user.id;
    await this.assertStudentInClass(userId, classId);
    const exam = await this.findAssignedExam(classId, examId);

    const closed = this.closedExam(exam);
    if (closed) {
      return closed;
    }

    const session = await this.prisma.examSession.findFirst({
      where: { examId, userId },
    });

    if (!session || session.status !== SessionStatus.STARTED) {
      return this.blocked(exam, this.inactiveSessionMessage(session));
    }

    const expiresAt = this.expiresAt(exam, session.startedAt as Date);

    if (session.startedAt && new Date() > expiresAt) {
      await this.prisma.examSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.EXPIRED },
      });

      return this.blocked(exam, 'Prova expirada');
    }

    const examQuestions = await this.prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      include: examQuestionsInclude,
    });
    const graded = this.gradeAnswers(
      exam,
      session.id,
      examQuestions,
      body.answers,
    );
    const score = graded.reduce((total, row) => total + row.score, 0);
    const finishedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.answer.createMany({
        data: graded.map((row) => ({
          sessionId: row.sessionId,
          examQuestionId: row.examQuestionId,
          content: row.content,
          isCorrect: row.isCorrect,
          score: row.score,
          gradeStatus: row.gradeStatus,
        })),
      }),
      this.prisma.examSession.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.FINISHED,
          finishedAt,
          score,
        },
      }),
    ]);

    await this.logs.audit(`Entregou a prova ${exam.title}`, userId);

    return {
      status: SessionStatus.FINISHED,
      score,
      questions: graded.map((row) => ({
        examQuestionId: row.examQuestionId,
        type: row.type,
        isCorrect: row.isCorrect,
        score: row.score,
        gradeStatus: row.gradeStatus,
        themeName: row.themeName,
      })),
      finishedAt,
    };
  }

  async submitExamEvents(
    req: any,
    classId: string,
    examId: string,
    body: SubmitExamEventDto,
  ) {
    const userId = req.user.id;
    await this.assertStudentInClass(userId, classId);
    await this.findAssignedExam(classId, examId);

    const session = await this.prisma.examSession.findFirst({
      where: { examId, userId },
    });

    if (!session || session.status !== SessionStatus.STARTED) {
      throw new BadRequestException('A prova não está em andamento');
    }

    const examQuestion = await this.prisma.examQuestion.findFirst({
      where: { id: body.event.examQuestionId, examId },
      select: { id: true, questionId: true },
    });

    if (!examQuestion) {
      throw new BadRequestException('Questão não encontrada nessa prova');
    }

    const hasEvent = await this.prisma.examEvent.findFirst({
      where: {
        sessionId: session.id,
        examQuestionId: examQuestion.id,
        type: body.event.type,
      },
    });

    if (hasEvent) {
      return {
        message: 'Evento já registrado para essa questão',
        event: hasEvent.type,
        examQuestionId: hasEvent.examQuestionId,
      };
    }

    const event = await this.prisma.examEvent.create({
      data: {
        sessionId: session.id,
        examQuestionId: examQuestion.id,
        type: body.event.type,
      },
    });
    this.logs.audit(
      `Registrou evento ${event.type} na questão ${examQuestion.questionId}`,
      userId,
    );
    return {
      id: event.id,
      type: event.type,
    };
  }

  async aiValidateQuestion(req: any, answerId: string) {
    const userId = req.user.id;
    const answer = await this.prisma.answer.findFirst({
      where: { id: answerId },
      select: {
        content: true,
        aiJustification: true,
        aiSuggestedScore: true,
        sessionId: true,
        examQuestionId: true,
        examQuestion: {
          select: {
            points: true,
            question: {
              select: {
                type: true,
                statement: true,
                theme: { select: { name: true } },
              },
            },
            exam: {
              select: {
                targetScore: true,
                examQuestions: { select: { points: true } },
              },
            },
          },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('Resposta não encontrada');
    }

    const teacherExam = await this.prisma.exam.findFirst({
      where: {
        examQuestions: { some: { id: answer.examQuestionId } },
        assignments: {
          some: {
            class: {
              teacherAssignments: {
                some: { userId, endedAt: null },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!teacherExam) {
      throw new UnauthorizedException(
        'Você não tem permissão para validar essa questão',
      );
    }

    if (answer.examQuestion.question.type !== QuestionType.OPEN_ENDED) {
      throw new BadRequestException(
        'A validação de questões só é permitida para questões dissertativas',
      );
    }

    const maxScore = this.weightedScore(
      answer.examQuestion.points,
      answer.examQuestion.exam.examQuestions.reduce(
        (total, item) => total + item.points,
        0,
      ),
      answer.examQuestion.exam.targetScore,
    );

    if (answer.aiJustification && answer.aiSuggestedScore !== null) {
      return {
        suggestedScore: answer.aiSuggestedScore,
        justification: answer.aiJustification,
        maxScore,
      };
    }

    const suggestion = await this.aiService.suggestAnswerScore(answer);

    if (!suggestion) {
      throw new BadRequestException(
        'Não foi possível sugerir a nota dessa resposta',
      );
    }

    return suggestion;
  }

  private async assertStudentInClass(userId: string, classId: string) {
    const schoolClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        studentAssignments: {
          some: { userId, endedAt: null },
        },
      },
      select: { id: true },
    });

    if (!schoolClass) {
      throw new UnauthorizedException('Aluno não está nessa turma');
    }
  }

  private async findAssignedExam(classId: string, examId: string) {
    const assignment = await this.prisma.examAssignment.findFirst({
      where: { classId, examId },
      select: { exam: true },
    });

    if (!assignment) {
      throw new NotFoundException('Prova não encontrada para essa turma');
    }

    return assignment.exam;
  }

  private toStudentExam(
    schoolClass: StudentClass,
    exam: Exam,
    session?: ExamSession,
  ) {
    const now = new Date();
    const closed = this.closedExam(exam, now);
    let available = !closed && exam.status === ExamStatus.PUBLISHED;
    let message = closed?.message ?? null;
    const timeExpired = this.personalTimeExpired(exam, session, now);

    if (exam.status === ExamStatus.DRAFT) {
      available = false;
      message = 'Prova ainda não publicada';
    }

    if (session?.status === SessionStatus.FINISHED) {
      available = false;
      message = 'Prova já finalizada';
    } else if (session?.status === SessionStatus.EXPIRED || timeExpired) {
      available = false;
      message = 'Tempo da prova esgotado';
    } else if (available && session?.status === SessionStatus.STARTED) {
      message = 'Continuar prova';
    }

    const finished =
      session?.status === SessionStatus.FINISHED ||
      session?.status === SessionStatus.EXPIRED ||
      exam.status === ExamStatus.ENDED ||
      now > exam.endsAt;

    return {
      id: exam.id,
      classId: schoolClass.id,
      className: schoolClass.name,
      subjectName: schoolClass.subject.name,
      courseName: schoolClass.subject.course.name,
      title: exam.title,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      targetScore: exam.targetScore,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      sessionStatus: session?.status ?? null,
      score: session?.score ?? null,
      available,
      finished,
      message,
    };
  }

  private gradeAnswers(
    exam: Exam,
    sessionId: string,
    examQuestions: ExamQuestionWithOptions[],
    answers: SubmitExamDto['answers'],
  ) {
    const submitted = new Map(
      answers.map((answer) => [answer.examQuestionId, answer]),
    );
    const totalPoints = examQuestions.reduce(
      (total, examQuestion) => total + examQuestion.points,
      0,
    );

    return examQuestions.map((examQuestion) => {
      const answer = submitted.get(examQuestion.id);
      const question = examQuestion.question;

      const weightedPoints =
        Math.round(
          (examQuestion.points / (totalPoints || 0)) * exam.targetScore * 100,
        ) / 100;

      if (question.type !== QuestionType.MULTIPLE_CHOICE) {
        return {
          sessionId,
          examQuestionId: examQuestion.id,
          content: answer?.content?.trim() ?? '',
          isCorrect: false,
          score: 0,
          gradeStatus: GradeStatus.PENDING,
          type: question.type,
          themeName: question.theme.name,
        };
      }

      const option = question.questionOptions.find(
        (item) => item.id === answer?.optionId,
      );

      if (answer?.optionId && !option) {
        throw new BadRequestException(
          'Alternativa não encontrada nessa questão',
        );
      }

      const isCorrect = Boolean(
        option && option.label === question.correctOption,
      );

      return {
        sessionId,
        examQuestionId: examQuestion.id,
        content: option?.label ?? '',
        isCorrect,
        score: isCorrect ? weightedPoints : 0,
        gradeStatus: GradeStatus.AUTO,
        type: question.type,
        themeName: question.theme.name,
      };
    });
  }

  private async finishedExam(exam: Exam, session: ExamSession) {
    const answers = await this.prisma.answer.findMany({
      where: { sessionId: session.id },
      include: {
        examQuestion: {
          include: {
            question: {
              select: { type: true, theme: { select: { name: true } } },
            },
          },
        },
      },
    });

    return this.blocked(exam, 'Prova já finalizada', {
      finished: true,
      title: exam.title,
      score: session.score,
      targetScore: exam.targetScore,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      review: answers.map((answer) => ({
        examQuestionId: answer.examQuestionId,
        type: answer.examQuestion.question.type,
        themeName: answer.examQuestion.question.theme.name,
        isCorrect: answer.isCorrect,
        score: answer.score,
        gradeStatus: answer.gradeStatus,
      })),
    });
  }

  private blocked(
    exam: Pick<Exam, 'startsAt' | 'endsAt'>,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    return {
      available: false as const,
      message,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      ...extra,
    };
  }

  private inactiveSessionMessage(session: ExamSession | null) {
    if (session?.status === SessionStatus.EXPIRED) {
      return 'Prova expirada';
    }

    if (session) {
      return 'Prova já finalizada';
    }

    return 'A prova ainda não foi iniciada';
  }

  private personalTimeExpired(
    exam: Pick<Exam, 'endsAt' | 'durationMinutes'>,
    session: Pick<ExamSession, 'status' | 'startedAt'> | undefined,
    now: Date,
  ) {
    return Boolean(
      session?.status === SessionStatus.STARTED &&
      session.startedAt &&
      now > this.expiresAt(exam, session.startedAt),
    );
  }

  private shuffle<T>(items: T[]): T[] {
    const copy = [...items];

    for (let index = copy.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = current;
    }

    return copy;
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

  private expiresAt(
    exam: Pick<Exam, 'endsAt' | 'durationMinutes'>,
    startedAt: Date,
  ) {
    if (!exam.durationMinutes || exam.durationMinutes <= 0) {
      return exam.endsAt;
    }

    const durationEnd = new Date(
      startedAt.getTime() + exam.durationMinutes * 60 * 1000,
    );

    return durationEnd < exam.endsAt ? durationEnd : exam.endsAt;
  }

  private closedExam(
    exam: Pick<Exam, 'startsAt' | 'endsAt' | 'status'>,
    now = new Date(),
  ) {
    if (now < exam.startsAt) {
      return this.blocked(
        exam,
        'A prova ainda não está no prazo para ser realizada.',
      );
    }

    if (now > exam.endsAt || exam.status === ExamStatus.ENDED) {
      return this.blocked(exam, 'O prazo para realizar a prova acabou.');
    }

    return null;
  }

  // validações

  private parseSchedule(dto: SaveExamDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'A data final deve ser posterior à data inicial',
      );
    }

    const windowMinutes = (endsAt.getTime() - startsAt.getTime()) / 60000;
    if (dto.durationMinutes > windowMinutes) {
      throw new BadRequestException(
        'O tempo de prova não pode ser maior que o período de aplicação',
      );
    }

    return { startsAt, endsAt };
  }

  private async assertQuestionsAreFromTeacher(
    userId: string,
    questions: SaveExamDto['questions'],
  ) {
    const ids = questions.map((q) => q.questionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Há questões repetidas na prova');
    }
    if (!ids.length) return;

    const found = await this.prisma.question.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'Uma ou mais questões não foram encontradas no seu banco de questões',
      );
    }
  }

  private async assertClassesAreFromTeacher(
    userId: string,
    classIds: string[],
  ) {
    if (!classIds.length) return;

    const found = await this.prisma.teacherAssignment.findMany({
      where: { userId, classId: { in: classIds }, endedAt: null },
      select: { classId: true },
    });
    const foundIds = new Set(found.map((f) => f.classId));
    if (classIds.some((id) => !foundIds.has(id))) {
      throw new BadRequestException(
        'Uma ou mais turmas selecionadas não são suas',
      );
    }
  }

  // vale para rascunho e publicação: nunca passar do total da prova
  private assertPointsWithinTotal(
    questions: { points: number }[],
    totalScore: number,
  ) {
    const sum = sumQuestionPoints(questions);
    if (sum > totalScore) {
      throw new BadRequestException(
        `A soma dos pontos das questões (${fmtPoints(sum)}) ultrapassa o total da prova (${fmtPoints(totalScore)})`,
      );
    }
  }

  private assertPublishable(
    questionsCount: number,
    classesCount: number,
    endsAt: Date,
    pointsSum: number,
    totalScore: number,
  ) {
    if (questionsCount < 1) {
      throw new BadRequestException(
        'Adicione ao menos uma questão antes de publicar',
      );
    }
    if (classesCount < 1) {
      throw new BadRequestException(
        'Selecione ao menos uma turma antes de publicar',
      );
    }
    if (endsAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'A data final da prova já passou. Ajuste o período para publicar',
      );
    }
    if (round2(pointsSum) !== round2(totalScore)) {
      throw new BadRequestException(
        `A soma dos pontos das questões (${fmtPoints(pointsSum)}) precisa ser igual ao total da prova (${fmtPoints(totalScore)}) para publicar`,
      );
    }
  }

  private async findOwnExam(userId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, userId } });
    if (!exam) {
      throw new NotFoundException('Prova não encontrada');
    }
    return exam;
  }

  // operações

  async createExam(req: AuthenticatedRequest, dto: SaveExamDto) {
    const user = req.user;
    const { startsAt, endsAt } = this.parseSchedule(dto);
    const totalScore = dto.totalScore ?? EXAM_TOTAL_SCORE;

    await this.assertQuestionsAreFromTeacher(user.id, dto.questions);
    await this.assertClassesAreFromTeacher(user.id, dto.classIds);
    this.assertPointsWithinTotal(dto.questions, totalScore);

    if (dto.publish) {
      this.assertPublishable(
        dto.questions.length,
        dto.classIds.length,
        endsAt,
        sumQuestionPoints(dto.questions),
        totalScore,
      );
    }

    const exam = await this.prisma.exam.create({
      data: {
        title: dto.title,
        startsAt,
        endsAt,
        durationMinutes: dto.durationMinutes,
        targetScore: totalScore,
        status: dto.publish ? ExamStatus.PUBLISHED : ExamStatus.DRAFT,
        userId: user.id,
        examQuestions: {
          create: dto.questions.map((q, index) => ({
            questionId: q.questionId,
            points: q.points,
            order: index,
          })),
        },
        assignments: {
          create: dto.classIds.map((classId) => ({ classId })),
        },
      },
      include: examDetailInclude,
    });

    await this.logs.audit(
      `Exam created ${exam.id}${dto.publish ? ' (published)' : ''}`,
      user.id,
    );

    return mapDetail(exam, new Date());
  }

  async listExams(req: AuthenticatedRequest) {
    const exams = await this.prisma.exam.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: examListInclude,
    });

    const now = new Date();
    return exams.map((exam) => mapListItem(exam, now));
  }

  async getExam(req: AuthenticatedRequest, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, userId: req.user.id },
      include: examDetailInclude,
    });
    if (!exam) {
      throw new NotFoundException('Prova não encontrada');
    }
    return mapDetail(exam, new Date());
  }

  async updateExam(req: AuthenticatedRequest, id: string, dto: SaveExamDto) {
    const user = req.user;
    const existing = await this.findOwnExam(user.id, id);

    if (existing.status !== ExamStatus.DRAFT) {
      throw new ConflictException(
        'Só é possível editar provas que ainda estão em rascunho',
      );
    }

    const { startsAt, endsAt } = this.parseSchedule(dto);
    // se o front não mandar o total, mantém o que já estava gravado
    const totalScore = dto.totalScore ?? existing.targetScore;

    await this.assertQuestionsAreFromTeacher(user.id, dto.questions);
    await this.assertClassesAreFromTeacher(user.id, dto.classIds);
    this.assertPointsWithinTotal(dto.questions, totalScore);

    if (dto.publish) {
      this.assertPublishable(
        dto.questions.length,
        dto.classIds.length,
        endsAt,
        sumQuestionPoints(dto.questions),
        totalScore,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.deleteMany({ where: { examId: id } });
      await tx.examAssignment.deleteMany({ where: { examId: id } });

      return tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          startsAt,
          endsAt,
          durationMinutes: dto.durationMinutes,
          targetScore: totalScore,
          status: dto.publish ? ExamStatus.PUBLISHED : ExamStatus.DRAFT,
          examQuestions: {
            create: dto.questions.map((q, index) => ({
              questionId: q.questionId,
              points: q.points,
              order: index,
            })),
          },
          assignments: {
            create: dto.classIds.map((classId) => ({ classId })),
          },
        },
        include: examDetailInclude,
      });
    });

    await this.logs.audit(
      `Exam updated ${id}${dto.publish ? ' (published)' : ''}`,
      user.id,
    );

    return mapDetail(updated, new Date());
  }

  async publishExam(req: AuthenticatedRequest, id: string) {
    const user = req.user;
    const exam = await this.prisma.exam.findFirst({
      where: { id, userId: user.id },
      include: {
        examQuestions: { select: { id: true, points: true } },
        assignments: { select: { id: true } },
      },
    });
    if (!exam) {
      throw new NotFoundException('Prova não encontrada');
    }
    if (exam.status !== ExamStatus.DRAFT) {
      throw new ConflictException('Essa prova já foi publicada');
    }

    this.assertPublishable(
      exam.examQuestions.length,
      exam.assignments.length,
      exam.endsAt,
      sumQuestionPoints(exam.examQuestions),
      exam.targetScore,
    );

    const published = await this.prisma.exam.update({
      where: { id },
      data: { status: ExamStatus.PUBLISHED },
      include: examDetailInclude,
    });

    await this.logs.audit(`Exam published ${id}`, user.id);

    return mapDetail(published, new Date());
  }

  async deleteExam(req: AuthenticatedRequest, id: string) {
    const user = req.user;
    const exam = await this.findOwnExam(user.id, id);

    const sessions = await this.prisma.examSession.count({
      where: { examId: id },
    });
    if (sessions > 0) {
      throw new ConflictException(
        'Essa prova já tem alunos que iniciaram e não pode ser excluída',
      );
    }

    await this.prisma.exam.delete({ where: { id: exam.id } });
    await this.logs.audit(`Exam deleted ${id}`, user.id);

    return { id };
  }

  // Aba "Visão geral" do detalhe da prova: números + situação de cada aluno.
  async getOverview(req: AuthenticatedRequest, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, userId: req.user.id },
      include: {
        examQuestions: { select: { id: true } },
        assignments: {
          include: {
            class: {
              select: {
                studentAssignments: {
                  where: { endedAt: null },
                  include: { student: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!exam) {
      throw new NotFoundException('Prova não encontrada');
    }

    const sessions = await this.prisma.examSession.findMany({
      where: { examId: id },
      include: {
        student: { select: { id: true, name: true } },
        answers: { select: { gradeStatus: true } },
      },
    });

    const students = new Map<string, string>();
    exam.assignments.forEach((a) =>
      a.class.studentAssignments.forEach((s) =>
        students.set(s.student.id, s.student.name),
      ),
    );
    // aluno que começou a prova e depois saiu da turma continua aparecendo
    sessions.forEach((s) => students.set(s.student.id, s.student.name));

    const sessionByStudent = new Map(sessions.map((s) => [s.userId, s]));

    const rows = [...students.entries()]
      .map(([studentId, name]) => {
        const session = sessionByStudent.get(studentId);
        const minutes =
          session?.startedAt && session.finishedAt
            ? Math.round(
                (session.finishedAt.getTime() - session.startedAt.getTime()) /
                  60000,
              )
            : null;

        return {
          id: studentId,
          name,
          status: studentStatus(session),
          score: session?.score ?? null,
          durationMinutes: minutes,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const scores = rows
      .map((r) => r.score)
      .filter((score): score is number => score !== null);
    const finished = rows.filter(
      (r) => r.status === 'FINISHED' || r.status === 'GRADED',
    ).length;

    return {
      stats: {
        questionsCount: exam.examQuestions.length,
        studentsCount: rows.length,
        average: scores.length
          ? round1(scores.reduce((sum, s) => sum + s, 0) / scores.length)
          : null,
        completionRate: rows.length
          ? Math.round((finished / rows.length) * 100)
          : 0,
      },
      students: rows,
    };
  }
}