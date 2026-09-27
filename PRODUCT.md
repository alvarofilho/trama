# Trama

Especificação inicial do produto, baseada no escopo fornecido pelo usuário.

## Objetivo

Aplicação desktop para orquestrar agentes de IA no desenvolvimento de software. Gerencia projetos, tarefas, sessões, terminais e alterações Git, executando ferramentas externas como Codex CLI, Claude Code, OpenCode e Gemini.

Não desenvolve modelo próprio. O acesso aos modelos permanece sob responsabilidade de cada ferramenta.

## Princípios

- Reutilizar a autenticação nativa dos agentes; não exigir API Key quando o agente permitir usar a assinatura existente.
- Não implementar OAuth próprio para OpenAI ou Anthropic.
- Não armazenar senhas, cookies, access tokens, refresh tokens ou API Keys. As credenciais mantidas pelo próprio agente ficam sob responsabilidade dele.
- Oferecer ACP quando houver suporte adequado e PTY como alternativa para ferramentas interativas.
- Permitir escolher por tarefa entre um branch/worktree isolado e o repositório atual.
- Usar o Git instalado pelo usuário, por meio da CLI.
- Manter responsabilidades separadas desde o início, sem expandir o MVP com integrações futuras.

## Stack e escolhas abertas

Decisão: **Tauri 2** é a base do aplicativo desktop. A primeira implementação usa Angular 22 + TypeScript na interface e Rust nas integrações nativas.

Direção funcional mantida: SQLite, Git CLI e abstrações para ACP e PTY. O primeiro fluxo desktop seleciona um diretório, valida o repositório com Git e persiste projetos recentes em SQLite.

O suporte a sistemas operacionais da primeira versão ainda está aberto. A camada de terminal terá de lidar com ConPTY no Windows e PTY em Linux/macOS conforme o sistema suportado.

Primeira etapa atual: aplicativo desktop navegável com integrações locais incrementais. A interface demonstra o primeiro acesso sem projeto e agente configurados, cria tarefas pelo workspace e evolui junto das integrações reais.

Suporte futuro a Linux é desejável, mas ainda não é um requisito confirmado da primeira versão.

Compatibilidade de versões, protocolos, comandos de autenticação e assinaturas de cada agente precisa ser validada com a documentação oficial durante a implementação. Os exemplos de transporte são conceituais, não uma declaração de suporte atual.

## MVP

Fluxo central: repositório → tarefa (agente, modelo, esforço e isolamento) → agente → terminal → diff → commit → merge; worktree é opcional.

1. Abrir um repositório Git local.
2. Criar uma tarefa e escolher agente, modelo, esforço e se haverá worktree.
3. Detectar instalação e estado de autenticação do agente.
4. Permitir iniciar seu login nativo quando necessário.
5. Se escolhido, registrar a branch de origem e criar branch e worktree exclusivos.
6. Executar o agente no worktree ou diretamente no repositório, conforme a tarefa.
7. Permitir interação em terminal real e acompanhar o estado da sessão.
8. Listar arquivos alterados e mostrar diff.
9. Criar commit e integrar por merge na branch de origem.
10. Remover o worktree após a integração e quando não houver execução ou trabalho pendente que dependa dele.

Modelo e esforço são repassados pelos argumentos disponíveis no CLI escolhido. Quando o agente não expõe esforço pela linha de comando, o CLI mantém seu padrão.

O desenho deve permitir múltiplas tarefas isoladas. Executar automaticamente o mesmo pedido em vários agentes e comparar soluções fica para depois do MVP.

## Organização da solução

Ao criar o aplicativo Tauri, separar a interface das operações locais. A interface reúne projetos, tarefas, agentes, terminal, diff e configurações. A camada nativa coordena tarefas e sessões, persistência SQLite, provedores de agentes, Git CLI e terminal PTY/ConPTY. As regras de domínio devem ficar independentes da interface e da forma de execução de cada agente.

Essa é uma separação de responsabilidades, não uma estrutura de pastas já criada. A organização concreta será definida no projeto Tauri.

## Agentes e transportes

Uma abstração de `AgentProvider` expõe identificação, detecção de instalação, consulta de autenticação, início e parada de sessão. Provedores previstos: Codex, Claude Code, OpenCode e Gemini.

