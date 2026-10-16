-- CreateEnum
CREATE TYPE "ReportAnalysisType" AS ENUM ('PERFORMANCE', 'GAPS', 'BOTH');

-- CreateTable
CREATE TABLE "PedagogicalReport" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "analysisType" "ReportAnalysisType" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedagogicalReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PedagogicalReport_classId_createdAt_idx" ON "PedagogicalReport"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "PedagogicalReport_authorId_idx" ON "PedagogicalReport"("authorId");

-- AddForeignKey
ALTER TABLE "PedagogicalReport" ADD CONSTRAINT "PedagogicalReport_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedagogicalReport" ADD CONSTRAINT "PedagogicalReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
