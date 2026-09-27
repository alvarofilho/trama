import type {
  Task,
  TaskRemovalGateway,
  TaskRepository,
  TaskWorkspaceCreator,
} from "../domain/task";
import { TaskService } from "./task-service";

const task: Task = {
  id: "task-1",
  projectId: "project-1",
  title: "Remover tarefa",
  prompt: "Validar a remoção",
  agentId: "codex",
  model: null,
  effort: null,
  useWorktree: true,
  status: "ready",
  branch: "agent/task-1",
  worktreePath: "C:/worktrees/task-1",
  createdAt: "2026-09-27T12:00:00Z",
  error: null,
};

function setup(currentTask: Task | null = task) {
  const tasks: TaskRepository = {
    listForProject: vi.fn().mockResolvedValue(currentTask ? [currentTask] : []),
    find: vi.fn().mockResolvedValue(currentTask),
    create: vi.fn().mockResolvedValue(task),
    markReady: vi.fn().mockResolvedValue(task),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  const workspaces: TaskWorkspaceCreator = {
    create: vi.fn().mockResolvedValue({ branch: task.branch!, worktreePath: task.worktreePath! }),
  };
  const removal: TaskRemovalGateway = {
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new TaskService(tasks, workspaces, removal), tasks, removal };
}

describe("TaskService removal", () => {
  it("removes a task after checking the native session state", async () => {
    const { service, removal } = setup();

    await service.remove(task.id);

    expect(removal.remove).toHaveBeenCalledWith(task.id, false);
  });

  it("passes the worktree removal choice to the native boundary", async () => {
    const { service, removal } = setup();

    await service.remove(task.id, true);

    expect(removal.remove).toHaveBeenCalledWith(task.id, true);
  });

  it("rejects worktree removal for a task without an isolated workspace", async () => {
    const { service, removal } = setup({ ...task, useWorktree: false, worktreePath: null });

    await expect(service.remove(task.id, true)).rejects.toThrow("não possui um worktree");
    expect(removal.remove).not.toHaveBeenCalled();
  });

  it("does not remove a task while its workspace is being prepared", async () => {
    const { service, removal } = setup({ ...task, status: "creating" });

    await expect(service.remove(task.id)).rejects.toThrow("Aguarde a preparação");
    expect(removal.remove).not.toHaveBeenCalled();
  });

  it("does not delete an unknown task", async () => {
    const { service, removal } = setup(null);

    await expect(service.remove("missing")).rejects.toThrow("não foi encontrada");
    expect(removal.remove).not.toHaveBeenCalled();
  });
});
