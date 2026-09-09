-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTOR', 'PROFESSOR', 'ALUNO');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('MATUTINO', 'VESPERTINO', 'NOTURNO', 'INTEGRAL', 'EAD');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('RASCUNHO', 'AGENDADO', 'ABERTO', 'ENCERRADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "FormAudience" AS ENUM ('ALUNO', 'PROFESSOR', 'TECNICO_ADMIN');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('INSTITUICAO', 'INFRAESTRUTURA', 'DEPARTAMENTO', 'COORDENACAO', 'CURSO', 'DISCIPLINA', 'PROFESSOR_DISCIPLINA', 'AUTOAVALIACAO');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('LIKERT', 'ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA', 'TEXTO_LIVRE', 'SIM_NAO', 'NPS');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'DISPENSADA');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('USUARIOS', 'CURSOS', 'TURMAS', 'DISCIPLINAS', 'MATRICULAS', 'ALOCACOES_DOCENTES');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('ENFILEIRADA', 'ENVIADA', 'FALHOU', 'LIDA');

-- CreateEnum
CREATE TYPE "JacadRecurso" AS ENUM ('PERIODOS_LETIVOS', 'CURSOS', 'TURMAS', 'MATRICULAS', 'MATRICULA_DISCIPLINA');

-- CreateEnum
CREATE TYPE "JacadSyncStatus" AS ENUM ('EXECUTANDO', 'CONCLUIDO', 'FALHOU');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "cpf" TEXT,
    "senhaHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ATIVO',
    "avatarUrl" TEXT,
    "telefone" TEXT,
    "campusId" TEXT,
    "ultimoAcesso" TIMESTAMP(3),
    "senhaProvisoria" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletadoEm" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "device" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campi" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cidade" TEXT,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "campi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "descricao" TEXT,
    "gestorId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "grau" TEXT,
    "modalidade" TEXT,
    "duracaoSemestres" INTEGER,
    "campusId" TEXT,
    "coordenadorId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "cargaHoraria" INTEGER,
    "ementa" TEXT,
    "periodoGrade" INTEGER,
    "courseId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_terms" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "semestre" INTEGER NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_classes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "turno" "Shift" NOT NULL,
    "periodo" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "school_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "bloco" TEXT,
    "capacidade" INTEGER,
    "tipo" TEXT,
    "campusId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "roomId" TEXT,
    "papel" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_subjects" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "student_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_templates" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "publico" "FormAudience" NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "FormStatus" NOT NULL DEFAULT 'RASCUNHO',
    "snapshot" JSONB,
    "publicadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_blocks" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "repetivel" BOOLEAN NOT NULL DEFAULT false,
    "targetFiltro" JSONB,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "question_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "ajuda" TEXT,
    "tipo" "QuestionType" NOT NULL,
    "ordem" INTEGER NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "peso" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "condicao" JSONB,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "valor" INTEGER,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_periods" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "termId" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'RASCUNHO',
    "abreEm" TIMESTAMP(3) NOT NULL,
    "fechaEm" TIMESTAMP(3) NOT NULL,
    "publicaResultadosEm" TIMESTAMP(3),
    "minimoRespostasExibicao" INTEGER NOT NULL DEFAULT 5,
    "mensagemBoasVindas" TEXT,
    "mensagemConclusao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_forms" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "publico" "FormAudience" NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT true,
    "anonimo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "period_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_tasks" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "periodFormId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDENTE',
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_task_targets" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetRefId" TEXT,
    "rotulo" TEXT NOT NULL,
    "subtitulo" TEXT,
    "ordem" INTEGER NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "evaluation_task_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_sets" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "periodFormId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetRefId" TEXT,
    "courseId" TEXT,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "departmentId" TEXT,
    "respondentRole" "Role" NOT NULL,
    "respondentCourseId" TEXT,
    "respondentClassId" TEXT,
    "respondentPeriodo" INTEGER,
    "respondentTurno" "Shift",
    "anonimo" BOOLEAN NOT NULL DEFAULT true,
    "submetidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "responseSetId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valorNumerico" INTEGER,
    "valorTexto" TEXT,
    "valorBooleano" BOOLEAN,
    "naoSeAplica" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_options" (
    "answerId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "answer_options_pkey" PRIMARY KEY ("answerId","optionId")
);

