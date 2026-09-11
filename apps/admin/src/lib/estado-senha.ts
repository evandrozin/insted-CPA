/**
 * Estado devolvido pelas ações que geram senha provisória.
 *
 * A senha volta na PRÓPRIA resposta da ação, direto para a tela que pediu —
 * não é guardada em lugar nenhum. A versão anterior a guardava na memória do
 * servidor para mostrá-la depois de um redirecionamento, e na Vercel a página
 * seguinte podia cair em outra instância: a senha antiga deixava de valer e a
 * nova não aparecia. Uma conta de homologação chegou a ter quatro senhas
 * geradas sem que ninguém visse nenhuma.
 *
 * Fora dos arquivos de ação porque módulo `'use server'` só exporta função
 * async — e a tela e as ações precisam do mesmo tipo e do mesmo estado inicial.
 */
export type EstadoSenha = {
  /** Muda a cada resposta, para a janela reabrir mesmo com resultado igual. */
  n: number;
  senha?: string;
  nome?: string;
  email?: string;
  aviso?: string;
  erro?: string;
};

export const ESTADO_SENHA_INICIAL: EstadoSenha = { n: 0 };
