/**
 * Cliente HTTP para a API de Integração JACAD / SWA (Insted).
 *
 * Porta fiel do `app/Services/Jacad/JacadClient.php` do Insted Hub Digital —
 * mesmo fluxo, mesmos cabeçalhos, mesmo tratamento de 401.
 *
 * Fluxo de autenticação:
 *   POST /api/v1/auth/token   header `token: <chave de API>`  -> { token, expiresIn }
 *   demais chamadas           header `Authorization: <access token>`
 *
 * Atenção a duas armadilhas herdadas da API:
 *   1. O header de autorização NÃO usa o prefixo "Bearer".
 *   2. O rate limit é de 10 req/s por IP — daí a pausa entre páginas.
 */

export class JacadError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'JacadError';
  }
}

export type JacadConfig = {
  baseUrl: string;
  apiKey: string;
  pageSize?: number;
  timeoutMs?: number;
  /** Margem para renovar o token antes do expiresIn. */
  tokenSkewS?: number;
  sleepMs?: number;
};

/** Envelope de toda listagem paginada do JACAD. */
export type JacadPage<T> = {
  elements: T[];
  page?: { totalPages?: number; totalElements?: number; currentPage?: number };
};

export class JacadClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly pageSize: number;
  private readonly timeoutMs: number;
  private readonly tokenSkewS: number;
  readonly sleepMs: number;

  private accessToken?: string;
  private expiraEm = 0;

  constructor(cfg: JacadConfig) {
    if (!cfg.baseUrl) throw new JacadError('JACAD: base_url não configurada.');
    if (!cfg.apiKey) throw new JacadError('JACAD: token de API ausente (defina JACAD_TOKEN).');

    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.pageSize = cfg.pageSize ?? 200;
    this.timeoutMs = (cfg.timeoutMs ?? 60_000);
    this.tokenSkewS = cfg.tokenSkewS ?? 60;
    this.sleepMs = cfg.sleepMs ?? 150;
  }

  /** Autentica (ou reaproveita o token em memória, respeitando o skew). */
  async token(forcar = false): Promise<string> {
    if (!forcar && this.accessToken && Date.now() < this.expiraEm) return this.accessToken;

    const resp = await this.fetchComTimeout(`${this.baseUrl}/api/v1/auth/token`, {
      method: 'POST',
      headers: { token: this.apiKey, Accept: 'application/json' },
    });

    const corpo = await resp.text();
    if (!resp.ok) {
      throw new JacadError(
        `Falha ao autenticar no JACAD (HTTP ${resp.status}).`,
        resp.status,
        corpo,
      );
    }

    const json = safeJson(corpo);
    const token = json?.token;
    if (!token) throw new JacadError('Resposta de autenticação sem campo "token".', 200, corpo);

    const expiresIn = Number(json.expiresIn) || 1800;
    this.accessToken = token;
    this.expiraEm = Date.now() + Math.max(60, expiresIn - this.tokenSkewS) * 1000;

    return token;
  }

  /**
   * POST autenticado, devolvendo status e corpo sem lançar.
   *
   * Diferente do `get`, este não lança em erro HTTP: quem chama precisa
   * distinguir 404 (o endpoint não existe) de 401/422 (existe e recusou a
   * credencial) — é essa diferença que revela se o JACAD tem autenticação de
   * usuário final.
   */
  async postBruto(
    path: string,
    corpo: unknown,
    cabecalhos: Record<string, string> = {},
  ): Promise<{ status: number; corpo: string; json: any }> {
    const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const exec = async (tk: string) =>
      this.fetchComTimeout(url, {
        method: 'POST',
        headers: {
          Authorization: tk,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...cabecalhos,
        },
        body: JSON.stringify(corpo),
      });

    let resp = await exec(await this.token());
    if (resp.status === 401 && !cabecalhos.Authorization) {
      resp = await exec(await this.token(true));
    }

    const texto = await resp.text();
    return { status: resp.status, corpo: texto.slice(0, 400), json: safeJson(texto) };
  }

  /** GET que devolve o status em vez de lançar — para sondar existência. */
  async getBruto(path: string, query: Record<string, unknown> = {}): Promise<{ status: number; json: any }> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const resp = await this.fetchComTimeout(url.toString(), {
      headers: { Authorization: await this.token(), Accept: 'application/json' },
    });
    const texto = await resp.text();
    return { status: resp.status, json: safeJson(texto) };
  }

  /** GET autenticado. Renova o token uma vez em caso de 401. */
  async get<T = unknown>(path: string, query: Record<string, unknown> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const exec = async (tk: string) =>
      this.fetchComTimeout(url.toString(), {
        headers: { Authorization: tk, Accept: 'application/json' },
      });

    let resp = await exec(await this.token());
    if (resp.status === 401) resp = await exec(await this.token(true));

    const corpo = await resp.text();
    if (!resp.ok) {
      throw new JacadError(
        `Erro na chamada GET ${path} (HTTP ${resp.status}).`,
        resp.status,
        corpo.slice(0, 500),
      );
    }

    return safeJson(corpo) as T;
  }

  /**
   * Percorre uma listagem paginada inteira, respeitando o rate limit.
   * Emite cada página — o chamador grava em lote e nunca segura tudo em memória.
   */
  async *paginar<T>(
    path: string,
    query: Record<string, unknown> = {},
  ): AsyncGenerator<{ elements: T[]; pagina: number; totalPaginas: number }> {
    let pagina = 0;
    let totalPaginas: number | null = null;

    do {
      const resp = await this.get<JacadPage<T>>(path, {
        ...query,
        pageSize: this.pageSize,
        currentPage: pagina,
      });

      const elements = resp?.elements ?? [];
      totalPaginas ??= Number(resp?.page?.totalPages ?? 0);

      if (elements.length === 0) return;

      yield { elements, pagina, totalPaginas: Math.max(totalPaginas, 1) };

      pagina++;
      if (totalPaginas > 0 && pagina >= totalPaginas) return;

      await dormir(this.sleepMs);
    } while (true);
  }

  /** Diagnóstico do painel: testa a autenticação sem lançar. */
  async testarConexao(): Promise<{ ok: boolean; status: number; mensagem: string }> {
    try {
      await this.token(true);
      return { ok: true, status: 200, mensagem: 'Autenticação bem-sucedida.' };
    } catch (e) {
      const err = e as JacadError;
      return { ok: false, status: err.status ?? 0, mensagem: err.message };
    }
  }

  private async fetchComTimeout(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new JacadError(`Timeout de ${this.timeoutMs}ms em ${url}`);
      }
      throw new JacadError(`Falha de rede em ${url}: ${(e as Error).message}`);
    } finally {
      clearTimeout(t);
    }
  }
}