-- CreateTable
CREATE TABLE "draft_answers" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "targetRefId" TEXT NOT NULL DEFAULT '__global__',
    "valor" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "tipo" "ImportKind" NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "arquivoUrl" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDENTE',
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "processadas" INTEGER NOT NULL DEFAULT 0,
    "sucesso" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "relatorioErros" JSONB,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodId" TEXT,
    "canal" "NotificationChannel" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "deepLink" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'ENFILEIRADA',
    "enviadaEm" TIMESTAMP(3),
    "lidaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregate_snapshots" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "escopoRefId" TEXT,
    "blockId" TEXT,
    "questionId" TEXT,
    "media" DECIMAL(5,2),
    "desvioPadrao" DECIMAL(5,2),
    "totalRespostas" INTEGER NOT NULL DEFAULT 0,
    "distribuicao" JSONB,
    "calculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregate_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jacad_periodos_letivos" (
    "idPeriodoLetivo" INTEGER NOT NULL,
    "descricao" TEXT,
    "ano" INTEGER,
    "semestre" INTEGER,
    "idOrg" INTEGER,
    "orgDescricao" TEXT,
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_periodos_letivos_pkey" PRIMARY KEY ("idPeriodoLetivo")
);

-- CreateTable
CREATE TABLE "jacad_cursos" (
    "idCursoBase" INTEGER NOT NULL,
    "nomeImpressao" TEXT,
    "nomeReduzido" TEXT,
    "codigoCurso" TEXT,
    "modalidade" TEXT,
    "grau" TEXT,
    "idOrg" INTEGER,
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_cursos_pkey" PRIMARY KEY ("idCursoBase")
);

-- CreateTable
CREATE TABLE "jacad_turmas" (
    "idTurma" INTEGER NOT NULL,
    "nome" TEXT,
    "nomeReduzido" TEXT,
    "idCurso" INTEGER,
    "curso" TEXT,
    "idMatriz" INTEGER,
    "matriz" TEXT,
    "idPeriodoLetivo" INTEGER,
    "periodoLetivo" TEXT,
    "idUnidadeFisica" INTEGER,
    "unidadeFisica" TEXT,
    "turno" TEXT,
    "periodoItem" TEXT,
    "periodoNumero" INTEGER,
    "status" TEXT,
    "idOrg" INTEGER,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "qtdeDisciplina" INTEGER,
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_turmas_pkey" PRIMARY KEY ("idTurma")
);

-- CreateTable
CREATE TABLE "jacad_matriculas" (
    "idMatricula" INTEGER NOT NULL,
    "idTurma" INTEGER,
    "idPeriodoLetivo" INTEGER,
    "idAluno" INTEGER,
    "idPerfilAluno" INTEGER,
    "idAlunoCursoIngresso" INTEGER,
    "aluno" TEXT,
    "ra" TEXT,
    "alunoEmail" TEXT,
    "alunoEmailInstitucional" TEXT,
    "idCursoBase" INTEGER,
    "curso" TEXT,
    "turma" TEXT,
    "idCursoMatriz" INTEGER,
    "matriz" TEXT,
    "status" TEXT,
    "idUnidadeFisica" INTEGER,
    "unidadeFisica" TEXT,
    "idOrg" INTEGER,
    "organizacao" TEXT,
    "dataMatricula" TIMESTAMP(3),
    "dataAtivacao" TIMESTAMP(3),
    "dataTrancamento" TIMESTAMP(3),
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_matriculas_pkey" PRIMARY KEY ("idMatricula")
);

-- CreateTable
CREATE TABLE "jacad_matricula_disciplinas" (
    "idMatriculaDisciplina" INTEGER NOT NULL,
    "idMatricula" INTEGER NOT NULL,
    "idAluno" INTEGER,
    "idPerfilAluno" INTEGER,
    "idPeriodoLetivo" INTEGER,
    "idCursoBase" INTEGER,
    "disciplina" TEXT,
    "professor" TEXT,
    "turma" TEXT,
    "modulo" TEXT,
    "statusDisciplina" TEXT,
    "statusMatricula" TEXT,
    "raw" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jacad_matricula_disciplinas_pkey" PRIMARY KEY ("idMatriculaDisciplina")
);

