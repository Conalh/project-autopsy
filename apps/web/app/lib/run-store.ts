import path from "node:path";
import { existsSync } from "node:fs";
import { createSqliteRunStore } from "@project-autopsy/core";

export function createWebRunStore() {
  return createSqliteRunStore(path.join(findWorkspaceRoot(), ".project-autopsy", "runs.sqlite"));
}

function findWorkspaceRoot(start = process.cwd()): string {
  let current = start;

  while (true) {
    if (existsSync(path.join(current, "fixtures")) && existsSync(path.join(current, "packages"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}
