import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { stringifyFrontmatter } from "../../utils/frontmatter.js";
import { ContinueSubagent } from "./continue-subagent.js";
import { RulesyncSubagent } from "./rulesync-subagent.js";

describe("ContinueSubagent", () => {
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
    it("should target .continue/agents", () => {
      expect(ContinueSubagent.getSettablePaths().relativeDirPath).toBe(
        join(".continue", "agents"),
      );
    });
  });

  describe("constructor", () => {
    it("should validate that name is required", () => {
      const body = "agent body";
      const frontmatter = { name: "planner", description: "Plans tasks" };
      const subagent = new ContinueSubagent({
        outputRoot: testDir,
        relativeDirPath: join(".continue", "agents"),
        relativeFilePath: "planner.md",
        frontmatter,
        body,
        fileContent: stringifyFrontmatter(body, frontmatter, { avoidBlockScalars: true }),
      });

      expect(subagent.getFrontmatter().name).toBe("planner");
      expect(subagent.getBody()).toBe(body);
    });

    it("should reject frontmatter missing name", () => {
      expect(
        () =>
          new ContinueSubagent({
            outputRoot: testDir,
            relativeDirPath: join(".continue", "agents"),
            relativeFilePath: "no-name.md",
            // eslint-disable-next-line no-type-assertion/no-type-assertion
            frontmatter: {} as { name: string },
            body: "body",
            fileContent: "",
          }),
      ).toThrow();
    });
  });

  describe("fromRulesyncSubagent", () => {
    it("should preserve continue-specific fields", () => {
      const rulesyncSubagent = new RulesyncSubagent({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/subagents",
        relativeFilePath: "planner.md",
        frontmatter: {
          targets: ["continue"],
          name: "planner",
          description: "Plans",
          continue: { model: "anthropic/claude-3.5-sonnet", tools: ["search", "edit"] },
        },
        body: "Plan things.",
      });

      const subagent = ContinueSubagent.fromRulesyncSubagent({
        outputRoot: testDir,
        rulesyncSubagent,
      });

      const fm = subagent.getFrontmatter();
      expect(fm.name).toBe("planner");
      expect(fm.description).toBe("Plans");
      expect(fm.model).toBe("anthropic/claude-3.5-sonnet");
      expect(fm.tools).toEqual(["search", "edit"]);
      expect(subagent.getRelativeDirPath()).toBe(join(".continue", "agents"));
      expect(subagent.getRelativeFilePath()).toBe("planner.md");
    });
  });

  describe("toRulesyncSubagent", () => {
    it("should round-trip continue fields under continue section", () => {
      const body = "agent body";
      const frontmatter = {
        name: "planner",
        description: "Plans",
        model: "anthropic/claude-3.5-sonnet",
        tools: ["search"],
      };
      const subagent = new ContinueSubagent({
        outputRoot: testDir,
        relativeDirPath: join(".continue", "agents"),
        relativeFilePath: "planner.md",
        frontmatter,
        body,
        fileContent: stringifyFrontmatter(body, frontmatter, { avoidBlockScalars: true }),
      });

      const rulesync = subagent.toRulesyncSubagent();
      const fm = rulesync.getFrontmatter();
      expect(fm.name).toBe("planner");
      expect(fm.description).toBe("Plans");
      expect(fm.continue).toMatchObject({
        model: "anthropic/claude-3.5-sonnet",
        tools: ["search"],
      });
    });
  });

  describe("fromFile", () => {
    it("should read and parse a subagent file", async () => {
      const filePath = join(testDir, ".continue", "agents", "planner.md");
      const body = "Plan things.";
      const frontmatter = { name: "planner", description: "Plans" };
      await writeFileContent(filePath, stringifyFrontmatter(body, frontmatter));

      const subagent = await ContinueSubagent.fromFile({
        outputRoot: testDir,
        relativeFilePath: "planner.md",
      });

      expect(subagent.getFrontmatter().name).toBe("planner");
      expect(subagent.getBody()).toBe(body);
    });
  });

  describe("isTargetedByRulesyncSubagent", () => {
    it("should accept wildcard and explicit continue target", () => {
      const wildcard = new RulesyncSubagent({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/subagents",
        relativeFilePath: "x.md",
        frontmatter: { targets: ["*"], name: "x" },
        body: "",
      });
      expect(ContinueSubagent.isTargetedByRulesyncSubagent(wildcard)).toBe(true);

      const other = new RulesyncSubagent({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/subagents",
        relativeFilePath: "x.md",
        frontmatter: { targets: ["cursor"], name: "x" },
        body: "",
      });
      expect(ContinueSubagent.isTargetedByRulesyncSubagent(other)).toBe(false);
    });
  });
});
