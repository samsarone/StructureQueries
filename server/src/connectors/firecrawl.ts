import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";

import { env } from "../config/env.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

// Resolve the local CLI once so the adapter can invoke the installed package directly.
const firecrawlPackageJsonPath = require.resolve("firecrawl-cli/package.json");
const firecrawlCliPath = path.join(
  path.dirname(firecrawlPackageJsonPath),
  "dist",
  "index.js"
);

export interface FirecrawlCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface FirecrawlCommandResult {
  command: string[];
  exitCode: number;
  ok: boolean;
  stderr: string;
  stdout: string;
}

function buildFirecrawlEnvironment(overrides: NodeJS.ProcessEnv = {}) {
  return {
    ...process.env,
    ...(env.integrations.firecrawl.apiKey
      ? { FIRECRAWL_API_KEY: env.integrations.firecrawl.apiKey }
      : {}),
    ...overrides
  };
}

export function isFirecrawlConfigured() {
  return Boolean(env.integrations.firecrawl.apiKey);
}

export function getFirecrawlCliPath() {
  return firecrawlCliPath;
}

export async function runFirecrawlCli(
  args: string[] = [],
  options: FirecrawlCommandOptions = {}
): Promise<FirecrawlCommandResult> {
  const command = [process.execPath, firecrawlCliPath, ...args];

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, command.slice(1), {
      cwd: options.cwd,
      env: buildFirecrawlEnvironment(options.env),
      maxBuffer: 10 * 1024 * 1024,
      timeout: options.timeoutMs ?? env.integrations.firecrawl.timeoutMs
    });

    return {
      command,
      exitCode: 0,
      ok: true,
      stderr: String(stderr).trim(),
      stdout: String(stdout).trim()
    };
  } catch (error) {
    const executionError = error as NodeJS.ErrnoException & {
      code?: number | string;
      stderr?: string | Buffer;
      stdout?: string | Buffer;
    };

    return {
      command,
      exitCode: typeof executionError.code === "number" ? executionError.code : 1,
      ok: false,
      stderr: String(executionError.stderr ?? executionError.message).trim(),
      stdout: String(executionError.stdout ?? "").trim()
    };
  }
}

export const firecrawlCliConnector = {
  id: "firecrawl-cli",
  packageName: "firecrawl-cli",
  runtime: "cli",
  isConfigured: isFirecrawlConfigured,
  getCliPath: getFirecrawlCliPath,
  run: runFirecrawlCli
} as const;
