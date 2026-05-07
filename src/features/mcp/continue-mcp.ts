import { join } from "node:path";

import { dump, load } from "js-yaml";

import { ValidationResult } from "../../types/ai-file.js";
import { isMcpServers, type McpServers } from "../../types/mcp.js";
import { formatError } from "../../utils/error.js";
import { readFileContentOrNull } from "../../utils/file.js";
import { RulesyncMcp } from "./rulesync-mcp.js";
import {
  ToolMcp,
  ToolMcpForDeletionParams,
  ToolMcpFromFileParams,
  ToolMcpFromRulesyncMcpParams,
  ToolMcpParams,
  ToolMcpSettablePaths,
} from "./tool-mcp.js";

const CONTINUE_BLOCK_FILE_NAME = "rulesync.yaml";

type ContinueServerEntry = {
  name: string;
  type?: string;
  command?: string | string[];
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  cwd?: string;
  [key: string]: unknown;
};

function toContinueTransport(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "http") return "streamable-http";
  if (value === "local") return "stdio";
  return value;
}

function fromContinueTransport(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "streamable-http") return "http";
  return value;
}

function toContinueServers(mcpServers: McpServers): ContinueServerEntry[] {
  return Object.entries(mcpServers).map(([name, config]) => {
    const entry: ContinueServerEntry = { name };
    const transport = toContinueTransport(config.type ?? config.transport);
    if (transport) entry.type = transport;
    if (config.command !== undefined) entry.command = config.command;
    if (config.args !== undefined) entry.args = config.args;
    const url = config.url ?? config.httpUrl;
    if (url !== undefined) entry.url = url;
    if (config.env !== undefined) entry.env = config.env;
    if (config.cwd !== undefined) entry.cwd = config.cwd;
    return entry;
  });
}

function fromContinueServers(servers: unknown): McpServers {
  if (!Array.isArray(servers)) return {};
  const result: McpServers = {};
  for (const raw of servers) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name : undefined;
    if (!name) continue;
    const transport = fromContinueTransport(entry.type);
    const { name: _name, type: _type, ...rest } = entry;
    result[name] = {
      ...(transport ? { type: transport as McpServers[string]["type"] } : {}),
      ...rest,
    } as McpServers[string];
  }
  return result;
}

export type ContinueMcpParams = ToolMcpParams;

export class ContinueMcp extends ToolMcp {
  private readonly yaml: Record<string, unknown>;

  constructor(params: ToolMcpParams) {
    super(params);
    if (this.fileContent !== undefined && this.fileContent !== "") {
      try {
        const parsed = load(this.fileContent);
        this.yaml =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
      } catch (error) {
        throw new Error(
          `Failed to parse Continue MCP config at ${join(this.relativeDirPath, this.relativeFilePath)}: ${formatError(error)}`,
          { cause: error },
        );
      }
    } else {
      this.yaml = {};
    }
  }

  getYaml(): Record<string, unknown> {
    return this.yaml;
  }

  static getSettablePaths(_options?: { global?: boolean }): ToolMcpSettablePaths {
    return {
      relativeDirPath: join(".continue", "mcpServers"),
      relativeFilePath: CONTINUE_BLOCK_FILE_NAME,
    };
  }

  static async fromFile({
    outputRoot = process.cwd(),
    validate = true,
  }: ToolMcpFromFileParams): Promise<ContinueMcp> {
    const paths = this.getSettablePaths();
    const filePath = join(outputRoot, paths.relativeDirPath, paths.relativeFilePath);
    const fileContent = (await readFileContentOrNull(filePath)) ?? "";

    return new ContinueMcp({
      outputRoot,
      relativeDirPath: paths.relativeDirPath,
      relativeFilePath: paths.relativeFilePath,
      fileContent,
      validate,
    });
  }

  static fromRulesyncMcp({
    outputRoot = process.cwd(),
    rulesyncMcp,
    validate = true,
  }: ToolMcpFromRulesyncMcpParams): ContinueMcp {
    const paths = this.getSettablePaths();
    const rulesyncJson = rulesyncMcp.getJson();
    const mcpServers = isMcpServers(rulesyncJson.mcpServers) ? rulesyncJson.mcpServers : {};
    const continueServers = toContinueServers(mcpServers);

    const block: Record<string, unknown> = {
      name: "rulesync-mcp",
      schema: "v1",
      mcpServers: continueServers,
    };

    return new ContinueMcp({
      outputRoot,
      relativeDirPath: paths.relativeDirPath,
      relativeFilePath: paths.relativeFilePath,
      fileContent: dump(block, { lineWidth: -1 }),
      validate,
    });
  }

  toRulesyncMcp(): RulesyncMcp {
    const mcpServers = fromContinueServers(this.yaml.mcpServers);
    return this.toRulesyncMcpDefault({
      fileContent: JSON.stringify({ mcpServers }, null, 2),
    });
  }

  validate(): ValidationResult {
    return { success: true, error: null };
  }

  static forDeletion({
    outputRoot = process.cwd(),
    relativeDirPath,
    relativeFilePath,
  }: ToolMcpForDeletionParams): ContinueMcp {
    return new ContinueMcp({
      outputRoot,
      relativeDirPath,
      relativeFilePath,
      fileContent: "",
      validate: false,
    });
  }
}
