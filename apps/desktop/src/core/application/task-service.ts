import type { Project } from "../domain/project";
import type { Task, TaskOptions, TaskRepository, TaskWorkspaceCreator } from "../domain/task";

export class TaskService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly workspaces: TaskWorkspaceCreator,
  ) {}

  list(projectId: string): Promise<Task[]> {
    return this.tasks.listForProject(projectId);
  }

  remove(taskId: string): Promise<void> {
    return this.tasks.remove(taskId);
  }

  async create(
    project: Project,
    title: string,
    prompt: string,
    options: TaskOptions,
  ): Promise<Task> {
    const normalizedTitle = title.trim();
    const normalizedPrompt = prompt.trim();
    if (!normalizedTitle || !normalizedPrompt) {
      throw new Error("Informe o nome da tarefa e o que precisa ser feito.");
    }

    const task = await this.tasks.create(project.id, normalizedTitle, normalizedPrompt, options);
    if (!options.useWorktree) {
      return this.tasks.markReady(task.id, null, null);
    }
    try {
      const workspace = await this.workspaces.create(project, task);
      return await this.tasks.markReady(task.id, workspace.branch, workspace.worktreePath);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await this.tasks.markFailed(task.id, message);
      throw cause;
    }
  }
}
