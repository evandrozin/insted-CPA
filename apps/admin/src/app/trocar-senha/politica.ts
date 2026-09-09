/**
 * Política de senha do painel.
 *
 * Fora do arquivo de ações porque um módulo `'use server'` só exporta funções
 * async — e fora da tela porque a validação de verdade é a do servidor. Aqui
 * as duas leem o mesmo número: escrito em dois lugares, muda-se um, esquece-se
 * o outro, e o formulário passa a aceitar o que a ação recusa.
 */
export const MINIMO_SENHA = 8;
