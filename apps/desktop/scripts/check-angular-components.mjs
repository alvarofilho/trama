import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../src/app", import.meta.url));
const errors = [];

for (const tsPath of walk(appRoot)) {
  if (!tsPath.endsWith(".ts") || tsPath.endsWith(".spec.ts")) {
    continue;
  }

  const source = readFileSync(tsPath, "utf8");
  if (!/@Component\s*\(/u.test(source)) {
    continue;
  }

  const componentName = basename(tsPath, ".ts");
  const componentRoot = tsPath.slice(0, -3);
  const requiredFiles = [
    `${componentRoot}.html`,
    `${componentRoot}.scss`,
    `${componentRoot}.spec.ts`,
  ];

  for (const requiredFile of requiredFiles) {
    if (!existsSync(requiredFile)) {
      errors.push(`${relative(requiredFile)} is required for ${relative(tsPath)}`);
    }
  }

  if (/\btemplate\s*:/u.test(source)) {
    errors.push(`${relative(tsPath)} uses an inline template`);
  }
  if (/\bstyles?\s*:/u.test(source)) {
    errors.push(`${relative(tsPath)} uses inline styles`);
  }
  if (!source.includes(`templateUrl: "./${componentName}.html"`)) {
    errors.push(`${relative(tsPath)} must reference ./${componentName}.html with templateUrl`);
  }
  if (!/\bstyleUrls?\s*:/u.test(source) || !source.includes(`"./${componentName}.scss"`)) {
    errors.push(
      `${relative(tsPath)} must reference ./${componentName}.scss with styleUrl or styleUrls`,
    );
  }
}

if (errors.length) {
  console.error("Angular component guardrails failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Angular component guardrails passed.");
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

function relative(path) {
  return path.slice(appRoot.length + 1).replaceAll("\\", "/");
}
