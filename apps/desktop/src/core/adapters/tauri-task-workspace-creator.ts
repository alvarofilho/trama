import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../domain/project";
import type { Task, TaskWorkspaceCreator } from "../domain/task";

interface CreatedWorkspace {
  branch: string;
  worktreePath: string;
}

export class TauriTaskWorkspaceCreator implements TaskWorkspaceCreator {
  create(project: Project, task: Task): Promise<CreatedWorkspace> {
    return invoke<CreatedWorkspace>("create_task_worktree", {
      repoPath: project.path,
      projectId: project.id,
      taskId: task.id,
      title: task.title,
      baseBranch: project.branch,
    });
  }
}
