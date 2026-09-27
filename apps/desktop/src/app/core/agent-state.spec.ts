import { TestBed } from "@angular/core/testing";
import { AGENT_API } from "./agent-api";
import { AgentState } from "./agent-state";
import type { AgentGateway, AgentSession } from "@core/domain/agent";
import type { Task } from "@core/domain/task";

describe("Agent sessions", () => {
  let api: AgentGateway;
  const session: AgentSession = {
    id: "session",
    taskId: "task",
    agentId: "codex",
    purpose: "task",
    status: "running",
    startedAt: 1,
    exitCode: null,
    error: null,
  };
  const task: Task = {
    id: "task",
    projectId: "project",
    title: "Task",
    prompt: "A prompt",
    agentId: "codex",
    model: null,
    effort: null,
    useWorktree: true,
    status: "ready",
    branch: "agent/task",
    worktreePath: "C:/worktrees/task",
    createdAt: "",
    error: null,
  };
  beforeEach(() => {
    api = {
      detect: vi.fn().mockResolvedValue([]),
      configurePath: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      start: vi.fn().mockResolvedValue(session),
      read: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      stop: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AGENT_API, useValue: api }] });
  });
  it("binds execution to the task and project identifiers, not a frontend supplied path", async () => {
    const state = TestBed.inject(AgentState);
    expect(await state.start("codex", "task", task)).toEqual(session);
    expect(api.start).toHaveBeenCalledWith(
      "codex",
      "task",
      "task",
      "project",
      undefined,
      true,
      null,
      null,
    );
    expect(state.runningCount()).toBe(1);
    expect(state.sessions()).toEqual([session]);
  });
  it("does not invent a running session when the native launch fails", async () => {
    vi.mocked(api.start).mockRejectedValue(new Error("CLI não encontrado"));
    const state = TestBed.inject(AgentState);
    expect(await state.start("codex", "task", task)).toBeNull();
    expect(state.sessions()).toEqual([]);
    expect(state.error()).toContain("CLI não encontrado");
  });
  it("allows retry after a failed detection", async () => {
    vi.mocked(api.detect).mockRejectedValueOnce(new Error("Falha de detecção"));
    const state = TestBed.inject(AgentState);
    await state.detect();
    expect(state.detecting()).toBe(false);
    await state.detect();
    expect(api.detect).toHaveBeenCalledTimes(2);
  });
  it("does not bind native login to a repository task", async () => {
    const state = TestBed.inject(AgentState);
    await state.start("claude", "login");
    expect(api.start).toHaveBeenCalledWith(
      "claude",
      "login",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });
  it("refreshes authentication automatically when native login exits", async () => {
    vi.useFakeTimers();
    try {
      const login: AgentSession = { ...session, id: "login", purpose: "login", taskId: null };
      vi.mocked(api.start).mockResolvedValue(login);
      const state = TestBed.inject(AgentState);
      state.initialize();
      await vi.advanceTimersByTimeAsync(0);
      await state.start("codex", "login");
      vi.mocked(api.list).mockResolvedValue([{ ...login, status: "exited", exitCode: 0 }]);
      await vi.advanceTimersByTimeAsync(1600);
      expect(api.detect).toHaveBeenCalledTimes(2);
      state.ngOnDestroy();
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not lose a new login when an earlier session query returns late", async () => {
    let complete!: (sessions: AgentSession[]) => void;
    vi.mocked(api.list).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const state = TestBed.inject(AgentState);
    state.initialize();
    await state.start("codex", "login");
    complete([]);
    await Promise.resolve();
    expect(state.sessions()).toHaveLength(1);
    state.ngOnDestroy();
  });
});
