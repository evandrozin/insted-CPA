-- CreateEnum
CREATE TYPE "StatusModeracao" AS ENUM ('PENDENTE', 'APROVADO', 'OCULTO');

-- AlterTable
ALTER TABLE "answers" ADD COLUMN     "moderacao" "StatusModeracao" NOT NULL DEFAULT 'PENDENTE',
ADD COLUMN     "moderadoEm" TIMESTAMP(3),
ADD COLUMN     "moderadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "answers_moderacao_idx" ON "answers"("moderacao");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_moderadoPorId_fkey" FOREIGN KEY ("moderadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
