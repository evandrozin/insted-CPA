-- Corpo técnico-administrativo como papel de usuário.
--
-- O público já existia em FormAudience; o papel, não. Sem ele o questionário
-- do técnico-administrativo não tinha quem respondesse.
ALTER TYPE "Role" ADD VALUE 'TECNICO_ADMIN';
