import { Agents } from './agents/agents';
import { TaskAgent } from './task-agent/task-agent';
import { AgentState } from '@app/core/agent-state';
import {
  Component,
  computed,
  inject,
  PendingTasks,
  signal,
  type OnInit,
} from "@angular/core";
import type { Project } from "@core/domain/project";
import type { Task } from "@core/domain/task";
import type { TaskOptions } from "@core/domain/task";
import type { AgentSession } from "@core/domain/agent";
import { WORKSPACE_API } from "@app/core/workspace-api";
import { Icon } from "./shared/icon/icon";
import { PathLabel, displayPath } from "./shared/path-label/path-label";
import { CreateTaskDialog } from "./create-task-dialog/create-task-dialog";

@Component({
  selector: "app-root",
  imports: [Icon, PathLabel, CreateTaskDialog, Agents, TaskAgent],
  templateUrl: "./app.html",
})
export class App implements OnInit {
  private readonly api = inject(WORKSPACE_API);
  private readonly pending = inject(PendingTasks);
  readonly projects = signal<Project[]>([]);
  readonly currentProject = signal<Project | null>(null);
  readonly tasks = signal<Task[]>([]);
  readonly page = signal<"workspace" | "projects" | "agents">("workspace");
  readonly loading = signal(true);
  readonly opening = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly taskDialogOpen = signal(false);
  readonly taskFilter = signal<TaskFilter>("all");
  readonly selectedTaskId = signal<string | null>(null);
  readonly projectLabel = computed(
    () => this.currentProject()?.name ?? "Nenhum projeto",
  );
  readonly displayPath = displayPath;
  readonly agentState = inject(AgentState);
  readonly taskItems = computed<TaskItem[]>(() => {
    const sessions = this.agentState.sessions();
    return this.tasks().map((task) => {
      const own = sessions
        .filter((session) => session.taskId === task.id)
        .sort((a, b) => b.startedAt - a.startedAt);
      const running = own.find((session) => session.status === "running");
      const latest = running ?? own[0] ?? null;
      return {
        task,
        latest,
        group: taskGroup(task, latest),
        status: taskStatus(task, latest),
      };
    });
  });
  readonly taskCounts = computed(() => ({
    all: this.taskItems().length,
    running: this.taskItems().filter((item) => item.group === "running").length,
    attention: this.taskItems().filter((item) => item.group === "attention").length,
    history: this.taskItems().filter((item) => item.group === "history").length,
  }));
  readonly visibleTaskItems = computed(() => {
    const filter = this.taskFilter();
    return filter === "all"
      ? this.taskItems()
      : this.taskItems().filter((item) => item.group === filter);
  });
  readonly selectedTaskItem = computed(() => {
    const items = this.visibleTaskItems();
    return (
      items.find((item) => item.task.id === this.selectedTaskId()) ??
      (this.taskFilter() === "all"
        ? items.find((item) => item.group === "running") ??
          items.find((item) => item.group === "attention")
        : null) ??
      items[0] ??
      null
    );
  });

  ngOnInit() {
    this.agentState.initialize();
    void this.pending.run(() => this.initialize());
  }

  private async initialize() {
    try {
      await this.api.initialize();
      const projects = await this.api.listProjects();
      this.projects.set(projects);
      this.currentProject.set(projects[0] ?? null);
      if (projects[0]) {
        const tasks = await this.api.listTasks(projects[0].id);
        this.tasks.set(tasks);
        this.selectedTaskId.set(tasks[0]?.id ?? null);
      }
    } catch (cause) {
      this.error.set(errorMessage(cause));
    } finally {
      this.loading.set(false);
    }
  }

  async openRepository(project?: Project) {
    if (this.opening() || this.saving()) return;
    const done = this.pending.add();
    this.error.set(null);
    this.opening.set(true);
    try {
      const path = project?.path ?? (await this.api.chooseDirectory());
      if (!path) return;
      const opened = await this.api.openProject(path);
      const projects = await this.api.listProjects();
      const tasks = await this.api.listTasks(opened.id);
      this.projects.set(projects);
      this.currentProject.set(
        projects.find((item) => item.id === opened.id) ?? opened,
      );
      this.tasks.set(tasks);
      this.selectedTaskId.set(tasks[0]?.id ?? null);
      this.taskFilter.set("all");
      this.page.set("workspace");
    } catch (cause) {
      this.error.set(errorMessage(cause));
    } finally {
      this.opening.set(false);
      done();
    }
  }

  showTaskDialog() {
    this.error.set(null);
    this.taskDialogOpen.set(true);
  }
  closeTaskDialog() {
    if (this.saving()) return;
    this.taskDialogOpen.set(false);
    this.error.set(null);
  }

  async createTask(values: { title: string; prompt: string } & TaskOptions) {
    const project = this.currentProject();
    if (!project || this.saving()) return;
    const done = this.pending.add();
    this.saving.set(true);
    this.error.set(null);
    try {
      const { title, prompt, ...options } = values;
      await this.api.createTask(project, title, prompt, options);
      const tasks = await this.api.listTasks(project.id);
      this.tasks.set(tasks);
      this.selectedTaskId.set(tasks[0]?.id ?? null);
      this.taskDialogOpen.set(false);
    } catch (cause) {
      this.error.set(errorMessage(cause));
      try {
        this.tasks.set(await this.api.listTasks(project.id));
      } catch {
        /* Preserve the original operation error. */
      }
    } finally {
      this.saving.set(false);
      done();
    }
  }

  formatDate(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  setTaskFilter(filter: TaskFilter) {
    this.taskFilter.set(filter);
    const first = filter === "all"
      ? this.taskItems()[0]
      : this.taskItems().find((item) => item.group === filter);
    if (first) this.selectedTaskId.set(first.task.id);
  }

  selectTask(taskId: string) {
    this.selectedTaskId.set(taskId);
  }

  relativeTime(value: string | number) {
    const timestamp = typeof value === "number" ? value : new Date(value).getTime();
    const elapsed = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "agora";
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `há ${days} d`;
  }
}

type TaskFilter = "all" | "attention" | "running" | "history";
type TaskGroup = Exclude<TaskFilter, "all">;

interface TaskItem {
  task: Task;
  latest: AgentSession | null;
  group: TaskGroup;
  status: { label: string; detail: string };
}

function taskGroup(task: Task, session: AgentSession | null): TaskGroup {
  if (session?.status === "running" || task.status === "creating") return "running";
  if (session?.status === "stopped") return "history";
  return "attention";
}

function taskStatus(task: Task, session: AgentSession | null) {
  if (task.status === "creating") {
    return { label: "Preparando workspace", detail: "Criando o espaço de trabalho da tarefa" };
  }
  if (task.status === "failed") {
    return { label: "Preparação falhou", detail: task.error ?? "Revise a configuração e tente novamente" };
  }
  if (!session) {
    return { label: "Pronta para iniciar", detail: "Escolha o agente e inicie a primeira sessão" };
  }
  if (session.status === "running") {
    return { label: "Agente trabalhando", detail: "Acompanhe a saída ou envie uma instrução" };
  }
  if (session.status === "exited") {
    return { label: "Pronta para revisão", detail: "A sessão encerrou; confira a saída e as alterações" };
  }
  if (session.status === "failed") {
    return { label: "Execução falhou", detail: session.error ?? "Abra o terminal para entender o problema" };
  }
  return { label: "Interrompida", detail: "A execução foi parada e permanece no histórico" };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : String(cause || "Não foi possível concluir a operação.");
}
