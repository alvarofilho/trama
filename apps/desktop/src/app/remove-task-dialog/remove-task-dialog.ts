import type { ElementRef } from "@angular/core";
import { afterNextRender, Component, input, output, signal, viewChild } from "@angular/core";
import type { Task } from "@core/domain/task";
import { Icon } from "../shared/icon/icon";

@Component({
  selector: "app-remove-task-dialog",
  imports: [Icon],
  styleUrl: "./remove-task-dialog.scss",
  templateUrl: "./remove-task-dialog.html",
})
export class RemoveTaskDialog {
  readonly task = input.required<Task>();
  readonly removing = input(false);
  readonly error = input<string | null>(null);
  readonly dismiss = output<void>();
  readonly confirm = output<boolean>();
  readonly removeWorktree = signal(false);
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

  setRemoveWorktree(event: Event) {
    this.removeWorktree.set((event.target as HTMLInputElement).checked);
  }
}
