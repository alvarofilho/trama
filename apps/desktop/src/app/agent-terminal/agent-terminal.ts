import type { ElementRef } from "@angular/core";
import {
  afterRenderEffect,
  Component,
  computed,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AGENT_API } from "@app/core/agent-api";
import { type AgentSession, sessionLabels } from "@core/domain/agent";

@Component({
  selector: "app-agent-terminal",
  styleUrl: "./agent-terminal.scss",
  template: `
    <section class="agent-terminal-panel" aria-label="Terminal do agente">
      <div class="agent-terminal-heading">
        <div>
          <strong
            >{{ current().purpose === "task" ? current().agentId : "Terminal de autenticação" }} ·
            {{ labels[current().status] }}</strong
          ><small>{{
            current().purpose === "task"
              ? "Responda às perguntas e permissões diretamente no terminal."
              : "Clique nos links para abrir o navegador. Digite aqui se a ferramenta pedir uma resposta."
          }}</small>
        </div>
        <div class="page-actions">
          @if (prompt()) {
            <button
              class="secondary-button"
              [disabled]="current().status !== 'running'"
              (click)="insertPrompt()"
            >
              Inserir descrição
            </button>
          }
          @if (current().purpose === "task") {
            <button
              class="secondary-button"
              [disabled]="stopping() || current().status !== 'running'"
              (click)="stop()"
            >
              {{ stopping() ? "Interrompendo…" : "Interromper" }}
            </button>
          }
        </div>
      </div>
      @if (prompt()) {
        <p class="terminal-hint">
          Após concluir o login e aceitar a pasta no CLI, use “Inserir descrição” e pressione Enter
          para enviar a tarefa.
        </p>
      }
      @if (error() || current().error) {
        <p role="alert" class="task-error-text">{{ error() || current().error }}</p>
      }
      <div class="agent-terminal" #host></div>
      @if (current().exitCode !== null && current().purpose === "task") {
        <p class="terminal-hint">
          Código de saída: {{ current().exitCode }}. Revise as alterações antes de concluir a
          tarefa.
        </p>
      }
      <small class="terminal-hint">{{
        current().purpose === "task"
          ? "A saída fica apenas em memória. Fechar o Trama interrompe as sessões; iniciar novamente abre uma nova conversa."
          : "O Trama não salva esta saída. A autenticação é gerenciada pelo CLI."
      }}</small>
    </section>
  `,
})
export class AgentTerminal {
  readonly session = input.required<AgentSession>();
  readonly prompt = input("");
  private readonly api = inject(AGENT_API);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>("host");
  private readonly sessionId = computed(() => this.session().id);
  private readonly observed = signal<AgentSession | null>(null);
  readonly current = computed(() =>
    this.observed()?.id === this.session().id ? this.observed()! : this.session(),
  );

  readonly error = signal<string | null>(null);
  readonly stopping = signal(false);
  readonly labels = sessionLabels;
  private terminal?: Terminal;

  constructor() {
    afterRenderEffect((onCleanup) => {
      const id = this.sessionId();
      const host = this.host().nativeElement;
      let active = untracked(() => this.session().status === "running");
      let disposed = false;
      let cursor = 0;
      let timer: ReturnType<typeof setTimeout>;
      let writes = Promise.resolve();
      const term = new Terminal({
        cursorBlink: true,
        scrollback: 3000,
        fontSize: 13,
        theme: { background: "#111416", foreground: "#e2e8e5" },
      });
      const fit = new FitAddon();
      const report = (cause: unknown) => {
        if (!disposed) {
          this.error.set(String(cause));
        }
      };
      term.loadAddon(fit);
      term.loadAddon(
        new WebLinksAddon((_event, uri) => {
          if (!uri.startsWith("https://")) {
            report("Abra apenas links HTTPS de autenticação.");
            return;
          }
          void openUrl(uri).catch(() =>
            report("Não foi possível abrir este link. Copie o endereço e abra no navegador."),
          );
        }),
      );
      term.open(host);
      this.terminal = term;
      const resize = () => {
        if (disposed || !host.clientWidth) {
          return;
        }
        fit.fit();
        if (active) {
          void this.api
            .resize(
              id,
              Math.min(500, Math.max(2, term.cols)),
              Math.min(200, Math.max(2, term.rows)),
            )
            .catch(report);
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const subscription = term.onData((input) => {
        if (active) {
          writes = writes
            .then(() => (disposed ? undefined : this.api.write(id, input)))
            .catch(report);
        }
      });
      const poll = async () => {
        try {
          const output = await this.api.read(id, cursor);
          if (disposed) {
            return;
          }
          if (output.truncated) {
            term.reset();
            term.writeln("[Saída anterior descartada pelo limite de memória]");
          }
          if (output.data.length) {
            term.write(new Uint8Array(output.data));
          }
          cursor = output.cursor;
          active = output.session.status === "running";
          this.observed.set(output.session);
          timer = setTimeout(() => void poll(), active ? 120 : 1500);
        } catch (cause) {
          report(cause);
          if (!disposed) {
            timer = setTimeout(() => void poll(), 2000);
          }
        }
      };
      void poll();
      onCleanup(() => {
        disposed = true;
        clearTimeout(timer);
        observer.disconnect();
        subscription.dispose();
        this.terminal = undefined;
        term.dispose();
      });
    });
  }

  insertPrompt() {
    this.terminal?.paste(this.prompt());
    this.terminal?.focus();
  }

  async stop() {
    this.stopping.set(true);
    this.error.set(null);
    try {
      await this.api.stop(this.session().id);
    } catch (cause) {
      this.error.set(String(cause));
    } finally {
      this.stopping.set(false);
    }
  }
}
