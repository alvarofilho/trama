---
name: Trama
description: Workspace de agentes em grafite e sálvia.
colors:
  bg: "#191c20"
  side: "#15171b"
  panel: "#1c1f24"
  raised: "#23272d"
  hover: "#2a2f36"
  line: "#30353d"
  text: "#e9ebed"
  muted: "#a0a7b1"
  subtle: "#777f8b"
  accent: "#b8d7ad"
  accent-ink: "#1c3120"
  green: "#a9d7b2"
  amber: "#e1bd7a"
  red: "#e3a0a1"
  blue: "#adc3e9"
  light-bg: "#fafbfc"
  light-side: "#eff1f3"
  light-panel: "#fff"
  light-raised: "#e9edf0"
  light-hover: "#dfe5e9"
  light-line: "#d5dade"
  light-text: "#242a31"
  light-muted: "#58616d"
  light-subtle: "#636d79"
  light-accent: "#365e3d"
  light-accent-ink: "#fff"
  light-green: "#2a6338"
  light-amber: "#805b15"
  light-red: "#a74347"
  light-blue: "#335f98"
typography:
  headline:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.025em"
  title:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "13px"
  terminal:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "12px"
    lineHeight: 1.65
  code:
    fontFamily: "Consolas, Courier New, monospace"
    fontSize: "11px"
    lineHeight: "25px"
rounded:
  small: "4px"
  control: "5px"
  surface: "6px"
  container: "7px"
spacing:
  compact: "8px"
  control: "12px"
  panel: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
---

# Design System: Trama

## Overview

**Creative North Star: "Workspace em grafite e sálvia"**

Superfícies foscas e densidade de ferramenta desktop mantêm tarefa, conversa e alterações próximas. O verde sálvia destaca ações e seleção sem competir com o conteúdo.

O primeiro acesso usa uma linha de três etapas que representa a sequência real — projeto, agente, workspace pronto. A tela dá destaque ao formulário atual; a próxima ação permanece evidente. A nova tarefa aparece em um diálogo dividido entre o pedido principal e a configuração de execução. Modelo e esforço ficam recolhidos como ajustes opcionais; o isolamento recomendado permanece visível.

Na revisão da área de tarefas, a navegação deixou de usar “Workspace” e “Central de tarefas” como conceitos genéricos. Tarefas e Agentes permanecem como destinos explícitos; o cartão do projeto atual concentra a abertura e a troca de repositórios, sem uma aba Projetos duplicada. A lateral mostra as tarefas recentes do projeto aberto. A tarefa selecionada ocupa diretamente a área principal, com estado, contexto e próxima ação. O grafo pertence à tarefa, em vez de competir com as áreas globais da navegação.

**Key Characteristics:**
- Superfícies de grafite separadas por tom e bordas discretas.
- Tipografia de sistema; monoespaçada para código, caminhos e registros técnicos.
- Estados acompanhados de texto, ícones e feedback visível.

Fonte visual atual: estilos globais em `apps/desktop/src/styles.css`, estilos de tela em `apps/desktop/src/app/**/*.css` e componentes Angular em `apps/desktop/src/app`. A marca e os ícones permanecem como vetores inline/componentizados.

## Colors

### Primary
Sálvia (`accent`) indica ação principal, foco, seleção de texto e guia ativo. `accent-ink` mantém o texto das ações separado do texto de superfície.

### Neutral
Grafite organiza fundo (`bg`), barra lateral (`side`), painéis (`panel`), campos destacados (`raised`) e hover. `line` separa regiões. `text`, `muted` e `subtle` estabelecem a hierarquia textual.

Verde informa execução, conclusão e adições; âmbar informa espera e arquivos modificados; vermelho informa falha e remoções; azul marca cabeçalhos de diff. As variantes `light-*` substituem os mesmos papéis no tema claro. A seleção de tarefa usa ainda fundos específicos por tema no CSS.

Contraste não foi verificado de forma abrangente: a análise automatizada ficou degradada. O documento registra valores existentes, sem afirmar conformidade de acessibilidade.

