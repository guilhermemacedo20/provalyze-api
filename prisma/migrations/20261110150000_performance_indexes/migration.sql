-- CreateIndex
CREATE INDEX "Question_userId_idx" ON "Question"("userId");

-- CreateIndex
CREATE INDEX "Question_themeId_idx" ON "Question"("themeId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_userId_idx" ON "TeacherAssignment"("userId");

-- CreateIndex
CREATE INDEX "TeacherAssignment_classId_idx" ON "TeacherAssignment"("classId");

-- CreateIndex
CREATE INDEX "StudentAssignment_userId_idx" ON "StudentAssignment"("userId");

-- CreateIndex
CREATE INDEX "StudentAssignment_classId_idx" ON "StudentAssignment"("classId");

-- CreateIndex
CREATE INDEX "ExamAssignment_classId_idx" ON "ExamAssignment"("classId");

-- CreateIndex
CREATE INDEX "Answer_examQuestionId_idx" ON "Answer"("examQuestionId");
