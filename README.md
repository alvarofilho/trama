# Trama

Aplicativo desktop experimental para organizar tarefas de desenvolvimento executadas com agentes de IA em repositórios Git locais.

> [!IMPORTANT]
> O Trama é um projeto pessoal, em desenvolvimento e criado com uso intensivo de inteligência artificial. Ele serve como ambiente de experimentação e aprendizado, não como um produto pronto para uso em produção. Funcionalidades, formatos de dados e decisões de arquitetura podem mudar sem aviso.

## Sobre o projeto

O Trama explora uma forma visual de coordenar ferramentas como Codex CLI, Claude Code, OpenCode e Gemini CLI sem substituir seus fluxos nativos. A proposta é reunir, em um único aplicativo, o contexto que normalmente fica espalhado entre terminais, branches e worktrees:

- abertura e histórico de repositórios Git locais;
- criação de tarefas associadas a um agente, modelo e nível de esforço;
- isolamento opcional de cada tarefa com branch e Git worktree próprios;
- detecção dos CLIs instalados e uso da autenticação mantida por cada ferramenta;
- execução interativa em terminal real por PTY/ConPTY;
- acompanhamento do estado da tarefa e da sessão do agente;
- evolução futura do fluxo de diff, commit, merge e limpeza do worktree.

O Trama não desenvolve nem hospeda modelos de IA. Cada agente continua responsável por sua própria instalação, autenticação, assinatura, limites e comportamento.

## Estado atual

O projeto está em estágio inicial e algumas partes do fluxo ainda são experimentais ou incompletas. Hoje, a implementação desktop permite abrir e persistir projetos locais, criar tarefas isoladas, detectar e configurar CLIs de agentes e executar sessões interativas no terminal.

Os fluxos completos de diff, commit, merge, retomada automática de conversas e transporte ACP ainda não estão finalizados. OpenCode e Gemini também precisam de validação ponta a ponta em ambientes com esses CLIs instalados.

Não há garantia de estabilidade, compatibilidade, suporte ou preservação de dados entre versões. Antes de testar o aplicativo, use um repositório com backup e confira as alterações do Git manualmente.

## Como funciona

O fluxo pretendido para o MVP é:

```text
repositório → tarefa → branch/worktree → agente → terminal → diff → commit → merge
```

Um worktree separa os arquivos de uma tarefa, mas não funciona como sandbox de segurança. O agente executado continua tendo as permissões do usuário no sistema operacional. O Trama não copia credenciais entre ferramentas e não deve armazenar senhas, cookies, tokens ou chaves de API dos agentes.

## Tecnologias

- [Tauri 2](https://tauri.app/) para o aplicativo desktop;
- [Angular 22](https://angular.dev/) e TypeScript para a interface;
- Rust para integrações nativas;
- SQLite para persistência local;
- Git CLI para operações no repositório;
- xterm.js e PTY/ConPTY para sessões interativas.

## Executar localmente

O desenvolvimento atual é feito principalmente no Windows. Você precisará de:

- Node.js 24.15 ou superior compatível com o projeto;
- Rust com o toolchain MSVC;
- Microsoft C++ Build Tools;
- WebView2;
- Git instalado e disponível no `PATH`.

Na raiz do repositório:

```powershell
cd apps/desktop
npm install
npm run tauri dev
```

Para compilar e executar os testes automatizados:

```powershell
cd apps/desktop
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Consulte o [README do aplicativo desktop](apps/desktop/README.md) para detalhes sobre pré-requisitos, agentes, autenticação, terminal e validação.

## Estrutura do repositório

- [`PRODUCT.md`](PRODUCT.md): visão do produto, princípios, escopo e decisões do MVP;
- [`DESIGN.md`](DESIGN.md): direção visual e decisões de interface;
- [`apps/desktop`](apps/desktop): interface Angular e aplicação Tauri/Rust.

## Inteligência artificial e contribuições

Este repositório é também um experimento sobre desenvolvimento de software assistido por IA. Parte relevante da análise, do design, da documentação e do código foi produzida ou revisada com auxílio de agentes de inteligência artificial, sempre sob direção humana.

Por ser um projeto pessoal e exploratório, não existe neste momento um processo formal para contribuições externas. Issues e sugestões podem ser úteis como feedback, mas não há compromisso de resposta, implementação ou suporte.

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [`LICENSE`](LICENSE) para conhecer os termos.
