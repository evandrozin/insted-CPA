/**
 * Importar técnico-administrativos por planilha.
 *
 * Existe para cadastrar o quadro inteiro de uma vez em vez de um por um. O
 * técnico entra só com o e-mail (`/entrar/tecnico`), então o e-mail da
 * planilha é o dado que importa.
 */
import Link from 'next/link';
import { exigirPainel } from '@/lib/sessao';
import { ImportadorTecnicos } from '@/components/ImportadorTecnicos';

export const dynamic = 'force-dynamic';

export default async function ImportarTecnicos() {
  await exigirPainel();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <Link
        href="/cadastros/tecnicos"
        className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
      >
        ← Técnico-administrativo
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Cadastros
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Importar técnicos por planilha
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Cadastra vários colaboradores de uma vez. Antes de gravar, a tela mostra o que vai
          acontecer com cada linha.
        </p>
      </header>

      <section className="mt-6 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 text-sm text-slate-600">
        <p className="font-semibold text-brand-navy">Como preparar a planilha</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Uma linha por pessoa, com as colunas <strong>Nome</strong> e <strong>E-mail</strong>.{' '}
            <strong>Matrícula</strong> é opcional (em branco, o sistema gera uma interna).
          </li>
          <li>
            O <strong>e-mail é o acesso</strong> do técnico: sem ele a pessoa fica inativa. Relatórios
            do RH costumam trazer só código, nome e cargo — acrescente a coluna de e-mail se a tiver.
          </li>
          <li>
            Formatos: <strong>.xlsx</strong> ou <strong>.csv</strong>. Arquivo .xls antigo: abra no
            Excel e salve como .xlsx.
          </li>
          <li>
            Entram <strong>todas as linhas com nome</strong>. Sem e-mail (ou com e-mail inválido ou
            repetido), a pessoa entra <strong>inativa</strong>, e você informa o e-mail depois em{' '}
            <strong>Editar</strong> — a conta ativa sozinha.
          </li>
          <li>
            Se o e-mail já é de um aluno, docente ou da comissão, <strong>essa conta não é
            alterada</strong>: o técnico entra como uma conta à parte, guardada como{' '}
            <code className="font-mono text-xs">nome+tec@dominio</code>. A pessoa continua
            digitando o e-mail de sempre em <code className="font-mono text-xs">/entrar/tecnico</code>{' '}
            e responde como técnico; como aluno, segue pelo portal do aluno.
          </li>
          <li>Reenviar a mesma planilha não duplica ninguém: a matrícula reconhece quem já entrou.</li>
        </ul>
        <p className="mt-3">
          <a
            href="/cadastros/tecnicos/importar/modelo"
            className="font-semibold text-brand-teal hover:text-brand-teal-hover"
          >
            Baixar planilha-modelo (.csv) →
          </a>
        </p>
      </section>

      <ImportadorTecnicos />
    </div>
  );
}
