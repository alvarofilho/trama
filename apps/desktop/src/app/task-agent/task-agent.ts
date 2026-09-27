import { Component, computed, inject, input, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { AgentState } from "@app/core/agent-state";
import { AgentTerminal } from "../agent-terminal/agent-terminal";
import { type AgentId, sessionLabels } from "@core/domain/agent";
import type { Task } from "@core/domain/task";

@Component({
  selector: "app-task-agent",
  imports: [AgentTerminal, DatePipe],
  styleUrl: "./task-agent.scss",
  template: `
    <section class="task-agent-workspace">
      @if (current(); as session) {
        <div class="session-toolbar">
          <label class="session-picker">
            <span>Sessão</span>
            <select #picker [value]="session.id" (change)="selected.set(picker.value)">
              @for (item of own(); track item.id) {
                <option [value]="item.id">
                  {{ item.agentId }} · {{ labels[item.status] }} ·
                  {{ item.startedAt | date: "dd/MM HH:mm" }}
                </option>
              }
            </select>
          </label>
          <button class="secondary-button compact" (click)="expanded.set(!expanded())">
            {{ expanded() ? "Recolher terminal" : "Abrir terminal" }}
          </button>
        </div>
        @if (expanded()) {
          @defer (on immediate) {
            <app-agent-terminal [session]="session" [prompt]="task().prompt" />
          }
        } @else {
          <div class="session-paused">
            <span class="agent-glyph" aria-hidden="true"></span>
            <strong>{{ labels[(running() ?? session).status] }}</strong>
            <p>A sessão continua disponível. Abra o terminal para acompanhar ou interagir.</p>
            <button class="secondary-button" (click)="expanded.set(true)">Abrir terminal</button>
          </div>
        }
      } @else {
        <div class="session-empty">
          <span class="agent-glyph" aria-hidden="true"></span>
          <strong>Inicie uma conversa</strong>
          <p>Escolha um agente para trabalhar nesta tarefa.</p>
        </div>
      }

      <div class="task-agent-controls">
        <label>
          <span>Agente</span>
          <select
            #agent
            [value]="choice()"
            [disabled]="!!running() || busy()"
            (change)="choose(agent.value)"
          >
            @for (item of state.agents(); track item.id) {
              <option [value]="item.id" [disabled]="!item.installed">
                {{ item.name }}{{ item.installed ? "" : " · Não instalado" }}
              </option>
            } @empty {
              <option value="">Verificando agentes…</option>
            }
          </select>
        </label>
        <button
          class="primary-button"
          [disabled]="task().status !== 'ready' || !installedChoice() || busy() || !!running()"
          (click)="start()"
        >
          {{ busy() ? "Iniciando…" : own().length ? "Nova sessão" : "Iniciar agente" }}
        </button>
      </div>
      @if (!installed().length) {
        <p class="terminal-hint">Abra Agentes para verificar a instalação dos CLIs.</p>
      }
    </section>
  `,
})
export class TaskAgent {
  readonly task = input.required<Task>();
  readonly projectPath = input.required<string>();
  readonly state = inject(AgentState);
  readonly agentId = signal<AgentId | "">("");
  readonly selected = signal<string | null>(null);
  readonly expanded = signal(false);
  readonly busy = signal(false);
  readonly labels = sessionLabels;
  readonly installed = computed(() => this.state.agents().filter((a) => a.installed));
  readonly choice = computed<AgentId | "">(
    () => this.agentId() || (this.task().agentId as AgentId),
  );

  readonly installedChoice = computed(() =>
    this.installed().some((agent) => agent.id === this.choice()),
  );

  readonly own = computed(() => this.state.sessions().filter((s) => s.taskId === this.task().id));
  readonly running = computed(() => this.own().find((s) => s.status === "running"));
  readonly current = computed(
    () => this.own().find((s) => s.id === this.selected()) ?? this.own()[0],
  );

  choose(value: string) {
    this.agentId.set(value as AgentId);
  }

  async start() {
    const choice = this.choice();
    if (!choice || this.busy()) {
      return;
    }
    this.busy.set(true);
    const task = this.task();
    const configuredTask = choice === task.agentId ? task : { ...task, model: null, effort: null };
    try {
      const session = await this.state.start(choice, "task", configuredTask, this.projectPath());
      if (session) {
        this.selected.set(session.id);
        this.expanded.set(true);
      }
    } finally {
      this.busy.set(false);
    }
  }
}
