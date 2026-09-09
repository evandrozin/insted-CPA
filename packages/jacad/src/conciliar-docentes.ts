/**
 * Conciliação de docentes: nome em texto → cadastro real (idPerfil, e-mail, CPF).
 *
 * `matricula-disciplina` só devolve o NOME do professor. Sem e-mail, o docente
 * não entra no sistema — não vê o próprio relatório nem responde a
 * autoavaliação. `/basicos/perfis?search=<nome>` devolve o cadastro da pessoa e
 * fecha essa lacuna.
 *
 * O resultado fica registrado em `jacad_docente_conciliacoes` com o status de
 * cada nome, em vez de ser aplicado às cegas: um nome ambíguo é uma decisão
 * humana, não um palpite do importador.
 */
import type { PrismaClient, ConciliacaoStatus } from '@prisma/client';
import type { JacadClient } from './client.js';
import { dormir } from './client.js';

type Progresso = (msg: string) => void;

export type ResultadoConciliacao = {
  total: number;
  conciliados: number;
  ambiguos: number;
  naoEncontrados: number;
  semEmail: number;
};

/** Mesma normalização usada na promoção — mantenha as duas em sincronia. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export class ConciliadorDocentes {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jacad: JacadClient,
    private readonly onProgresso: Progresso = () => {},
  ) {}

  async conciliar(idPeriodoLetivo?: number): Promise<ResultadoConciliacao> {
    const linhas = await this.prisma.jacadMatriculaDisciplina.findMany({
      where: {
        professor: { not: null },
        ...(idPeriodoLetivo ? { idPeriodoLetivo } : {}),
      },
      select: { professor: true },
      distinct: ['professor'],
    });

    const nomes = [...new Set(linhas.map((l) => l.professor!).filter(Boolean))].sort();
    const r: ResultadoConciliacao = {
      total: nomes.length,
      conciliados: 0,
      ambiguos: 0,
      naoEncontrados: 0,
      semEmail: 0,
    };

    if (nomes.length === 0) {
      this.onProgresso('Nenhum professor em staging. Rode "sync disciplinas" antes.');
      return r;
    }

    this.onProgresso(`Conciliando ${nomes.length} docentes contra /basicos/perfis...\n`);

    for (const [i, nome] of nomes.entries()) {
      const resp = await this.jacad.get<any>('/api/v1/basicos/perfis', {
        search: nome,
        pageSize: 10,
        currentPage: 0,
      });

      const candidatos = (resp?.elements ?? []) as any[];
      const alvo = normalizarNome(nome);

      // `search` é abrangente; confirmamos pelo nome exato normalizado.
      const exatos = candidatos.filter((p) => normalizarNome(String(p.nome ?? '')) === alvo);

      let status: ConciliacaoStatus;
      let escolhido: any = null;

      if (exatos.length === 1) {
        status = 'CONCILIADO';
        escolhido = exatos[0];
        r.conciliados++;
        if (!escolhido.email) r.semEmail++;
      } else if (exatos.length > 1) {
        status = 'AMBIGUO';
        r.ambiguos++;
      } else {
        status = 'NAO_ENCONTRADO';
        r.naoEncontrados++;
      }

      const dados = {
        nomeOriginal: nome,
        status,
        idPerfil: escolhido?.idPerfil ?? null,
        email: escolhido?.email ? String(escolhido.email).trim().toLowerCase() : null,
        cpf: escolhido?.cpf ? String(escolhido.cpf).replace(/\D/g, '') : null,
        // Guardamos os candidatos do caso ambíguo para a decisão no painel —
        // só o mínimo necessário para distinguir as pessoas.
        candidatos:
          status === 'AMBIGUO'
            ? exatos.map((p) => ({
                idPerfil: p.idPerfil,
                nome: p.nome,
                cargo: p.cargo ?? null,
                temEmail: Boolean(p.email),
                status: p.status ?? null,
              }))
            : undefined,
        conciliadoEm: new Date(),
      };

      await this.prisma.jacadDocenteConciliacao.upsert({
        where: { nomeNormalizado: alvo },
        create: { nomeNormalizado: alvo, ...dados },
        // MANUAL é decisão humana: a re-execução não a sobrescreve.
        update: await this.preservarManual(alvo, dados),
      });

      if ((i + 1) % 25 === 0 || i === nomes.length - 1) {
        this.onProgresso(
          `  ${i + 1}/${nomes.length} · ${r.conciliados} ok · ${r.ambiguos} ambíguos · ${r.naoEncontrados} não encontrados`,
        );
      }
      await dormir(this.jacad.sleepMs);
    }

    return r;
  }

  /** Uma conciliação resolvida à mão não é desfeita por uma nova varredura. */
  private async preservarManual(nomeNormalizado: string, dados: Record<string, unknown>) {
    const atual = await this.prisma.jacadDocenteConciliacao.findUnique({
      where: { nomeNormalizado },
      select: { status: true },
    });
    return atual?.status === 'MANUAL' ? {} : dados;
  }
}