-- CreateTable
CREATE TABLE "jacad_sync_logs" (
    "id" TEXT NOT NULL,
    "recurso" "JacadRecurso" NOT NULL,
    "referencia" TEXT,
    "status" "JacadSyncStatus" NOT NULL DEFAULT 'EXECUTANDO',
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "paginas" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "mensagem" TEXT,
    "iniciadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "jacad_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_settings" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "usuario" TEXT,
    "pageSize" INTEGER NOT NULL DEFAULT 200,
    "sleepMs" INTEGER NOT NULL DEFAULT 150,
    "timeoutS" INTEGER NOT NULL DEFAULT 60,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_matricula_key" ON "users"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_campusId_idx" ON "users"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "campi_sigla_key" ON "campi"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "departments_sigla_key" ON "departments"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "courses_codigo_key" ON "courses"("codigo");

-- CreateIndex
CREATE INDEX "courses_campusId_idx" ON "courses"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_codigo_key" ON "subjects"("codigo");

-- CreateIndex
CREATE INDEX "subjects_courseId_idx" ON "subjects"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_codigo_key" ON "academic_terms"("codigo");

-- CreateIndex
CREATE INDEX "school_classes_courseId_termId_idx" ON "school_classes"("courseId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "school_classes_codigo_termId_key" ON "school_classes"("codigo", "termId");

-- CreateIndex
CREATE INDEX "enrollments_classId_idx" ON "enrollments"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_studentId_classId_key" ON "enrollments"("studentId", "classId");

-- CreateIndex
CREATE INDEX "teaching_assignments_classId_termId_idx" ON "teaching_assignments"("classId", "termId");

-- CreateIndex
CREATE INDEX "teaching_assignments_teacherId_termId_idx" ON "teaching_assignments"("teacherId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_teacherId_subjectId_classId_termId_key" ON "teaching_assignments"("teacherId", "subjectId", "classId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "student_subjects_studentId_assignmentId_key" ON "student_subjects"("studentId", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_nome_versao_key" ON "form_templates"("nome", "versao");

-- CreateIndex
CREATE INDEX "question_blocks_formId_idx" ON "question_blocks"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "question_blocks_formId_ordem_key" ON "question_blocks"("formId", "ordem");

-- CreateIndex
CREATE INDEX "questions_blockId_idx" ON "questions"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "questions_blockId_ordem_key" ON "questions"("blockId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_questionId_ordem_key" ON "question_options"("questionId", "ordem");

-- CreateIndex
CREATE INDEX "evaluation_periods_status_abreEm_fechaEm_idx" ON "evaluation_periods"("status", "abreEm", "fechaEm");

-- CreateIndex
CREATE UNIQUE INDEX "period_forms_periodId_formId_key" ON "period_forms"("periodId", "formId");

-- CreateIndex
CREATE INDEX "evaluation_tasks_respondentId_status_idx" ON "evaluation_tasks"("respondentId", "status");

-- CreateIndex
CREATE INDEX "evaluation_tasks_periodId_status_idx" ON "evaluation_tasks"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_tasks_periodFormId_respondentId_key" ON "evaluation_tasks"("periodFormId", "respondentId");

-- CreateIndex
CREATE INDEX "evaluation_task_targets_taskId_idx" ON "evaluation_task_targets"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_task_targets_taskId_blockId_targetRefId_key" ON "evaluation_task_targets"("taskId", "blockId", "targetRefId");

-- CreateIndex
CREATE INDEX "response_sets_periodId_targetType_idx" ON "response_sets"("periodId", "targetType");

-- CreateIndex
CREATE INDEX "response_sets_periodId_teacherId_idx" ON "response_sets"("periodId", "teacherId");

-- CreateIndex
CREATE INDEX "response_sets_periodId_courseId_idx" ON "response_sets"("periodId", "courseId");

-- CreateIndex
CREATE INDEX "response_sets_blockId_idx" ON "response_sets"("blockId");

-- CreateIndex
CREATE INDEX "answers_questionId_idx" ON "answers"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_responseSetId_questionId_key" ON "answers"("responseSetId", "questionId");

-- CreateIndex
CREATE INDEX "draft_answers_taskId_idx" ON "draft_answers"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_answers_taskId_questionId_targetRefId_key" ON "draft_answers"("taskId", "questionId", "targetRefId");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "notifications_userId_status_idx" ON "notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidadeId_idx" ON "audit_logs"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "audit_logs_criadoEm_idx" ON "audit_logs"("criadoEm");

-- CreateIndex
CREATE INDEX "aggregate_snapshots_periodId_escopo_idx" ON "aggregate_snapshots"("periodId", "escopo");

-- CreateIndex
CREATE UNIQUE INDEX "aggregate_snapshots_periodId_escopo_escopoRefId_blockId_que_key" ON "aggregate_snapshots"("periodId", "escopo", "escopoRefId", "blockId", "questionId");

-- CreateIndex
CREATE INDEX "jacad_periodos_letivos_ano_semestre_idx" ON "jacad_periodos_letivos"("ano", "semestre");

-- CreateIndex
CREATE INDEX "jacad_turmas_idPeriodoLetivo_status_idx" ON "jacad_turmas"("idPeriodoLetivo", "status");

-- CreateIndex
CREATE INDEX "jacad_turmas_idCurso_idx" ON "jacad_turmas"("idCurso");

-- CreateIndex
CREATE INDEX "jacad_matriculas_idPeriodoLetivo_status_idx" ON "jacad_matriculas"("idPeriodoLetivo", "status");

-- CreateIndex
CREATE INDEX "jacad_matriculas_idTurma_idx" ON "jacad_matriculas"("idTurma");

-- CreateIndex
CREATE INDEX "jacad_matriculas_ra_idx" ON "jacad_matriculas"("ra");

-- CreateIndex
CREATE INDEX "jacad_matricula_disciplinas_idMatricula_idx" ON "jacad_matricula_disciplinas"("idMatricula");

-- CreateIndex
CREATE INDEX "jacad_matricula_disciplinas_idPeriodoLetivo_idx" ON "jacad_matricula_disciplinas"("idPeriodoLetivo");

-- CreateIndex
CREATE INDEX "jacad_matricula_disciplinas_professor_idx" ON "jacad_matricula_disciplinas"("professor");

-- CreateIndex
CREATE INDEX "jacad_sync_logs_recurso_iniciadoEm_idx" ON "jacad_sync_logs"("recurso", "iniciadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "integration_settings_nome_key" ON "integration_settings"("nome");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_coordenadorId_fkey" FOREIGN KEY ("coordenadorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "school_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "school_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subjects" ADD CONSTRAINT "student_subjects_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "teaching_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_blocks" ADD CONSTRAINT "question_blocks_formId_fkey" FOREIGN KEY ("formId") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "question_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_forms" ADD CONSTRAINT "period_forms_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "evaluation_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_forms" ADD CONSTRAINT "period_forms_formId_fkey" FOREIGN KEY ("formId") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_tasks" ADD CONSTRAINT "evaluation_tasks_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "evaluation_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_tasks" ADD CONSTRAINT "evaluation_tasks_periodFormId_fkey" FOREIGN KEY ("periodFormId") REFERENCES "period_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_tasks" ADD CONSTRAINT "evaluation_tasks_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_task_targets" ADD CONSTRAINT "evaluation_task_targets_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "evaluation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "evaluation_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_periodFormId_fkey" FOREIGN KEY ("periodFormId") REFERENCES "period_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_respondentCourseId_fkey" FOREIGN KEY ("respondentCourseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_sets" ADD CONSTRAINT "response_sets_respondentClassId_fkey" FOREIGN KEY ("respondentClassId") REFERENCES "school_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_responseSetId_fkey" FOREIGN KEY ("responseSetId") REFERENCES "response_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_options" ADD CONSTRAINT "answer_options_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_options" ADD CONSTRAINT "answer_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_answers" ADD CONSTRAINT "draft_answers_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "evaluation_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_answers" ADD CONSTRAINT "draft_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "evaluation_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

