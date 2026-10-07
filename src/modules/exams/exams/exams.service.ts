import {
  BadRequestException,
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
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { SubmitExamDto, SubmitExamEventDto } from './dto/exams.dto';

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

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
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

  async getExam(req: any, classId: string, examId: string) {
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
}
