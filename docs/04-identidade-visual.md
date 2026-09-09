# Identidade visual

A CPA não tem identidade própria: ela usa a do **Insted Hub Digital**
(`dev.insted.digital`). Os tokens abaixo foram extraídos de lá e mantêm os
**mesmos nomes**, para que um desenvolvedor que conhece um sistema encontre o
mesmo vocabulário no outro.

> Se a marca mudar, ela muda no Hub primeiro e este projeto acompanha.
> Não ajuste valores só neste repositório — isso cria dois sistemas divergentes.

## Paleta

| Token | Hex | Uso |
|---|---|---|
| `brand-teal` | `#00bfb2` | Cor primária: ações, links, destaques, estados positivos |
| `brand-teal-hover` | `#00998e` | Hover da primária |
| `brand-navy` | `#1a2d42` | Texto principal, títulos; borda a 10% (`brand-navy/10`) |
| `brand-blue` | `#5c88da` | Apoio |
| `brand-orange` | `#ff8200` | Atenção, avisos |
| `brand-yellow` | `#ffb600` | Alerta secundário |
| `brand-black` | `#2d2e30` | — |
| `brand-dark` | `#262626` | — |
| `brand-light` | `#f6f8fc` | Fundo da aplicação |
| `brand-white` | `#efefe8` | Branco quente institucional |

Para **neutros** (texto secundário, linhas, fundos de tabela) use a escala
`slate` padrão do Tailwind, como o Hub faz. Não crie tokens paralelos de cinza.

## Tipografia

| Papel | Família | Classe |
|---|---|---|
| Interface | **Inter** | padrão (`font-sans`) |
| Títulos e marca | **Raleway** | `font-brand` |

Ambas carregadas via `next/font/google` em [layout.tsx](../apps/admin/src/app/layout.tsx),
com `display: swap`. Raleway é a face da logo — use-a em `h1`/`h2`, não em texto corrido.

## Formas

| Elemento | Valor |
|---|---|
| Cards | `rounded-2xl` (16px) |
| Botões e inputs | `rounded-xl` (12px) |
| Bordas de card | `border-brand-navy/10` sobre fundo branco |

## Assinatura visual

O Hub marca os cards principais com uma faixa de 4px em gradiente
`brand-teal → brand-navy` no topo. Reproduzida aqui pela utility `brand-rule`
(definida em [globals.css](../apps/admin/src/app/globals.css)):

```tsx
<section className="relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
  <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
  …
</section>
```

Use com parcimônia — é o destaque de um card por tela, não um enfeite de todos.

## Logo

[`apps/admin/public/logo-insted.png`](../apps/admin/public/logo-insted.png) — 550×162, fundo transparente.

A logo é escura (o lettering "inst" é quase preto) e **só funciona sobre fundos
claros**. Se surgir uma tela de fundo navy — um cabeçalho invertido, uma capa de
relatório — peça a versão negativa ao setor de comunicação em vez de aplicar
filtros CSS na versão atual.

## Ícones

O Hub usa **lucide**. Quando o painel precisar de ícones, instale `lucide-react`
em vez de introduzir uma segunda biblioteca.

## Aplicação no app mobile

O Expo não usa Tailwind. Ao chegar a Fase 5, replique estes mesmos valores em
`apps/mobile/src/theme/` como constantes TypeScript, importando de
`packages/shared` se quiser uma fonte única — mas os hex acima continuam sendo
a referência.
