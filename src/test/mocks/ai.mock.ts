import { AIService } from 'src/infra/ai/ai.service';

export const aiMock = {
  suggestAnswerScore: jest.fn(),
  analyzeStudentThemes: jest.fn(),
  analyseClassTheme: jest.fn(),
} as unknown as AIService;
