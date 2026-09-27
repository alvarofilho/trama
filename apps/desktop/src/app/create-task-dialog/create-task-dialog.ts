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
  template: `
    <dialog
      #dialog
      class="task-dialog"
      aria-labelledby="task-dialog-title"
      tabindex="-1"
      (cancel)="cancel($event)"
      (click)="backdrop($event)"
      (keydown.escape)="close()"
    >
      <div class="dialog-heading">
        <div>
          <h2 id="task-dialog-title">Nova tarefa</h2>
          <p>Defina a entrega agora. Você inicia o agente depois de revisar a tarefa.</p>
        </div>
        <button
          type="button"
          class="dialog-close"
          (click)="close()"
          [disabled]="saving()"
          aria-label="Fechar diálogo"
        >
          ×
        </button>
      </div>
      @if (error()) {
        <div class="dialog-error" role="alert">{{ error() }}</div>
      }
      <form class="task-dialog-form" (submit)="submit($event)">
        <section class="task-brief" aria-labelledby="task-brief-title">
          <div class="dialog-section-heading">
            <h3 id="task-brief-title">O que precisa ser feito?</h3>
            <span>Obrigatório</span>
          </div>
          <label class="dialog-field"
            >Título<input
              autofocus
              [formField]="taskForm.title"
              placeholder="Ex.: Corrigir o fluxo de autenticação"
          /></label>
          <label class="dialog-field dialog-prompt"
            >Instruções para o agente<textarea
              [formField]="taskForm.prompt"
              rows="7"
              placeholder="Explique o resultado esperado, os limites e como validar a entrega."
            ></textarea>
            <span class="field-hint"
              >Um pedido específico reduz retrabalho e facilita a revisão.</span
            >
          </label>
        </section>

        <aside class="task-execution" aria-labelledby="task-execution-title">
          <div class="dialog-section-heading">
            <h3 id="task-execution-title">Como executar</h3>
            <span>Configuração</span>
          </div>
          <label class="dialog-field"
            >Agente
            <select
              [value]="model().agentId"
              [disabled]="!agents().length"
              (change)="setAgent($event)"
            >
              @for (agent of agents(); track agent.id) {
                <option [value]="agent.id">{{ agent.name }}</option>
              }
            </select>
            @if (!agents().length) {
              <span class="field-hint">Configure um agente antes de criar a tarefa.</span>
            }
          </label>
          <label class="worktree-choice">
            <input type="checkbox" [checked]="model().useWorktree" (change)="setWorktree($event)" />
            <span
              ><strong>Trabalhar em espaço isolado</strong
              ><small
                >Recomendado. Cria uma branch e um worktree próprios para proteger sua pasta
                atual.</small
              ></span
            >
          </label>

          <details class="agent-options">
            <summary><span>Ajustes do agente</span><small>Opcional</small></summary>
            <div class="agent-options-fields">
              <label class="dialog-field"
                >Modelo
                <select
                  aria-label="Modelo"
                  [value]="model().model"
                  [disabled]="!agents().length"
                  (change)="setModel($event)"
                >
                  <option value="">Padrão do agente</option>
                  @for (option of modelOptions(); track option.id) {
                    <option [value]="option.id">
                      {{ option.name }}{{ option.isDefault ? " — padrão" : "" }}
                    </option>
                  }
                </select>
                <span class="field-hint">{{
                  modelOptions().length
                    ? "Modelos informados pelo CLI selecionado."
                    : "Este CLI não informou um catálogo; será usado o padrão da ferramenta."
                }}</span>
              </label>
              <label class="dialog-field"
                >Esforço
                <select
                  [value]="model().effort"
                  [disabled]="!supportsEffort()"
                  (change)="setEffort($event)"
                >
                  @for (option of effortOptions(); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
                @if (!supportsEffort()) {
                  <span class="field-hint"
                    >Este agente usa o esforço definido pelo próprio CLI.</span
                  >
                }
              </label>
            </div>
          </details>

          <div class="dialog-note">
            <app-icon name="branch" /><span
              >Criar a tarefa não inicia o agente. Você poderá revisar tudo antes de executar.</span
            >
          </div>
        </aside>

        <div class="dialog-actions">
          <span class="dialog-action-hint">A tarefa será adicionada à lateral.</span>
          <button type="button" class="secondary-button" (click)="close()" [disabled]="saving()">
            Cancelar</button
          ><button
            class="primary-button"
            [disabled]="saving() || taskForm().invalid() || !agents().length"
          >
            {{
              saving()
                ? model().useWorktree
                  ? "Preparando worktree…"
                  : "Criando tarefa…"
                : "Criar tarefa"
            }}
          </button>
        </div>
      </form>
    </dialog>
  `,
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
