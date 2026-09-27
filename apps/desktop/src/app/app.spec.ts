import { TestBed } from "@angular/core/testing";
import { App } from "./app";
import { WORKSPACE_API, type WorkspaceApi } from "@app/core/workspace-api";
import type { Project } from "@core/domain/project";
import type { Task } from "@core/domain/task";
import { AGENT_API } from "@app/core/agent-api";

const project: Project = {
  id: "project-1",
  name: "Trama",
  path: String.raw`\\?\C:\Users\Alvaro\Trama`,
  branch: "main",
  lastOpenedAt: "2026-09-26T12:00:00Z",
};
const task: Task = {
  id: "task-1",
  projectId: project.id,
  title: "Teste de migração",
  prompt: "Preservar o fluxo",
  agentId: "codex",
  model: null,
  effort: null,
  useWorktree: true,
  status: "ready",
  branch: "codex/test",
  worktreePath: String.raw`\\?\C:\worktrees\test`,
  createdAt: project.lastOpenedAt,
  error: null,
};

describe("Workspace Angular", () => {
  let api: WorkspaceApi;
  beforeEach(() => {
    // jsdom has no native modal implementation. Only this browser primitive is stubbed.
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    api = {
      initialize: vi.fn().mockResolvedValue(undefined),
      listProjects: vi.fn().mockResolvedValue([project]),
      openProject: vi.fn().mockResolvedValue(project),
      chooseDirectory: vi.fn().mockResolvedValue(project.path),
      listTasks: vi.fn().mockResolvedValue([]),
      createTask: vi.fn().mockResolvedValue(task),
      removeTask: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: WORKSPACE_API, useValue: api },
        {
          provide: AGENT_API,
          useValue: {
            detect: vi.fn().mockResolvedValue(
              ["codex", "claude", "opencode", "gemini"].map((id) => ({
                id,
                name: id,
                installed: false,
                version: null,
                authentication: "unknown",
                detail: "Não instalado",
              })),
            ),
            list: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    });
  });

  async function setup() {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return {
      fixture,
      app: fixture.componentInstance,
      root: fixture.nativeElement as HTMLElement,
    };
  }

  it("restores the project, formats paths and navigates without reloading", async () => {
    const { fixture, root } = await setup();
    expect(root.querySelector("h1")?.textContent).toBe("O que você quer fazer?");
    expect(root.querySelectorAll('[aria-label="Abrir projetos"]')).toHaveLength(1);
    expect(root.querySelector('[aria-label="Trocar projeto"]')).toBeNull();
    root.querySelector<HTMLButtonElement>(".project-switcher")!.click();
    await fixture.whenStable();
    expect(root.querySelector(".project-card")?.textContent).toContain("Trama");
    expect(root.querySelector(".project-card .path-label")?.textContent).toBe(
      String.raw`C:\Users\Alvaro\Trama`,
    );
    root.querySelector<HTMLButtonElement>('[aria-label="Conectar agentes"]')!.click();
    await fixture.whenStable();
    expect(root.querySelectorAll(".agent-row")).toHaveLength(0);
    expect(root.textContent).toContain("Nenhum agente configurado");
  });

  it("keeps the workspace when the native picker is cancelled", async () => {
    vi.mocked(api.chooseDirectory).mockResolvedValue(null);
    const { app, root, fixture } = await setup();
    await app.openRepository();
    await fixture.whenStable();
    expect(api.openProject).not.toHaveBeenCalled();
    expect(root.querySelector("h1")?.textContent).toBe("O que você quer fazer?");
    expect(app.opening()).toBe(false);
  });

  it("opens a recent task from the left sidebar", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { root, fixture } = await setup();
    root.querySelector<HTMLButtonElement>(".recent-task")!.click();
    await fixture.whenStable();
    expect(root.querySelector(".task-detail")?.textContent).toContain(task.title);
    expect(root.querySelector(".recent-task.selected")?.textContent).toContain(task.title);
  });

  it("submits the Angular form and displays the created worktree", async () => {
    const { fixture, root } = await setup();
    root.querySelector<HTMLButtonElement>(".task-empty button")!.click();
    await fixture.whenStable();
    expect(root.querySelector(".agent-options")?.hasAttribute("open")).toBe(false);
    expect(root.querySelector(".task-execution")?.textContent).toContain(
      "Trabalhar em espaço isolado",
    );
    const input = root.querySelector<HTMLInputElement>("dialog input")!;
    const textarea = root.querySelector<HTMLTextAreaElement>("dialog textarea")!;
    input.value = task.title;
    input.dispatchEvent(new Event("input"));
    textarea.value = task.prompt;
    textarea.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    root.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await fixture.whenStable();
    expect(api.createTask).toHaveBeenCalledWith(project, task.title, task.prompt, {
      agentId: "codex",
      model: null,
      effort: null,
      useWorktree: true,
    });
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector(".recent-task")?.textContent).toContain(task.title);
    expect(root.querySelector(".task-detail")?.textContent).toContain("Pronta para iniciar");
  });

  it("makes active work visible in the recent task sidebar", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { app, root, fixture } = await setup();
    app.agentState.sessions.set([
      {
        id: "session-1",
        taskId: task.id,
        agentId: "codex",
        purpose: "task",
        status: "running",
        startedAt: Date.now() - 120_000,
        endedAt: null,
        exitCode: null,
        error: null,
      },
    ]);
    await fixture.whenStable();

    expect(root.querySelector(".recent-task.running")?.textContent).toContain("Agente trabalhando");
    expect(root.querySelector(".task-detail")?.textContent).toContain(task.title);
    expect(root.querySelector(".task-toolbar-title h1")?.textContent).toBe(task.title);
    expect(root.querySelector(".task-duration")?.textContent).toMatch(/01:59|02:00/);
    expect(root.querySelector(".task-status-compact")?.textContent).toContain("Ativa");
  });

  it("removes a task after confirmation while preserving its workspace", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { root, fixture } = await setup();

    root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector(".remove-task-dialog")?.textContent).toContain(task.title);
    expect(root.querySelector(".workspace-warning")?.textContent).toContain(
      "O worktree continuará no disco",
    );

    root.querySelector<HTMLButtonElement>(".danger-button")!.click();
    await fixture.whenStable();
    expect(api.removeTask).toHaveBeenCalledWith(task.id, false);
    expect(root.querySelector(".remove-task-dialog")).toBeNull();
    expect(root.querySelector(".recent-task")).toBeNull();
    expect(root.textContent).toContain("Comece com uma tarefa");
  });

  it("keeps the removal confirmation open when deleting fails", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    vi.mocked(api.removeTask).mockRejectedValue(new Error("SQLite ocupado"));
    const { root, fixture } = await setup();

    root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!.click();
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>(".danger-button")!.click();
    await fixture.whenStable();

    expect(root.querySelector(".remove-task-error")?.textContent).toContain("SQLite ocupado");
    expect(root.querySelector(".remove-task-dialog")).not.toBeNull();
    expect(root.querySelector(".recent-task")?.textContent).toContain(task.title);
  });

  it("can remove the task and its worktree when explicitly selected", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { root, fixture } = await setup();
    root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!.click();
    await fixture.whenStable();

    const checkbox = root.querySelector<HTMLInputElement>(".worktree-removal-choice input")!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    await fixture.whenStable();
    expect(root.querySelector(".workspace-warning")?.textContent).toContain(
      "O worktree será removido",
    );

    root.querySelector<HTMLButtonElement>(".danger-button")!.click();
    await fixture.whenStable();
    expect(api.removeTask).toHaveBeenCalledWith(task.id, true);
  });

  it("does not allow removing a task while its agent is running", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { app, root, fixture } = await setup();
    app.agentState.sessions.set([
      {
        id: "session-1",
        taskId: task.id,
        agentId: "codex",
        purpose: "task",
        status: "running",
        startedAt: Date.now(),
        endedAt: null,
        exitCode: null,
        error: null,
      },
    ]);
    await fixture.whenStable();

    const removeButton = root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!;
    expect(removeButton.disabled).toBe(true);
    expect(removeButton.title).toContain("Interrompa a execução");
    expect(api.removeTask).not.toHaveBeenCalled();
  });

  it("does not allow removing a task while its workspace is being prepared", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([{ ...task, status: "creating" }]);
    const { root } = await setup();

    const removeButton = root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!;
    expect(removeButton.disabled).toBe(true);
    expect(api.removeTask).not.toHaveBeenCalled();
  });

  it("revalidates activity when a task starts running after confirmation opens", async () => {
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    const { app, root, fixture } = await setup();
    root.querySelector<HTMLButtonElement>('[aria-label="Remover tarefa"]')!.click();
    await fixture.whenStable();

    app.agentState.sessions.set([
      {
        id: "session-late",
        taskId: task.id,
        agentId: "codex",
        purpose: "task",
        status: "running",
        startedAt: Date.now(),
        endedAt: null,
        exitCode: null,
        error: null,
      },
    ]);
    root.querySelector<HTMLButtonElement>(".danger-button")!.click();
    await fixture.whenStable();

    expect(api.removeTask).not.toHaveBeenCalled();
    expect(root.querySelector(".remove-task-error")?.textContent).toContain(
      "Interrompa a execução",
    );
  });

  it("retains the dialog and shows an error when worktree creation fails", async () => {
    vi.mocked(api.createTask).mockRejectedValue(new Error("Git indisponível"));
    const { app, root, fixture } = await setup();
    app.showTaskDialog();
    await fixture.whenStable();
    await app.createTask({
      title: task.title,
      prompt: task.prompt,
      agentId: "codex",
      model: null,
      effort: null,
      useWorktree: true,
    });
    await fixture.whenStable();
    expect(root.querySelector(".dialog-error")?.textContent).toContain("Git indisponível");
    expect(app.saving()).toBe(false);
    expect(root.querySelector("dialog")).not.toBeNull();
  });

  it("shows a recoverable error if initialization fails", async () => {
    vi.mocked(api.initialize).mockRejectedValue(new Error("SQLite indisponível"));
    const { app, root } = await setup();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("SQLite indisponível");
    expect(app.loading()).toBe(false);
    expect(root.querySelector(".welcome-page")).not.toBeNull();
  });
});
