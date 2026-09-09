-- AlterTable
ALTER TABLE "teaching_assignments" ADD COLUMN     "edicaoManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "teacherOriginalId" TEXT;
