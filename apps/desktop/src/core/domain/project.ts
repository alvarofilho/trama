export interface Project {
  id: string;
  name: string;
  path: string;
  branch: string;
  lastOpenedAt: string;
}

export interface RepositoryInspection {
  name: string;
  path: string;
  branch: string;
}

export interface ProjectRepository {
  listRecent(): Promise<Project[]>;
  saveOpened(repository: RepositoryInspection): Promise<Project>;
}

export interface RepositoryInspector {
  inspect(path: string): Promise<RepositoryInspection>;
}
