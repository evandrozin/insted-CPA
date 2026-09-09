import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { respondenteAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export default async function Concluido({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  const task = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    include: { period: { select: { nome: true, mensagemConclusao: true } } },
  });

  if (!task || task.respondentId !== eu.id) notFound();

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
        Avaliação enviada
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        {task.period.mensagemConclusao ??
          'Obrigado por participar. Sua opinião ajuda a Insted a melhorar.'}
      </p>

      <p className="mt-6 rounded-2xl bg-white px-5 py-4 text-xs text-slate-500">
        Suas respostas foram registradas de forma anônima. A partir daqui, o sistema sabe que você
        participou, mas não tem como ligar nenhuma resposta a você.
      </p>

      <Link
        href="/minhas-avaliacoes"
        className="mt-8 inline-block rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
      >
        Voltar às minhas avaliações
      </Link>
    </div>
  );
}
