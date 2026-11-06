import Image from 'next/image';
import { cicloDeEgressos } from '@/lib/egressos';

export const dynamic = 'force-dynamic';

/**
 * Agradecimento após o envio. Não tem como saber quem enviou (não há sessão):
 * a página é a mesma para qualquer visitante, e por isso não afirma nada além
 * de agradecer.
 */
export default async function EgressoConcluido() {
  const ciclo = await cicloDeEgressos().catch(() => null);

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <Image
        src="/logo-insted.png"
        alt="Insted"
        width={550}
        height={162}
        className="mx-auto h-8 w-auto"
        priority
      />

      <div className="mt-10 flex justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-teal/10 text-2xl text-brand-teal-hover">
          ✓
        </span>
      </div>

      <h1 className="mt-6 font-brand text-2xl font-bold tracking-tight text-brand-navy">
        Respostas enviadas
      </h1>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
        {ciclo?.mensagemConclusao ??
          'Obrigado por participar. Sua opinião ajuda a Insted a melhorar a formação de quem vem depois de você.'}
      </p>
    </div>
  );
}
