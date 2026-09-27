import { InjectionToken } from "@angular/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ProjectService } from "@core/application/project-service";
import { TaskService } from "@core/application/task-service";
import { SqliteProjectRepository } from "@core/adapters/sqlite-project-repository";
import { SqliteTaskRepository } from "@core/adapters/sqlite-task-repository";
import { TauriRepositoryInspector } from "@core/adapters/tauri-repository-inspector";
import { TauriTaskWorkspaceCreator } from "@core/adapters/tauri-task-workspace-creator";
import type { Project } from "@core/domain/project";
import type { Task } from "@core/domain/task";
import type { TaskOptions } from "@core/domain/task";

export interface WorkspaceApi {
  initialize(): Promise<void>;
  listProjects(): Promise<Project[]>;
  openProject(path: string): Promise<Project>;
  chooseDirectory(): Promise<string | null>;
  listTasks(projectId: string): Promise<Task[]>;
  createTask(project: Project, title: string, prompt: string, options: TaskOptions): Promise<Task>;
}

export const WORKSPACE_API = new InjectionToken<WorkspaceApi>("Workspace API", {
  providedIn: "root",
  factory: () => {
    const projects = new SqliteProjectRepository();
    const tasks = new SqliteTaskRepository();
    const projectService = new ProjectService(
      projects,
      new TauriRepositoryInspector(),
    );
    const taskService = new TaskService(tasks, new TauriTaskWorkspaceCreator());
    return {
      async initialize() {
        await projects.initialize();
        await tasks.initialize();
      },
      listProjects: () => projectService.listRecent(),
      openProject: (path) => projectService.openRepository(path),
      async chooseDirectory() {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Selecione um repositório Git",
        });
        return typeof selected === "string" ? selected : null;
      },
      listTasks: (id) => taskService.list(id),
      createTask: (project, title, prompt, options) => taskService.create(project, title, prompt, options),
    };
  },
});
