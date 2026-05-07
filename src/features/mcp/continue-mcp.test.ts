import { join } from "node:path";

import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RULESYNC_RELATIVE_DIR_PATH } from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { ContinueMcp } from "./continue-mcp.js";
import { RulesyncMcp } from "./rulesync-mcp.js";

describe("ContinueMcp", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("getSettablePaths", () => {
    it("should target .continue/mcpServers/rulesync.yaml", () => {
      const paths = ContinueMcp.getSettablePaths();
      expect(paths.relativeDirPath).toBe(join(".continue", "mcpServers"));
      expect(paths.relativeFilePath).toBe("rulesync.yaml");
    });
  });

  describe("fromRulesyncMcp", () => {
    it("should convert canonical mcpServers object to Continue array form", () => {
      const rulesyncMcp = new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: ".mcp.json",
        fileContent: JSON.stringify({
          mcpServers: {
            sqlite: {
              type: "stdio",
              command: "uvx",
              args: ["mcp-server-sqlite"],
              env: { DB_PATH: "/tmp/test.db" },
            },
          },
        }),
      });

      const continueMcp = ContinueMcp.fromRulesyncMcp({
        outputRoot: testDir,
        rulesyncMcp,
      });

      const yaml = continueMcp.getYaml();
      expect(yaml.name).toBe("rulesync-mcp");
      expect(yaml.schema).toBe("v1");
      const servers = yaml.mcpServers as Array<Record<string, unknown>>;
      expect(servers).toHaveLength(1);
      expect(servers[0]?.name).toBe("sqlite");
      expect(servers[0]?.type).toBe("stdio");
      expect(servers[0]?.command).toBe("uvx");
      expect(servers[0]?.args).toEqual(["mcp-server-sqlite"]);
      expect(servers[0]?.env).toEqual({ DB_PATH: "/tmp/test.db" });
    });

    it("should map type 'http' to 'streamable-http' and prefer url over httpUrl", () => {
      const rulesyncMcp = new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: ".mcp.json",
        fileContent: JSON.stringify({
          mcpServers: {
            web: { type: "http", httpUrl: "https://example.com/mcp" },
          },
        }),
      });

      const continueMcp = ContinueMcp.fromRulesyncMcp({
        outputRoot: testDir,
        rulesyncMcp,
      });

      const servers = continueMcp.getYaml().mcpServers as Array<Record<string, unknown>>;
      expect(servers[0]?.type).toBe("streamable-http");
      expect(servers[0]?.url).toBe("https://example.com/mcp");
    });

    it("should produce parseable YAML output", () => {
      const rulesyncMcp = new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: ".mcp.json",
        fileContent: JSON.stringify({
          mcpServers: { foo: { command: "node", args: ["a"] } },
        }),
      });

      const continueMcp = ContinueMcp.fromRulesyncMcp({
        outputRoot: testDir,
        rulesyncMcp,
      });

      const parsed = load(continueMcp.getFileContent()) as Record<string, unknown>;
      expect(parsed.name).toBe("rulesync-mcp");
      expect(Array.isArray(parsed.mcpServers)).toBe(true);
    });
  });

  describe("toRulesyncMcp", () => {
    it("should convert Continue array form back to canonical object form", () => {
      const continueMcp = new ContinueMcp({
        relativeDirPath: join(".continue", "mcpServers"),
        relativeFilePath: "rulesync.yaml",
        fileContent: [
          "name: rulesync-mcp",
          "schema: v1",
          "mcpServers:",
          "  - name: sqlite",
          "    type: stdio",
          "    command: uvx",
          "    args:",
          "      - mcp-server-sqlite",
        ].join("\n"),
      });

      const rulesyncMcp = continueMcp.toRulesyncMcp();
      const exported = JSON.parse(rulesyncMcp.getFileContent());

      expect(exported.mcpServers.sqlite.type).toBe("stdio");
      expect(exported.mcpServers.sqlite.command).toBe("uvx");
      expect(exported.mcpServers.sqlite.args).toEqual(["mcp-server-sqlite"]);
    });

    it("should map 'streamable-http' back to canonical 'http'", () => {
      const continueMcp = new ContinueMcp({
        relativeDirPath: join(".continue", "mcpServers"),
        relativeFilePath: "rulesync.yaml",
        fileContent: [
          "name: rulesync-mcp",
          "schema: v1",
          "mcpServers:",
          "  - name: web",
          "    type: streamable-http",
          "    url: https://example.com/mcp",
        ].join("\n"),
      });

      const rulesyncMcp = continueMcp.toRulesyncMcp();
      const exported = JSON.parse(rulesyncMcp.getFileContent());
      expect(exported.mcpServers.web.type).toBe("http");
    });
  });

  describe("fromFile", () => {
    it("should read .continue/mcpServers/rulesync.yaml", async () => {
      const filePath = join(testDir, ".continue", "mcpServers", "rulesync.yaml");
      await writeFileContent(
        filePath,
        ["name: rulesync-mcp", "schema: v1", "mcpServers: []"].join("\n"),
      );

      const continueMcp = await ContinueMcp.fromFile({ outputRoot: testDir });
      expect(continueMcp.getYaml().name).toBe("rulesync-mcp");
    });

    it("should default to empty config when file is missing", async () => {
      const continueMcp = await ContinueMcp.fromFile({ outputRoot: testDir });
      expect(continueMcp.getYaml()).toEqual({});
    });
  });
});
