import Database from "@tauri-apps/plugin-sql";

let connection: Promise<Database> | undefined;

export function appDatabase(): Promise<Database> {
  connection ??= Database.load("sqlite:trama.db");
  return connection;
}
