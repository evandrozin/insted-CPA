-- CreateEnum
CREATE TYPE "Modalidade" AS ENUM ('PRESENCIAL', 'EAD', 'SEMIPRESENCIAL', 'NAO_INFORMADA');

-- AlterTable
ALTER TABLE "teaching_assignments" ADD COLUMN     "modalidade" "Modalidade" NOT NULL DEFAULT 'NAO_INFORMADA';

-- CreateTable
CREATE TABLE "evaluation_period_terms" (
    "periodId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "rotulo" TEXT,

    CONSTRAINT "evaluation_period_terms_pkey" PRIMARY KEY ("periodId","termId")
);

-- AddForeignKey
ALTER TABLE "evaluation_period_terms" ADD CONSTRAINT "evaluation_period_terms_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "evaluation_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_period_terms" ADD CONSTRAINT "evaluation_period_terms_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
