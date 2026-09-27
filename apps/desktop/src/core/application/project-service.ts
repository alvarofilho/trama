import type {
  Project,
  ProjectRepository,
  RepositoryInspection,
  RepositoryInspector,
} from "../domain/project";

export class ProjectService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly git: RepositoryInspector,
  ) {}

  listRecent(): Promise<Project[]> {
    return this.projects.listRecent();
  }

  async openRepository(path: string): Promise<Project> {
    const repository: RepositoryInspection = await this.git.inspect(path);
    return this.projects.saveOpened(repository);
  }
}
