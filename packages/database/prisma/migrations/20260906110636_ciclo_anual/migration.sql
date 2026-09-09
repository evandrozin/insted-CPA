-- O ciclo da CPA passa a ser ANUAL: `ano` é a identidade do ciclo.
--
-- A coluna é obrigatória, mas já existem ciclos. Em vez de um default
-- arbitrário, o ano é derivado do semestre de referência de cada um — que é
-- exatamente o ano em que o ciclo foi aplicado.

-- 1. entra permitindo nulo, para poder preencher
ALTER TABLE "evaluation_periods" ADD COLUMN "ano" INTEGER;

-- 2. preenche a partir do semestre de referência
UPDATE "evaluation_periods" p
SET "ano" = t."ano"
FROM "academic_terms" t
WHERE t."id" = p."termId";

-- 3. rede de segurança: ciclo sem semestre válido cai no ano de abertura
UPDATE "evaluation_periods"
SET "ano" = EXTRACT(YEAR FROM "abreEm")::INTEGER
WHERE "ano" IS NULL;

-- 4. agora sim, obrigatório
ALTER TABLE "evaluation_periods" ALTER COLUMN "ano" SET NOT NULL;

-- CreateIndex
CREATE INDEX "evaluation_periods_ano_idx" ON "evaluation_periods"("ano");
