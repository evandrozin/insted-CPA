-- AlterTable
ALTER TABLE "evaluation_tasks" ADD COLUMN     "loteId" TEXT;

-- AlterTable
ALTER TABLE "response_sets" ADD COLUMN     "loteId" TEXT,
ALTER COLUMN "submetidoEm" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "response_sets_loteId_idx" ON "response_sets"("loteId");
