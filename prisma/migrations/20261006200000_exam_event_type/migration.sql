-- CreateEnum
CREATE TYPE "ExamEventType" AS ENUM ('PASTE', 'COPY', 'CUT', 'TAB_SWITCH', 'WINDOW_BLUR', 'CONTEXT_MENU');

-- AlterTable
ALTER TABLE "ExamEvent" ADD COLUMN "examQuestionId" TEXT;

-- Existing rows cannot be mapped to a question. The table is only used for new attempts.
DELETE FROM "ExamEvent";

-- AlterTable
ALTER TABLE "ExamEvent" ALTER COLUMN "type" TYPE "ExamEventType" USING "type"::"ExamEventType";
ALTER TABLE "ExamEvent" ALTER COLUMN "examQuestionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ExamEvent_examQuestionId_idx" ON "ExamEvent"("examQuestionId");

-- AddForeignKey
ALTER TABLE "ExamEvent" ADD CONSTRAINT "ExamEvent_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
