import { InjectionToken } from "@angular/core";
import type { AgentGateway } from "@core/domain/agent";
import { TauriAgentGateway } from "@core/adapters/tauri-agent-gateway";
export const AGENT_API = new InjectionToken<AgentGateway>("AGENT_API", {
  providedIn: "root",
  factory: () => new TauriAgentGateway(),
});
