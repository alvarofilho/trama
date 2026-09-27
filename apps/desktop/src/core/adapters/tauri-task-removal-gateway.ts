import { invoke } from "@tauri-apps/api/core";
import type { TaskRemovalGateway } from "../domain/task";

export class TauriTaskRemovalGateway implements TaskRemovalGateway {
  remove(taskId: string, removeWorktree: boolean): Promise<void> {
    return invoke<void>("remove_task", { taskId, removeWorktree });
  }
}
