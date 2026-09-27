import { Injectable, computed, inject, signal, type OnDestroy } from '@angular/core';
import { AGENT_API } from './agent-api';
import type { AgentId, AgentInfo, AgentSession } from '@core/domain/agent';
import type { Task } from '@core/domain/task';

@Injectable({ providedIn: 'root' })
export class AgentState implements OnDestroy {
  readonly api = inject(AGENT_API);
  readonly agents = signal<AgentInfo[]>([]);
  readonly sessions = signal<AgentSession[]>([]);
  readonly detecting = signal(false);
  readonly error = signal<string | null>(null);
  readonly errorAgentId = signal<AgentId | null>(null);
  readonly checking = signal<AgentId[]>([]);
  readonly checkedAt = signal<number | null>(null);
  readonly runningCount = computed(() => this.sessions().filter(s => s.status === 'running').length);
  private initialized = false;
  private destroyed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private detection: Promise<void> | null = null;
  private lastAuthCheck = 0;
  private revision = 0;
  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    void this.detect();
    void this.poll();
  }
  async detect(agentId?: AgentId): Promise<void> {
    if (this.detection) {
      await this.detection;
      if (agentId && !this.destroyed) return this.detect(agentId);
      return;
    }
    this.detecting.set(true);
    this.checking.set(agentId ? [agentId] : ['codex', 'claude', 'opencode', 'gemini']);
    this.detection = (async () => {
      try {
        const found = await this.api.detect(agentId);
        if (this.destroyed) return;
        this.agents.update(current => agentId ? current.map(a => found.find(next => next.id === a.id) ?? a) : found);
        this.checkedAt.set(Date.now());
        this.error.set(null); this.errorAgentId.set(null);
      } catch (cause) { this.error.set(String(cause)); this.errorAgentId.set(agentId ?? null); }
      finally { this.detecting.set(false); this.checking.set([]); this.detection = null; }
    })();
    await this.detection;
  }
  private async poll() {
    try {
      const revision = this.revision;
      const sessions = await this.api.list();
      if (!this.destroyed && revision === this.revision) {
        const finished = sessions.filter(s => !s.taskId && s.status !== 'running' && this.sessions().some(previous => previous.id === s.id && previous.status === 'running'));
        this.sessions.set(sessions);
        if (finished.length) {
          for (const id of new Set(finished.map(s => s.agentId))) void this.detect(id);
        } else if (Date.now() - this.lastAuthCheck > 6000 && !this.detecting()) {
          const active = sessions.find(s => !s.taskId && s.status === 'running');
          if (active) { this.lastAuthCheck = Date.now(); void this.detect(active.agentId); }
        }
      }
    } catch (cause) { if (!this.destroyed) this.error.set(String(cause)); }
    if (!this.destroyed) this.timer = setTimeout(() => void this.poll(), 1500);
  }
  async start(agentId: AgentId, purpose: AgentSession['purpose'], task?: Task, projectPath?: string): Promise<AgentSession | null> {
    this.error.set(null);
    this.errorAgentId.set(agentId);
    try {
      const session = await this.api.start(agentId, purpose, task?.id, task?.projectId, projectPath, task?.useWorktree, task?.model, task?.effort);
      this.revision++;
      this.sessions.update(sessions => [session, ...sessions.filter(s => s.id !== session.id)]);
      return session;
    } catch (cause) { this.error.set(String(cause)); return null; }
  }
  async configurePath(agentId: AgentId, path: string | null): Promise<void> {
    this.error.set(null); this.errorAgentId.set(agentId);
    try { await this.api.configurePath(agentId, path); await this.detect(agentId); }
    catch (cause) { this.error.set(String(cause)); }
  }
  async cancel(session: AgentSession) {
    this.error.set(null); this.errorAgentId.set(session.agentId);
    try { await this.api.stop(session.id); }
    catch (cause) { this.error.set(String(cause)); }
  }
  ngOnDestroy() { this.destroyed = true; clearTimeout(this.timer); }
}
