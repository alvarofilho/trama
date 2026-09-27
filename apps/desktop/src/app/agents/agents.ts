import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AgentState } from '@app/core/agent-state';
import { AgentTerminal } from '../agent-terminal/agent-terminal';
import { type AgentId, type AgentInfo, type AgentSession } from '@core/domain/agent';
import { PathLabel } from '../shared/path-label/path-label';

@Component({
  selector: 'app-agents', imports: [AgentTerminal, DatePipe, PathLabel],
  templateUrl: './agents.html',
  styleUrl: './agents.css',
})
export class Agents {
  readonly state = inject(AgentState);
  readonly selected = signal<AgentId>('codex');
  readonly busy = signal<AgentId | null>(null);
  readonly showTerminal = linkedSignal({ source: () => this.latest()?.status, computation: () => false });
  readonly current = computed<AgentInfo | undefined>(() => this.state.agents().find(a => a.id === this.selected()) ?? this.state.agents()[0]);
  readonly authSessions = computed(() => this.state.sessions().filter(s => !s.taskId && s.agentId === this.current()?.id));
  readonly latest = computed(() => this.authSessions()[0]);
  readonly connected = computed(() => this.state.agents().filter(a => a.authentication === 'authenticated').length);
  readonly running = computed(() => this.authSessions().find(s => s.status === 'running'));
  readonly localError = signal<string | null>(null);
  readonly guides: Record<AgentId, string> = {
    codex: 'https://developers.openai.com/codex/cli/',
    claude: 'https://code.claude.com/docs/en/setup',
    opencode: 'https://opencode.ai/docs/',
    gemini: 'https://geminicli.com/docs/get-started/installation/',
  };

  select(id: AgentId) { this.selected.set(id); this.showTerminal.set(false); this.localError.set(null); }
  inUse(id: AgentId) { return this.state.sessions().some(s => s.agentId === id && s.status === 'running'); }
  status(agent: AgentInfo) {
    if (this.state.checking().includes(agent.id)) return 'Verificando';
    const active = this.authSessionsFor(agent.id).find(s => s.status === 'running');
    if (active) return active.purpose === 'logout' ? 'Saindo' : 'Conectando';
    if (!agent.installed) return 'Não encontrado';
    return agent.authentication === 'authenticated' ? 'Conectado' : agent.authentication === 'unauthenticated' ? 'Precisa de login' : 'Verificar conta';
  }
  private authSessionsFor(id: AgentId) { return this.state.sessions().filter(s => !s.taskId && s.agentId === id); }
  async start(id: AgentId, purpose: AgentSession['purpose']) {
    if (this.busy()) return;
    this.busy.set(id); this.localError.set(null);
    try { const session = await this.state.start(id, purpose); if (session) this.showTerminal.set(true); } finally { this.busy.set(null); }
  }
  async locate(agent: AgentInfo) {
    this.busy.set(agent.id); this.localError.set(null);
    try {
      const path = await open({ title: 'Localizar ' + agent.name, multiple: false, directory: false });
      if (typeof path === 'string') await this.state.configurePath(agent.id, path);
    } catch (cause) { this.localError.set(String(cause)); } finally { this.busy.set(null); }
  }
  async resetPath(id: AgentId) {
    this.busy.set(id);
    try { await this.state.configurePath(id, null); } finally { this.busy.set(null); }
  }
  async openLink(url: string) {
    try { await openUrl(url); } catch { this.localError.set('Não foi possível abrir o navegador. Copie o link exibido no terminal e abra-o no navegador.'); }
  }
  sessionTitle(session: AgentSession) {
    if (session.purpose === 'logout') return 'Saída da conta';
    return session.purpose === 'device-login' ? 'Login com código' : 'Login pelo navegador';
  }
}
