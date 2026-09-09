-- CreateEnum
CREATE TYPE "ConciliacaoStatus" AS ENUM ('CONCILIADO', 'AMBIGUO', 'NAO_ENCONTRADO', 'MANUAL');

-- AlterTable
ALTER TABLE "jacad_matricula_disciplinas" ADD COLUMN     "idDisciplinaProfessor" INTEGER;

-- CreateTable
CREATE TABLE "jacad_perfis" (
    "idPerfil" INTEGER NOT NULL,
    "nome" TEXT,
    "nomeImpressao" TEXT,
    "email" TEXT,
    "cpf" TEXT,
    "cargo" TEXT,
    "status" TEXT,
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_perfis_pkey" PRIMARY KEY ("idPerfil")
);

-- CreateTable
CREATE TABLE "jacad_docente_conciliacoes" (
    "nomeNormalizado" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "status" "ConciliacaoStatus" NOT NULL,
    "idPerfil" INTEGER,
    "email" TEXT,
    "cpf" TEXT,
    "candidatos" JSONB,
    "observacao" TEXT,
    "conciliadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_docente_conciliacoes_pkey" PRIMARY KEY ("nomeNormalizado")
);

-- CreateIndex
CREATE INDEX "jacad_perfis_nome_idx" ON "jacad_perfis"("nome");

-- CreateIndex
CREATE INDEX "jacad_docente_conciliacoes_status_idx" ON "jacad_docente_conciliacoes"("status");
