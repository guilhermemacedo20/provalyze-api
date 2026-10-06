import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ExamStatus, SessionStatus } from '@prisma/client';
import { LogsService } from 'src/infra/logs/logs.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { SubmitExamDto } from './dto/exams.dto';

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  async getStudentClassExam(req: any, classId: string) {
    const user = req.user;

    const schoolClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        studentAssignments: {
          some: { userId: user.id, endedAt: null },
        },
      },
    });

    if (!schoolClass) {
      throw new UnauthorizedException('Aluno não está nessa turma');
    }

    const assignment = await this.prisma.examAssignment.findFirst({
      where: { classId },
      include: {
        exam: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException('Prova não encontrada para essa turma');
    }

    const exam = assignment.exam;
    const closed = this.closedExam(exam);
    if (closed) {
      return closed;
    }

    return {
      available: true,
      id: exam.id,
      title: exam.title,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      targetScore: exam.targetScore,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
    };
  }

  async getExam(req: any, classId: string, examId: string) {
    const user = req.user;

    const schoolClass = await this.prisma.class.findFirst({
      where: {
        id: classId,
        studentAssignments: {
          some: { userId: user.id, endedAt: null },
        },
      },
    });

    if (!schoolClass) {
      throw new UnauthorizedException('Aluno não está nessa turma');
    }

    const assignment = await this.prisma.examAssignment.findFirst({
      where: { classId, examId },
      include: {
        exam: {
          include: {
            examQuestions: {
              include: {
                question: {
                  include: {
                    questionOptions: { orderBy: { label: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Prova não encontrada para essa turma');
    }

    const exam = assignment.exam;
    const closed = this.closedExam(exam);
    if (closed) {
      return closed;
    }

    let examSession = await this.prisma.examSession.findFirst({
      where: { examId, userId: user.id },
    });

    if (examSession?.status === SessionStatus.FINISHED) {
      return {
        available: false as const,
        message: 'Prova já finalizada',
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      };
    }

    if (examSession?.status === SessionStatus.EXPIRED) {
      return {
        available: false as const,
        message: 'Tempo da prova esgotado',
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      };
    }

    if (!examSession) {
      examSession = await this.prisma.examSession.create({
        data: {
          examId,
          userId: user.id,
          status: SessionStatus.STARTED,
          startedAt: new Date(),
        },
      });
      await this.logs.audit(`Iniciou a prova ${exam.title}`, user.id);
    }

    const expiresAt = this.expiresAt(exam, examSession.startedAt as Date);

    if (examSession.startedAt && new Date() > expiresAt) {
      await this.prisma.examSession.update({
        where: { id: examSession.id },
        data: { status: SessionStatus.EXPIRED },
      });

      return {
        available: false as const,
        message: 'Tempo da prova esgotado',
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      };
    }

    return {
      available: true,
      id: exam.id,
      title: exam.title,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      sessionId: examSession.id,
      startedAt: examSession.startedAt,
      expiresAt,
      targetScore: exam.targetScore,
      durationMinutes: exam.durationMinutes,
      status: exam.status,
      questions: this.shuffle(exam.examQuestions).map((examQuestion) => ({
        id: examQuestion.id,
        points: examQuestion.points,
        statement: examQuestion.question.statement,
        type: examQuestion.question.type,
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
    const user = req.user;
    console.log(user);
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
    exam: { endsAt: Date; durationMinutes: number | null },
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

  private closedExam(exam: {
    startsAt: Date;
    endsAt: Date;
    status: ExamStatus;
  }) {
    const now = new Date();

    if (now < exam.startsAt) {
      return {
        available: false as const,
        message: 'A prova ainda não está no prazo para ser realizada.',
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      };
    }

    if (now > exam.endsAt || exam.status === ExamStatus.ENDED) {
      return {
        available: false as const,
        message: 'O prazo para realizar a prova acabou.',
        startsAt: exam.startsAt,
        endsAt: exam.endsAt,
      };
    }

    return null;
  }
}
