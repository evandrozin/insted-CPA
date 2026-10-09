-- AlterEnum
ALTER TYPE "TargetType" ADD VALUE 'TURMA';

-- AlterTable
ALTER TABLE "response_sets" ADD COLUMN     "classId" TEXT;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_classId_fkey" FOREIGN KEY ("classId") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
