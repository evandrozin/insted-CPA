-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "statusManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "modalidadePadrao" "Modalidade",
ADD COLUMN     "statusManual" BOOLEAN NOT NULL DEFAULT false;
