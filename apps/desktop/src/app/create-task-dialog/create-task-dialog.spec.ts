import { TestBed } from "@angular/core/testing";
import { CreateTaskDialog } from "./create-task-dialog";
import type { AgentInfo } from "@core/domain/agent";

describe("CreateTaskDialog agent options", () => {
  it("loads the selected agent model catalog into the model picker", async () => {
    TestBed.configureTestingModule({ imports: [CreateTaskDialog] });
    const fixture = TestBed.createComponent(CreateTaskDialog);
    fixture.componentRef.setInput("availableAgents", [
      {
        id: "codex",
        name: "Codex",
        installed: true,
        version: "fixture",
        authentication: "authenticated",
        detail: "Pronto",
        models: [
          {
            id: "gpt-fixture",
            name: "GPT Fixture",
            description: "Modelo de teste",
            isDefault: true,
            reasoningEfforts: ["low", "high"],
          },
        ],
      } satisfies AgentInfo,
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const picker = root.querySelector<HTMLSelectElement>('select[aria-label="Modelo"]');
    expect(picker).not.toBeNull();
    expect([...picker!.options].map((option) => option.textContent?.trim())).toContain(
      "GPT Fixture — padrão",
    );
  });
});
