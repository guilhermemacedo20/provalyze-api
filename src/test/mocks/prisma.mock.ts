const model = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  groupBy: jest.fn(),
});

export const prismaMock = {
  user: model(),
  course: model(),
  subject: model(),
  class: model(),
  studentAssignment: model(),
  teacherAssignment: model(),
  theme: model(),
  question: model(),
  questionImage: model(),
  questionOption: model(),
  exam: model(),
  examQuestion: model(),
  examAssignment: model(),
  examSession: model(),
  answer: model(),
  examEvent: model(),
  pedagogicalReport: model(),
  auditEvent: model(),
  passwordResetToken: model(),
  $transaction: jest.fn(async (operations: unknown): Promise<any> => {
    if (typeof operations === 'function') {
      return operations(prismaMock);
    }
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    return operations;
  }),
  $queryRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};
