/**
 * Sondagem: o JACAD autentica o usuário final?
 *
 * A pergunta que decide o login do CPA. Se existir um endpoint que valide
 * RA + senha do aluno, o CPA delega a autenticação e ninguém precisa criar uma
 * segunda senha. Se não existir, a senha tem de ser local — e não há meio-termo
 * seguro: replicar o hash do JACAD seria copiar credencial de outro sistema,
 * o que é pior que ter duas senhas.
 *
 * O sinal que procuramos é a diferença entre:
 *   404 / 405  → a rota não existe
 *   400/401/422 → a rota existe e recusou a credencial de teste
 *
 * Não grava nada e não usa credencial real: manda um RA inexistente com senha
 * aleatória, para não arriscar bloquear a conta de ninguém por tentativas.
 */
import type { JacadClient } from './client.js';
import { dormir } from './client.js';

/** Caminhos plausíveis para login de usuário final. */
const CANDIDATOS_POST = [
  '/api/v1/auth/login',
  '/api/v1/auth/signin',
  '/api/v1/auth/autenticar',
  '/api/v1/auth/usuario',
  '/api/v1/controle-acesso/login',
  '/api/v1/controle-acesso/autenticar',
  '/api/v1/controle-acesso/usuarios/autenticar',
  '/api/v1/controle-acesso/usuarios/login',
  '/api/v1/basicos/usuarios/autenticar',
  '/api/v1/academico/alunos/autenticar',
];

/** Recursos do grupo controle-acesso, para mapear o que existe por lá. */
const CANDIDATOS_GET = [
  '/api/v1/controle-acesso/usuarios',
  '/api/v1/controle-acesso/perfis',
  '/api/v1/controle-acesso/permissoes',
  '/api/v1/controle-acesso/grupos',
  '/api/v1/controle-acesso/acessos',
];

/** Formatos de corpo que APIs brasileiras costumam aceitar. */
const CORPOS = [
  { usuario: '00000000000', senha: 'sondagem-cpa-nao-usar' },
  { login: '00000000000', senha: 'sondagem-cpa-nao-usar' },
  { ra: '00000000000', senha: 'sondagem-cpa-nao-usar' },
  { username: '00000000000', password: 'sondagem-cpa-nao-usar' },
  { email: 'sondagem@invalido.local', senha: 'sondagem-cpa-nao-usar' },
];

const existe = (s: number) => s !== 404 && s !== 405 && s !== 501;

export async function sondarLogin(j: JacadClient) {
  // Sem acesso à API, toda tentativa falha na autenticação e devolveria o
  // mesmo erro para todos os caminhos — o que pareceria "nenhum existe".
  // Concluir isso seria pior que não sondar.
  const conexao = await j.testarConexao();
  if (!conexao.ok) {
    console.log(`\n⛔ Sem acesso à API do JACAD (HTTP ${conexao.status}).`);
    console.log(`   ${conexao.mensagem}\n`);
    console.log('   A sondagem não roda assim: todo caminho responderia o mesmo erro,');
    console.log('   e a ausência de resposta NÃO significa que o endpoint não existe.');
    console.log('   Libere o IP no JACAD e rode de novo.\n');
    return;
  }

  console.log('── existe endpoint de login de usuário? ─────────────\n');
  console.log('  404/405 = rota não existe · 400/401/422 = existe e recusou\n');

  const achados: string[] = [];

  for (const caminho of CANDIDATOS_POST) {
    // Um corpo por caminho basta para saber se a ROTA existe.
    let status = 404;
    try {
      const r = await j.postBruto(caminho, CORPOS[0]);
      status = r.status;

      // Se a rota existe, vale descobrir qual formato de corpo ela aceita:
      // um 400 costuma trazer o nome do campo que faltou.
      if (existe(status)) {
        achados.push(caminho);
        console.log(`  ✅ ${caminho}  → HTTP ${status}`);
        if (r.corpo) console.log(`       ${r.corpo.replace(/\s+/g, ' ').slice(0, 220)}`);

        for (const corpo of CORPOS.slice(1)) {
          await dormir(j.sleepMs);
          const alt = await j.postBruto(caminho, corpo);
          if (alt.status !== status) {
            console.log(
              `       corpo ${Object.keys(corpo).join('+')} → HTTP ${alt.status} ${alt.corpo.replace(/\s+/g, ' ').slice(0, 140)}`,
            );
          }
        }
      } else {
        console.log(`  ✗  ${caminho}  → HTTP ${status}`);
      }
    } catch (e: any) {
      console.log(`  ✗  ${caminho}  → ${e.status ?? 'erro'}`);
    }
    await dormir(j.sleepMs);
  }

  console.log('\n── grupo controle-acesso ────────────────────────────\n');
  for (const caminho of CANDIDATOS_GET) {
    try {
      const r = await j.getBruto(caminho, { pageSize: 1 });
      if (existe(r.status)) {
        const campos = r.json?.elements?.[0] ? Object.keys(r.json.elements[0]).sort() : [];
        console.log(`  ✅ ${caminho}  → HTTP ${r.status}`);
        if (campos.length) console.log(`       campos: ${campos.join(', ').slice(0, 300)}`);
      } else {
        console.log(`  ✗  ${caminho}  → HTTP ${r.status}`);
      }
    } catch (e: any) {
      console.log(`  ✗  ${caminho}  → ${e.status ?? 'erro'}`);
    }
    await dormir(j.sleepMs);
  }

  console.log('\n─────────────────────────────────────────────────────');
  if (achados.length === 0) {
    console.log(
      '  Nenhum endpoint de login encontrado nos caminhos testados.\n' +
        '  Isso NÃO prova que não exista — só que não está nos nomes óbvios.\n' +
        '  Peça à Jacad a documentação de "autenticação de usuário final".',
    );
  } else {
    console.log(`  Candidatos reais: ${achados.join(', ')}`);
    console.log('  Confirme o contrato com a Jacad antes de ligar no login do CPA.');
  }
}