## Typography

Segoe UI, Arial e sans-serif formam a pilha de interface. O corpo base tem 13px; metadados geralmente usam 9–11px. Títulos de tarefa usam 25px; cabeçalhos de páginas de formulário, 28px. Títulos secundários usam 17px e 14px. Descrições de página limitam a largura a 65ch.

Consolas e fallbacks monoespaçados aparecem em diff, caminhos, estatísticas e registros técnicos. A conversa mantém a fonte de interface para leitura contínua. Não há fontes externas.

## Layout

A direção escolhida é **A · Tarefa em foco**: tarefas recentes à esquerda e a tarefa selecionada diretamente na área principal, sem uma central intermediária. A barra lateral mede 238px; Tarefas e Agentes ficam na navegação, enquanto o cartão do projeto atual abre a gestão de projetos. Nova tarefa usa diálogo de até 820px no desktop e uma coluna em larguras compactas; páginas gerais chegam a 1050px.

As alternativas B (lista ampla) e C (foco na tarefa com navegação compacta e abas) ficam registradas apenas como histórico de exploração. A direção ativa é o workspace desktop.

Abaixo de 1200px, a lateral passa a 210px e o cabeçalho empilha ações. Abaixo de 900px, terminal e diff ficam verticais. Abaixo de 620px, a navegação vira trilho de 64px, um seletor permite trocar tarefas e formulários usam uma coluna. Acima de 1600px, conteúdo e código ganham espaço. O aplicativo usa `100dvh`.

## Elevation & Depth

A profundidade vem de superfícies tonais e bordas de 1px. Sombras ficam no comparador de layouts e no toast; painéis de trabalho permanecem planos. Os valores e transições constam em `.impeccable/design.json`.

## Shapes

Controles têm cantos discretamente arredondados, predominantemente 5px; campos e botões compartilham essa forma. Blocos de conversa e avisos usam 6px; compositor e seletores, 7px. Pontos de estado são circulares. Ícones lineares pequenos reforçam ações e estados.

## Components

- **Botões:** ação principal preenchida de sálvia, secundária com borda. Hover muda o fundo em 140ms; foco visível usa contorno de 2px com afastamento de 3px. Desabilitados têm opacidade reduzida.
- **Campos:** superfície de painel e borda discreta; foco muda a borda para sálvia. Formulários usam labels e validação nativa de campos obrigatórios. No diálogo de nova tarefa, título e instruções lideram; agente e isolamento aparecem como decisões imediatas, enquanto modelo e esforço usam divulgação progressiva.
- **Navegação:** item ativo ganha superfície elevada. A tarefa selecionada tem tratamento verde discreto; busca filtra a lista, incluindo estado sem resultados.
- **Terminal:** conversa, registros, aviso de espera, compositor e aba de atividade. Enter envia; Shift+Enter quebra linha. Após integração ou remoção do worktree, o compositor fica desabilitado.
- **Diff:** lista selecionável de arquivos, sinais de adição/remoção, números de linha e bloco unificado ilustrativo. A revisão conduz a commit, merge e remoção simulados em etapas explícitas.
- **Grafo da sessão:** permanece como direção futura para eventos reais de tarefa; não é parte ativa do app desktop atual.
- **Estados:** Starting, Running, Waiting, Completed, Failed e Stopped orientam a linguagem do produto. Há estados sem tarefas, sem alterações, agente indisponível e feedback por toast com região de status.
- **Movimento:** transições curtas e pulsação discreta durante execução. `prefers-reduced-motion` desativa animações e transições.

## Do's and Don'ts

### Do:
- **Do** preservar o contexto da tarefa entre conversa e revisão.
- **Do** usar os tokens de tema e acompanhar cores de estado com texto ou sinais.
- **Do** deixar claro quando uma área ainda não tem integração real implementada.

### Don't:
- **Don't** apresentar autenticação, execução ou operações Git incompletas como fluxos finalizados.
- **Don't** declarar contraste ou acessibilidade integralmente validados sem nova verificação.
