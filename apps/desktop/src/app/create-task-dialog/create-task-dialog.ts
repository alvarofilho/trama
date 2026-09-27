import type { ElementRef } from "@angular/core";
import {
  afterNextRender,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { disabled, form, FormField, maxLength, required, validate } from "@angular/forms/signals";
import { Icon } from "../shared/icon/icon";
import type { AgentId, AgentInfo } from "@core/domain/agent";
import type { TaskOptions } from "@core/domain/task";

@Component({
  selector: "app-create-task-dialog",
  imports: [FormField, Icon],
  styleUrl: "./create-task-dialog.scss",
  templateUrl: "./create-task-dialog.html",
})
export class CreateTaskDialog {
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly dismiss = output<void>();
  readonly create = output<{ title: string; prompt: string } & TaskOptions>();
  readonly availableAgents = input<AgentInfo[]>([]);
  readonly agents = computed(() => this.availableAgents().filter((agent) => agent.installed));
  readonly model = signal({
    title: "",
    prompt: "",
    agentId: "codex" as AgentId,
    model: "",
    effort: "default",
    useWorktree: true,
  });

  readonly currentAgent = computed(() =>
    this.agents().find((agent) => agent.id === this.model().agentId),
  );

  readonly modelOptions = computed(() => this.currentAgent()?.models ?? []);
  readonly supportsEffort = () => ["codex", "opencode"].includes(this.model().agentId);
  readonly effortOptions = () =>
    this.model().agentId === "opencode"
      ? [
          { value: "default", label: "Padrão do modelo" },
          { value: "minimal", label: "Mínimo" },
          { value: "low", label: "Baixo" },
          { value: "medium", label: "Médio" },
          { value: "high", label: "Alto" },
          { value: "max", label: "Máximo" },
        ]
      : [
          { value: "default", label: "Padrão do agente" },
          { value: "low", label: "Baixo" },
          { value: "medium", label: "Médio" },
          { value: "high", label: "Alto" },
          { value: "xhigh", label: "Muito alto" },
        ];

  readonly taskForm = form(this.model, (fields) => {
    required(fields.title);
    required(fields.prompt);
    maxLength(fields.title, 100);
    validate(fields.title, ({ value }) =>
      value().trim() ? undefined : { kind: "required", message: "Informe o nome da tarefa." },
    );
    validate(fields.prompt, ({ value }) =>
      value().trim() ? undefined : { kind: "required", message: "Descreva a tarefa." },
    );
    disabled(fields, () => this.saving());
  });

  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog");

  constructor() {
    effect(() => {
      const agents = this.agents();
      if (agents.length && !agents.some((agent) => agent.id === this.model().agentId)) {
        this.model.update((value) => ({
          ...value,
          agentId: agents[0].id,
          model: "",
          effort: "default",
        }));
      }
    });
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    });
  }

  close() {
    if (!this.saving()) {
      this.dismiss.emit();
    }
  }

  cancel(event: Event) {
    event.preventDefault();
    this.close();
  }

  backdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  submit(event: Event) {
    event.preventDefault();
    if (this.saving() || this.taskForm().invalid()) {
      return;
    }
    const { title, prompt, agentId, model, effort, useWorktree } = this.model();
    this.create.emit({
      title,
      prompt,
      agentId,
      model: model.trim() || null,
      effort: this.supportsEffort() && effort !== "default" ? effort : null,
      useWorktree,
    });
  }

  setAgent(event: Event) {
    this.model.update((value) => ({
      ...value,
      agentId: (event.target as HTMLSelectElement).value as AgentId,
      model: "",
      effort: "default",
    }));
  }

  setModel(event: Event) {
    this.model.update((value) => ({ ...value, model: (event.target as HTMLSelectElement).value }));
  }

  setEffort(event: Event) {
    this.model.update((value) => ({ ...value, effort: (event.target as HTMLSelectElement).value }));
  }

  setWorktree(event: Event) {
    this.model.update((value) => ({
      ...value,
      useWorktree: (event.target as HTMLInputElement).checked,
    }));
  }
}
