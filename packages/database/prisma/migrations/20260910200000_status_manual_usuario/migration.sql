-- Decisão manual de status sobrevive à reimportação.
--
-- A promoção reescreve o status do aluno a cada rodada e o do docente sempre
-- que a conciliação resolve o nome. Sem esta marca, ativar alguém pelo painel
-- duraria até a próxima importação.
ALTER TABLE "users" ADD COLUMN "statusManual" BOOLEAN NOT NULL DEFAULT false;
