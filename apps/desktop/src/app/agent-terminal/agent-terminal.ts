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
  templateUrl: "./agent-terminal.html",
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
