/**
 * O IP público com que ESTE servidor sai para a internet — o que o JACAD enxerga.
 *
 * Não é o IP do Supabase nem o do banco: o JACAD só vê quem chama a API dele, e
 * quem chama é a função do painel. Em hospedagem serverless esse IP muda a cada
 * execução, o que torna "liberar o IP no JACAD" uma corrida que não se ganha;
 * a saída estável é rodar a importação de uma máquina de IP fixo (a sua, ou a
 * VPS). Mostrar o número serve para a CPA saber O QUE está sendo bloqueado.
 *
 * Pergunta a dois serviços, com prazo curto: um diagnóstico que demora mais que a
 * falha que ele explica só atrapalha.
 */
export async function ipDeSaida(): Promise<string | null> {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip']) {
    const ctrl = new AbortController();
    const prazo = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      const ip = (await r.text()).trim();
      // Só devolve o que parece mesmo um endereço — nunca eco de HTML de erro.
      if (r.ok && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip;
    } catch {
      /* tenta o próximo */
    } finally {
      clearTimeout(prazo);
    }
  }
  return null;
}