Uma abstração de `AgentTransport` representa a conexão com o agente. Implementações previstas: transporte ACP e transporte PTY. Selecionar o transporte por capacidade verificada do provedor, sem acoplar o restante da aplicação a uma ferramenta específica.

ACP é um protocolo entre cliente e agente, não uma API de modelo. Seu uso não determina a modalidade de autenticação ou cobrança do agente.

Execuções interativas exigem pseudo-terminal: ConPTY no Windows e PTY em Linux/macOS. Capturar apenas stdout/stderr não atende a esse requisito. Também será necessária uma visualização que interprete o terminal e encaminhe entrada e redimensionamento.

## Tarefas, sessões e estados

Uma sessão registra `Id`, `ProjectId`, `TaskId`, `AgentId`, `BaseBranch`, `Branch`, `WorktreePath` e `Status`.

Estados previstos:

- Starting
- Running
- Waiting
- Completed
- Failed
- Stopped

A implementação deve definir evidências para cada transição. Em PTY, silêncio de saída não prova espera por entrada, e encerramento do processo não prova que a tarefa foi concluída corretamente.

## Git e isolamento

Criar branch e worktree por tarefa e iniciar o agente no diretório correspondente. O worktree isola arquivos de trabalho; não constitui sandbox de segurança do processo.

Registrar a branch de origem para integração posterior. Antes de merge ou limpeza, verificar o estado real do Git e a existência de processos ativos. Conflitos devem ser apresentados ao usuário sem descartar alterações. Não executar limpeza destrutiva automaticamente.

LibGit2Sharp não será a dependência principal do MVP.

## Persistência

SQLite, com tabelas iniciais previstas:

```text
projects
tasks
agent_sessions
worktrees
terminal_sessions
agent_messages
task_events
settings
```

Eventos iniciais: `TASK_CREATED`, `WORKTREE_CREATED`, `AGENT_STARTED`, `AGENT_WAITING_INPUT`, `AGENT_COMPLETED`, `AGENT_FAILED`, `DIFF_CREATED` e `COMMIT_CREATED`. `PR_CREATED` pertence à futura integração de PRs.

Persistir metadados e eventos permite reconstruir o histórico após reiniciar. Retomar uma conversa nativa do agente ou manter um processo vivo após fechar a aplicação são capacidades distintas, ainda a definir. Na inicialização, reconciliar registros com processos e worktrees existentes.

Não tratar eventos como autorização para copiar credenciais. Política de retenção de mensagens e saída de terminal deverá respeitar o princípio de não armazenar segredos.

## Interface inicial

Cabeçalho com projeto e branch. Lista de tarefas à esquerda. Área principal com tarefa selecionada, agente, estado, branch, terminal e alterações. Diff acessível a partir dos arquivos alterados.

Tela de agentes apresenta instalação e autenticação verificadas e permite acionar login/logout nativos quando suportados. Não presumir conta conectada nem exibir dados de conta sem evidência do agente.

## Fora do MVP

Comparação de agentes, grafo detalhado de eventos por sessão, PR automático, GitHub/GitLab, Issues, Linear, Docker, SSH, WSL, MCP Manager, editor completo, browser integrado, cloud sync, mobile, CI/CD, kanban complexo, revisores e planejadores automáticos, execução automatizada de testes, automações, templates, recuperação avançada de sessão e execução remota.

Capturar um grafo real de prompts, chamadas de ferramenta, resultados, ações em arquivos e syscalls exigiria instrumentação específica por agente e sistema operacional. ACP ou PTY isoladamente não fornecem esse nível de observabilidade.

## Critério de validação

Validar com um repositório local e pelo menos um agente real: criar tarefa, autenticar pelo fluxo nativo, executar no worktree, interagir pelo terminal, inspecionar uma alteração, criar commit, realizar merge e remover o worktree sem perder trabalho. Provedores adicionais devem passar pelo mesmo fluxo antes de serem apresentados como funcionais.

## Próximas decisões

1. Sistemas operacionais da primeira versão e framework de interface.
2. Primeiro agente a integrar e transporte suportado por sua versão instalada.
3. Política ao fechar o aplicativo com sessões em execução.
4. Regras de conclusão, conflitos e limpeza de tarefas.
