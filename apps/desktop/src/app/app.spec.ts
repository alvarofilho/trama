import { TestBed } from "@angular/core/testing";
import { App } from "./app";
import { WORKSPACE_API, type WorkspaceApi } from "@app/core/workspace-api";
import type { Project } from "@core/domain/project";
import type { Task } from "@core/domain/task";
import { AGENT_API } from '@app/core/agent-api';

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
    };
    TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: WORKSPACE_API, useValue: api }, { provide: AGENT_API, useValue: {
        detect: vi.fn().mockResolvedValue(['codex', 'claude', 'opencode', 'gemini'].map(id => ({ id, name: id, installed: false, version: null, authentication: 'unknown', detail: 'Não instalado' }))),
        list: vi.fn().mockResolvedValue([]),
      } }],
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
    expect(root.querySelector("h1")?.textContent).toBe("Trama");
    expect(root.querySelector(".repo-path")?.textContent).toBe(
      String.raw`C:\Users\Alvaro\Trama`,
    );
    root.querySelector<HTMLButtonElement>('[aria-label="Projetos"]')!.click();
    await fixture.whenStable();
    expect(root.querySelector(".project-card")?.textContent).toContain("Trama");
    root.querySelector<HTMLButtonElement>('[aria-label="Agentes"]')!.click();
    await fixture.whenStable();
    expect(root.querySelectorAll(".agent-row")).toHaveLength(4);
  });

  it("keeps the workspace when the native picker is cancelled", async () => {
    vi.mocked(api.chooseDirectory).mockResolvedValue(null);
    const { app, root, fixture } = await setup();
    await app.openRepository();
    await fixture.whenStable();
    expect(api.openProject).not.toHaveBeenCalled();
    expect(root.querySelector("h1")?.textContent).toBe("Trama");
    expect(app.opening()).toBe(false);
  });

  it("reopens recent projects with the original filesystem path", async () => {
    const { root, fixture } = await setup();
    root.querySelector<HTMLButtonElement>(".recent-project")!.click();
    await fixture.whenStable();
    expect(api.openProject).toHaveBeenCalledWith(project.path);
    expect(api.chooseDirectory).not.toHaveBeenCalled();
  });

  it("submits the Angular form and displays the created worktree", async () => {
    const { fixture, root } = await setup();
    root.querySelector<HTMLButtonElement>(".task-empty button")!.click();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>("dialog input")!;
    const textarea =
      root.querySelector<HTMLTextAreaElement>("dialog textarea")!;
    input.value = task.title;
    input.dispatchEvent(new Event("input"));
    textarea.value = task.prompt;
    textarea.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    vi.mocked(api.listTasks).mockResolvedValue([task]);
    root
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await fixture.whenStable();
    expect(api.createTask).toHaveBeenCalledWith(
      project,
      task.title,
      task.prompt,
      { agentId: "codex", model: null, effort: null, useWorktree: true },
    );
    expect(root.querySelector("dialog")).toBeNull();
    expect(root.querySelector(".task-row")?.textContent).toContain(task.title);
    expect(root.querySelector(".task-detail")?.textContent).toContain(
      "Pronta para iniciar",
    );
  });

  it("makes active work visible and filters tasks by attention", async () => {
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
        exitCode: null,
        error: null,
      },
    ]);
    await fixture.whenStable();

    expect(root.querySelector(".live-summary")?.textContent).toContain(
      "1 execução ativa",
    );
    expect(root.querySelector(".task-row.running")?.textContent).toContain(
      "Agente trabalhando",
    );

    const attention = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".task-filter-bar button"),
    ).find((button) => button.textContent?.includes("Precisa de você"))!;
    attention.click();
    await fixture.whenStable();
    expect(root.querySelector(".task-filter-empty")?.textContent).toContain(
      "Nenhuma tarefa neste estado",
    );
    expect(root.querySelector(".task-detail")).toBeNull();
  });

  it("retains the dialog and shows an error when worktree creation fails", async () => {
    vi.mocked(api.createTask).mockRejectedValue(new Error("Git indisponível"));
    const { app, root, fixture } = await setup();
    app.showTaskDialog();
    await fixture.whenStable();
    await app.createTask({ title: task.title, prompt: task.prompt, agentId: "codex", model: null, effort: null, useWorktree: true });
    await fixture.whenStable();
    expect(root.querySelector(".dialog-error")?.textContent).toContain(
      "Git indisponível",
    );
    expect(app.saving()).toBe(false);
    expect(root.querySelector("dialog")).not.toBeNull();
  });

  it("shows a recoverable error if initialization fails", async () => {
    vi.mocked(api.initialize).mockRejectedValue(
      new Error("SQLite indisponível"),
    );
    const { app, root } = await setup();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "SQLite indisponível",
    );
    expect(app.loading()).toBe(false);
    expect(root.querySelector(".welcome-page")).not.toBeNull();
  });
});
