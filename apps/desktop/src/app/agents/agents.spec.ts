import { TestBed } from "@angular/core/testing";
import { Agents } from "./agents";
import { AgentState } from "@app/core/agent-state";
import { AGENT_API } from "@app/core/agent-api";
import type { AgentInfo } from "@core/domain/agent";

const codex: AgentInfo = {
  id: "codex",
  name: "Codex",
  installed: true,
  version: "codex-cli fixture",
  authentication: "unauthenticated",
  detail: "Entre com sua conta.",
  source: "Aplicativo Codex",
  executablePath: "C:/Codex/codex.exe",
};

describe("Agent connection experience", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Agents],
      providers: [
        {
          provide: AGENT_API,
          useValue: {
            detect: vi.fn().mockResolvedValue([codex]),
            list: vi.fn().mockResolvedValue([]),
            start: vi.fn().mockRejectedValue("Falha de teste"),
            configurePath: vi.fn(),
          },
        },
      ],
    });
  });
  async function render(agent: AgentInfo) {
    const state = TestBed.inject(AgentState);
    state.agents.set([agent]);
    const fixture = TestBed.createComponent(Agents);
    await fixture.whenStable();
    return { state, fixture, root: fixture.nativeElement as HTMLElement };
  }
  it("does not turn a missing CLI into a configurable agent row", async () => {
    const { root } = await render({ ...codex, installed: false, version: null });
    expect(root.textContent).toContain("Nenhum agente configurado");
    expect(root.querySelector(".agent-row")).toBeNull();
  });
  it("shows a confirmed account without asking the user to sign in again", async () => {
    const { root } = await render({ ...codex, authentication: "authenticated" });
    expect(root.textContent).toContain("Pronto para iniciar uma tarefa");
    expect(root.textContent).not.toContain("Conectar conta");
    expect(root.querySelector("app-agent-terminal")).toBeNull();
  });
  it("lists only installed agents", async () => {
    const { state, fixture, root } = await render(codex);
    state.agents.set([
      codex,
      { ...codex, id: "claude", name: "Claude Code", installed: false, executablePath: null },
    ]);
    await fixture.whenStable();
    expect([...root.querySelectorAll(".agent-row")].map((row) => row.textContent)).toEqual([
      expect.stringContaining("Codex"),
    ]);
    expect(root.textContent).not.toContain("Claude Code");
  });
  it("uses each provider icon instead of a letter avatar", async () => {
    const { state, fixture, root } = await render(codex);
    state.agents.set([
      codex,
      { ...codex, id: "claude", name: "Claude Code" },
      { ...codex, id: "opencode", name: "OpenCode" },
      { ...codex, id: "gemini", name: "Gemini CLI" },
    ]);
    await fixture.whenStable();
    expect(
      [...root.querySelectorAll("app-agent-icon")].map((icon) =>
        icon.getAttribute("data-agent-icon"),
      ),
    ).toEqual(["codex", "claude", "opencode", "gemini"]);
    expect(
      [...root.querySelectorAll(".provider-mark")].some((mark) => mark.textContent?.trim()),
    ).toBe(false);
  });
  it("offers device-code login and reports a failed launch beside the chosen agent", async () => {
    const { root, fixture } = await render(codex);
    const button = [...root.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Entrar com código"),
    )!;
    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(AGENT_API).start).toHaveBeenCalledWith(
      "codex",
      "device-login",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Falha de teste");
    expect(button.disabled).toBe(false);
  });
});
