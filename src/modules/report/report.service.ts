import { Injectable, NotFoundException } from '@nestjs/common';
import { ExamStatus, GradeStatus, Role, SessionStatus } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';

function roundScore(value: number | null) {
  if (!value) return null;
  return Math.round(value * 100) / 100;
}

const fullyGradedSession = {
  status: SessionStatus.FINISHED,
  answers: {
    some: {},
    none: { gradeStatus: GradeStatus.PENDING },
  },
};

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async dashInformation(req: any) {
    const user = req.user;

    if (user.role === Role.ADMIN || user.role === Role.COORDINATOR) {
      return this.adminDashboard();
    }

    if (user.role === Role.TEACHER) {
      return this.teacherDashboard(user.id);
    }

    if (user.role === Role.STUDENT) {
      return this.studentDashboard(user.id);
    }

    throw new NotFoundException('Dashboard information not found');
  }

  private async adminDashboard() {
    const [
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalExams,
      completedExams,
      averageResult,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: Role.TEACHER } }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
      this.prisma.class.count(),
      this.prisma.exam.count(),
      this.prisma.examSession.count({
        where: { status: SessionStatus.FINISHED },
      }),
      this.prisma.examSession.aggregate({
        where: fullyGradedSession,
        _avg: { score: true },
      }),
    ]);

    return {
      role: Role.ADMIN,
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalExams,
      completedExams,
      totalAverage: roundScore(averageResult._avg.score),
    };
  }

  private async teacherDashboard(userId: string) {
    const [totalExams, averageResult, grouped] = await Promise.all([
      this.prisma.exam.count({ where: { userId } }),
      this.prisma.examSession.aggregate({
        where: {
          ...fullyGradedSession,
          exam: { userId },
        },
        _avg: { score: true },
      }),
      this.prisma.answer.groupBy({
        by: ['isCorrect'],
        where: {
          gradeStatus: { in: [GradeStatus.AUTO, GradeStatus.TEACHER_APPROVED] },
          examQuestion: { exam: { userId } },
        },
        _count: { _all: true },
      }),
    ]);

    const corrected = grouped.reduce(
      (total, row) => total + row._count._all,
      0,
    );
    const correct = grouped.find((row) => row.isCorrect)?._count._all ?? 0;

    return {
      role: Role.TEACHER,
      totalExams,
      totalAverage: roundScore(averageResult._avg.score),
      hitRate: corrected ? Math.round((correct / corrected) * 100) : null,
    };
  }

  private async studentDashboard(userId: string) {
    const [finishedExams, upcomingExams, averageResult] = await Promise.all([
      this.prisma.examSession.count({
        where: { userId, status: SessionStatus.FINISHED },
      }),
      this.prisma.exam.count({
        where: {
          status: ExamStatus.PUBLISHED,
          assignments: {
            some: {
              class: {
                studentAssignments: { some: { userId, endedAt: null } },
              },
            },
          },
          sessions: { none: { userId, status: SessionStatus.FINISHED } },
        },
      }),
      this.prisma.examSession.aggregate({
        where: { userId, ...fullyGradedSession },
        _avg: { score: true },
      }),
    ]);
    
    return {
      role: Role.STUDENT,
      upcomingExams,
      finishedExams,
      totalAverage: roundScore(averageResult._avg.score),
    };
  }
}
