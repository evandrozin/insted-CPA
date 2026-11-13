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

/**
 * Endereço sob o qual o técnico é guardado quando o e-mail dele já pertence a
 * outra conta (um aluno, um docente, outro técnico).
 *
 * `users.email` é único e cada conta tem um papel só, mas os técnicos são
 * independentes: o mesmo e-mail pode ser de um aluno e de um técnico, ou de dois
 * técnicos que dividem a caixa do setor. Cada um vira uma conta, e as que não
 * ficam com o endereço puro levam `+tec`, `+tec2`, `+tec3`…
 * (`ana+tec@insted.edu.br`): o mesmo endereço para quem lê, diferente para o
 * banco. A pessoa nunca digita isso — em `/entrar/tecnico` ela informa o e-mail
 * de sempre, e a entrada procura toda a "família" de endereços.
 */
export function aliasTecnico(email: string, n = 1): string {
  const [local, dominio] = email.trim().toLowerCase().split('@');
  if (!dominio) return email;
  return `${local.split('+')[0]}+tec${n > 1 ? n : ''}@${dominio}`;
}

/** O e-mail puro e os endereços `+tec…` que podem guardar técnicos dele. */
export function familiaDeEmails(email: string, max = 10): string[] {
  const puro = email.trim().toLowerCase();
  const [local, dominio] = puro.split('@');
  if (!dominio) return [puro];
  return [`${local.split('+')[0]}@${dominio}`, ...Array.from({ length: max }, (_, i) => aliasTecnico(puro, i + 1))];
}

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