export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safeJson(texto: string): any {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Monta o cliente a partir do ambiente (+ overrides da tabela de parâmetros). */
export function clienteDoAmbiente(override: Partial<JacadConfig> = {}): JacadClient {
  return new JacadClient({
    baseUrl: process.env.JACAD_BASE_URL ?? 'https://insted-developer.jacad.com.br',
    apiKey: process.env.JACAD_TOKEN ?? '',
    pageSize: Number(process.env.JACAD_PAGE_SIZE) || 200,
    timeoutMs: (Number(process.env.JACAD_TIMEOUT) || 60) * 1000,
    sleepMs: Number(process.env.JACAD_SLEEP_MS) || 150,
    ...override,
  });
}

/**
 * Valida um token de acesso emitido pelo JACAD e devolve os dados do usuário.
 *
 * É a peça do SSO: o aluno chega ao CPA com um token gerado pelo portal (onde
 * ele já se autenticou com a senha do JACAD), e esta chamada diz quem ele é.
 *
 * Requer a permissão `service.api.integracao.auth.access.token.obter.dados`
 * no grupo "API de Integração" — sem ela o JACAD responde 403 e o SSO não
 * funciona. Ver docs/08-autenticacao-jacad.md.
 */
export async function validarAccessToken(
  cliente: JacadClient,
  accessToken: string,
): Promise<{ ok: boolean; status: number; dados: any; mensagem?: string }> {
  const r = await cliente.getBruto('/api/v1/auth/security/access-token', { accessToken });

  if (r.status === 403) {
    return {
      ok: false,
      status: 403,
      dados: null,
      mensagem:
        'O token de integração não tem a permissão para validar access-token. ' +
        'Peça à Jacad para habilitar service.api.integracao.auth.access.token.obter.dados.',
    };
  }
  if (r.status !== 200) {
    return { ok: false, status: r.status, dados: null, mensagem: 'Token inválido ou expirado.' };
  }
  return { ok: true, status: 200, dados: r.json };
}
