import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamStatus, GradeStatus, Prisma, SessionStatus } from '@prisma/client';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import type { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { SaveExamDto } from './dto/exams.dto';
import { EXAM_TOTAL_SCORE } from './exams.constants';

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
  ) {}

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