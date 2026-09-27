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
  templateUrl: "./task-agent.html",
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
