import type { ElementRef } from "@angular/core";
import { afterNextRender, Component, input, output, viewChild } from "@angular/core";
import type { Task } from "@core/domain/task";
import { Icon } from "../shared/icon/icon";

@Component({
  selector: "app-remove-task-dialog",
  imports: [Icon],
  styleUrl: "./remove-task-dialog.scss",
  template: `
    <dialog
      #dialog
      class="remove-task-dialog"
      aria-labelledby="remove-task-title"
      aria-describedby="remove-task-description"
      tabindex="-1"
      (cancel)="cancel($event)"
      (click)="backdrop($event)"
      (keydown.escape)="close()"
    >
      <div class="remove-task-heading">
        <span class="remove-task-icon"><app-icon name="trash" /></span>
        <div>
          <h2 id="remove-task-title">Remover “{{ task().title }}”?</h2>
          <p id="remove-task-description">
            A tarefa será removida do histórico do Trama. Esta ação não pode ser desfeita.
          </p>
        </div>
      </div>

      @if (task().worktreePath || task().branch) {
        <div class="workspace-warning">
          <strong>Seu trabalho local será preservado.</strong>
          <span>A branch e o worktree continuarão no disco para evitar perda de alterações.</span>
        </div>
      }

      @if (error()) {
        <p class="remove-task-error" role="alert">{{ error() }}</p>
      }

      <div class="remove-task-actions">
        <button type="button" class="secondary-button" (click)="close()" [disabled]="removing()">
          Cancelar
        </button>
        <button
          type="button"
          class="danger-button"
          (click)="confirm.emit()"
          [disabled]="removing()"
        >
          <app-icon name="trash" />{{ removing() ? "Removendo…" : "Remover tarefa" }}
        </button>
      </div>
    </dialog>
  `,
})
export class RemoveTaskDialog {
  readonly task = input.required<Task>();
  readonly removing = input(false);
  readonly error = input<string | null>(null);
  readonly dismiss = output<void>();
  readonly confirm = output<void>();
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>("dialog");

  constructor() {
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
    if (!this.removing()) {
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
}
