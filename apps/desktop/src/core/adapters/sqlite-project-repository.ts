import type {
  Project,
  ProjectRepository,
  RepositoryInspection,
} from "../domain/project";
import { appDatabase } from "./database";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  branch: string;
  last_opened_at: string;
}

export class SqliteProjectRepository implements ProjectRepository {
  private initialized?: Promise<void>;

  initialize(): Promise<void> {
    this.initialized ??= this.initializeSchema();
    return this.initialized;
  }

  private async initializeSchema(): Promise<void> {
    const db = await appDatabase();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        branch TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      )
    `);
  }

  async listRecent(): Promise<Project[]> {
    const db = await appDatabase();
    const rows = await db.select<ProjectRow[]>(
      "SELECT id, name, path, branch, last_opened_at FROM projects ORDER BY last_opened_at DESC",
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      branch: row.branch,
      lastOpenedAt: row.last_opened_at,
    }));
  }

  async saveOpened(repository: RepositoryInspection): Promise<Project> {
    const db = await appDatabase();
    const existing = await db.select<ProjectRow[]>(
      "SELECT id FROM projects WHERE path = $1 LIMIT 1",
      [repository.path],
    );
    const project: Project = {
      id: existing[0]?.id ?? crypto.randomUUID(),
      name: repository.name,
      path: repository.path,
      branch: repository.branch,
      lastOpenedAt: new Date().toISOString(),
    };
    await db.execute(
      `INSERT INTO projects (id, name, path, branch, last_opened_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         branch = excluded.branch,
         last_opened_at = excluded.last_opened_at`,
      [project.id, project.name, project.path, project.branch, project.lastOpenedAt],
    );
    return project;
  }
}
