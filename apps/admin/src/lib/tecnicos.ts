/**
 * Técnico cadastrado sem e-mail.
 *
 * `users.email` é obrigatório e único, e a planilha do RH nem sempre traz o
 * e-mail de todo mundo. Quem entra sem e-mail recebe um endereço de mentira num
 * domínio que não existe (`.invalid` é reservado e nunca resolve), derivado da
 * matrícula — assim não colide, e um segundo envio da mesma planilha reconhece a
 * pessoa em vez de duplicá-la.
 *
 * Esse endereço nunca vai para a tela como se fosse e-mail, e nunca abre acesso:
 * a conta nasce inativa e `/entrar/tecnico` o recusa.
 */
export const DOMINIO_SEM_EMAIL = 'sem-email.invalid';

export const semEmail = (email: string): boolean =>
  email.toLowerCase().endsWith(`@${DOMINIO_SEM_EMAIL}`);

/** E-mail provisório para a matrícula dada. */
export function emailSemEmail(matricula: string): string {
  const local = matricula
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `${local || 'tec'}@${DOMINIO_SEM_EMAIL}`;
}

/** Nome em forma de identificador, para a matrícula de quem não tem código. */
export function slugDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}
