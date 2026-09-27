import { invoke } from "@tauri-apps/api/core";
import type { RepositoryInspection, RepositoryInspector } from "../domain/project";

export class TauriRepositoryInspector implements RepositoryInspector {
  inspect(path: string): Promise<RepositoryInspection> {
    return invoke<RepositoryInspection>("inspect_repository", { path });
  }
}
