import { TestBed } from '@angular/core/testing';
import { Agents } from './agents';
import { AgentState } from '@app/core/agent-state';
import { AGENT_API } from '@app/core/agent-api';
import type { AgentInfo } from '@core/domain/agent';

const codex: AgentInfo = { id: 'codex', name: 'Codex', installed: true, version: 'codex-cli fixture', authentication: 'unauthenticated', detail: 'Entre com sua conta.', source: 'Aplicativo Codex', executablePath: 'C:/Codex/codex.exe' };

describe('Agent connection experience', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Agents], providers: [{ provide: AGENT_API, useValue: { detect: vi.fn().mockResolvedValue([codex]), list: vi.fn().mockResolvedValue([]), start: vi.fn().mockRejectedValue('Falha de teste'), configurePath: vi.fn() } }] });
  });
  async function render(agent: AgentInfo) {
    const state = TestBed.inject(AgentState);
    state.agents.set([agent]);
    const fixture = TestBed.createComponent(Agents);
    await fixture.whenStable();
    return { state, fixture, root: fixture.nativeElement as HTMLElement };
  }
  it('offers a recovery action when the CLI is not found instead of a disabled login', async () => {
    const { root } = await render({ ...codex, installed: false, version: null });
    expect(root.textContent).toContain('Vamos encontrar o Codex');
    const primary = root.querySelector<HTMLButtonElement>('.primary-button')!;
    expect(primary.textContent).toContain('Localizar CLI');
    expect(primary.disabled).toBe(false);
    expect(root.textContent).not.toContain('Conectar conta');
  });
  it('shows a confirmed account without asking the user to sign in again', async () => {
    const { root } = await render({ ...codex, authentication: 'authenticated' });
    expect(root.textContent).toContain('Pronto para iniciar uma tarefa');
    expect(root.textContent).not.toContain('Conectar conta');
    expect(root.querySelector('app-agent-terminal')).toBeNull();
  });
  it('offers device-code login and reports a failed launch beside the chosen agent', async () => {
    const { root, fixture } = await render(codex);
    const button = [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Entrar com código'))!;
    button.click();
    await fixture.whenStable();
    expect(TestBed.inject(AGENT_API).start).toHaveBeenCalledWith('codex', 'device-login', undefined, undefined, undefined, undefined, undefined, undefined);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Falha de teste');
    expect(button.disabled).toBe(false);
  });
});
