import {
  afterNextRender,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {
  disabled,
  form,
  FormField,
  maxLength,
  required,
  validate,
} from "@angular/forms/signals";
import { Icon } from "../shared/icon/icon";
import type { AgentId } from "@core/domain/agent";
import type { TaskOptions } from "@core/domain/task";

@Component({
  selector: "app-create-task-dialog",
  imports: [FormField, Icon],
  template: `
    <dialog
      #dialog
      class="task-dialog"
      aria-labelledby="task-dialog-title"
      (cancel)="cancel($event)"
      (click)="backdrop($event)"
    >
      <div class="dialog-heading">
        <div>
          <span class="eyebrow">NOVA TAREFA</span>
          <h2 id="task-dialog-title">O que precisa ser feito?</h2>
          <p>O Trama vai separar esta tarefa do restante do projeto.</p>
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
      <form (submit)="submit($event)">
        <label class="dialog-field"
          >Nome da tarefa<input
            autofocus
            [formField]="taskForm.title"
            placeholder="Ex.: Implementar autenticação OAuth"
        /></label>
        <label class="dialog-field"
          >Descrição<textarea
            [formField]="taskForm.prompt"
            rows="5"
            placeholder="Descreva o resultado esperado e os detalhes importantes…"
          ></textarea>
        </label>
        <div class="dialog-options">
          <label class="dialog-field">Agente
            <select [value]="model().agentId" (change)="setAgent($event)">
              @for (agent of agents; track agent.id) { <option [value]="agent.id">{{ agent.name }}</option> }
            </select>
          </label>
          <label class="dialog-field">Modelo <span class="field-hint">Deixe em branco para usar o padrão configurado no agente.</span>
            <input [value]="model().model" (input)="setModel($event)" placeholder="Padrão do agente · ex.: gpt-5-codex" />
          </label>
          <label class="dialog-field">Esforço
            <select [value]="model().effort" [disabled]="!supportsEffort()" (change)="setEffort($event)">
              @for (option of effortOptions(); track option.value) { <option [value]="option.value">{{ option.label }}</option> }
            </select>
            @if (!supportsEffort()) { <span class="field-hint">Este agente usa o esforço definido pelo próprio CLI.</span> }
          </label>
          <label class="worktree-choice">
            <input type="checkbox" [checked]="model().useWorktree" (change)="setWorktree($event)" />
            <span><strong>Criar worktree isolado</strong><small>Cria uma branch própria. Desmarque para trabalhar diretamente na pasta e branch atuais.</small></span>
          </label>
        </div>
        <div class="dialog-note">
          <svg appIcon name="branch" /><span>O agente só será iniciado quando você clicar em Iniciar agente na tarefa.</span>
        </div>
        <div class="dialog-actions">
          <button
            type="button"
            class="secondary-button"
            (click)="close()"
            [disabled]="saving()"
          >
            Cancelar</button
          ><button
            class="primary-button"
            [disabled]="saving() || taskForm().invalid()"
          >
              <svg appIcon name="branch" />{{
              saving() ? (model().useWorktree ? "Preparando worktree…" : "Criando tarefa…") : "Criar tarefa"
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
  readonly agents: { id: AgentId; name: string }[] = [
    { id: "codex", name: "Codex" }, { id: "claude", name: "Claude Code" },
    { id: "opencode", name: "OpenCode" }, { id: "gemini", name: "Gemini CLI" },
  ];
  readonly model = signal({ title: "", prompt: "", agentId: "codex" as AgentId, model: "", effort: "default", useWorktree: true });
  readonly supportsEffort = () => ["codex", "opencode"].includes(this.model().agentId);
  readonly effortOptions = () => this.model().agentId === "opencode"
    ? [{ value: "default", label: "Padrão do modelo" }, { value: "minimal", label: "Mínimo" }, { value: "low", label: "Baixo" }, { value: "medium", label: "Médio" }, { value: "high", label: "Alto" }, { value: "max", label: "Máximo" }]
    : [{ value: "default", label: "Padrão do agente" }, { value: "low", label: "Baixo" }, { value: "medium", label: "Médio" }, { value: "high", label: "Alto" }, { value: "xhigh", label: "Muito alto" }];
  readonly taskForm = form(this.model, (fields) => {
    required(fields.title);
    required(fields.prompt);
    maxLength(fields.title, 100);
    validate(fields.title, ({ value }) =>
      value().trim()
        ? undefined
        : { kind: "required", message: "Informe o nome da tarefa." },
    );
    validate(fields.prompt, ({ value }) =>
      value().trim()
        ? undefined
        : { kind: "required", message: "Descreva a tarefa." },
    );
    disabled(fields, () => this.saving());
  });
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog");

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
  close() {
    if (!this.saving()) this.dismiss.emit();
  }
  cancel(event: Event) {
    event.preventDefault();
    this.close();
  }
  backdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) this.close();
  }
  submit(event: Event) {
    event.preventDefault();
    if (this.saving() || this.taskForm().invalid()) return;
    const { title, prompt, agentId, model, effort, useWorktree } = this.model();
    this.create.emit({ title, prompt, agentId, model: model.trim() || null, effort: this.supportsEffort() && effort !== "default" ? effort : null, useWorktree });
  }
  setAgent(event: Event) { this.model.update(value => ({ ...value, agentId: (event.target as HTMLSelectElement).value as AgentId, effort: "default" })); }
  setModel(event: Event) { this.model.update(value => ({ ...value, model: (event.target as HTMLInputElement).value })); }
  setEffort(event: Event) { this.model.update(value => ({ ...value, effort: (event.target as HTMLSelectElement).value })); }
  setWorktree(event: Event) { this.model.update(value => ({ ...value, useWorktree: (event.target as HTMLInputElement).checked })); }
}
