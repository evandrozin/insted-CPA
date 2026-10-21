/**
 * Apoio à tela de docentes ambíguos.
 *
 * "Ambíguo" é um nome que o JACAD devolve com dois ou três perfis (CPFs
 * diferentes ou cadastros duplicados). O importador não escolhe sozinho: mandar
 * a avaliação de um professor para outra pessoa é o pior defeito possível aqui.
 * Estas funções só leem e formatam o que a conciliação guardou.
 */
import type { CandidatoDocente } from '@insted/jacad';

/** Domínio do endereço provisório que o sistema dá a quem não tem e-mail real. */
export const DOMINIO_PROVISORIO = 'sem-email.insted.local';

export const emailProvisorio = (idPerfil: number | string) =>
  `jacad-p-${idPerfil}@${DOMINIO_PROVISORIO}`;

/** Matrícula que o importador dá ao docente conciliado — a mesma que o link do portal usa. */
export const matriculaDoPerfil = (idPerfil: number | string) => `JACAD-P-${idPerfil}`;

/**
 * Lê o JSON de candidatos sem confiar nele: vem de uma coluna `Json`, e um
 * registro antigo ou editado à mão não pode derrubar a tela.
 */
export function lerCandidatos(valor: unknown): CandidatoDocente[] {
  if (!Array.isArray(valor)) return [];
  const lidos: CandidatoDocente[] = [];

  for (const x of valor) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const idPerfil = Number(o.idPerfil);
    if (!Number.isFinite(idPerfil)) continue;

    const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    lidos.push({
      idPerfil,
      nome: texto(o.nome) ?? '',
      cargo: texto(o.cargo),
      temEmail: o.temEmail === true,
      status: texto(o.status),
      // `undefined` quando o registro é anterior à carga dos dados — é o que
      // distingue "não carregado" de "o perfil não tem".
      email: 'email' in o ? texto(o.email) : undefined,
      cpf: 'cpf' in o ? texto(o.cpf) : undefined,
      dataNascimento: 'dataNascimento' in o ? texto(o.dataNascimento) : undefined,
    });
  }
  return lidos;
}

/** Algum candidato ainda sem os dados que permitem decidir. */
export const semDadosCarregados = (c: CandidatoDocente[]) =>
  c.some((x) => x.email === undefined && x.cpf === undefined);

/** `123.***.***-45` — o suficiente para conferir com a secretaria sem expor o número. */
export function mascararCpf(cpf: string | null | undefined): string {
  const d = (cpf ?? '').replace(/\D/g, '');
  if (d.length !== 11) return '—';
  return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
}

/** `1980-03-05` → `05/03/1980`. Texto que não é data sai como veio. */
export function dataBR(iso: string | null | undefined): string {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '—');
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** `AVANY CARDOSO LEAL` → `Avany Cardoso Leal`. */
export function tituloDoNome(nome: string): string {
  return nome
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1),
    )
    .join(' ');
}

/** O único candidato com e-mail entre vários — a sugestão mais forte que os dados dão. */
export function unicoComEmail(c: CandidatoDocente[]): number | null {
  if (c.length < 2) return null;
  const com = c.filter((x) => x.temEmail);
  return com.length === 1 ? com[0].idPerfil : null;
}
