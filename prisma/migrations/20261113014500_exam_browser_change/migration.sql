-- AlterEnum
ALTER TYPE "ExamEventType" ADD VALUE 'BROWSER_CHANGE';

-- AlterTable
ALTER TABLE "ExamEvent" ALTER COLUMN "examQuestionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ExamSession" ADD COLUMN     "browserId" TEXT;
