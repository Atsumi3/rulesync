import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { stringifyFrontmatter } from "../../utils/frontmatter.js";
import { ContinueCommand } from "./continue-command.js";
import { RulesyncCommand } from "./rulesync-command.js";

describe("ContinueCommand", () => {
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
    it("should target .continue/prompts", () => {
      expect(ContinueCommand.getSettablePaths().relativeDirPath).toBe(
        join(".continue", "prompts"),
      );
    });
  });

  describe("constructor", () => {
    it("should embed frontmatter via stringifyFrontmatter", () => {
      const command = new ContinueCommand({
        outputRoot: testDir,
        relativeDirPath: join(".continue", "prompts"),
        relativeFilePath: "review.md",
        frontmatter: { name: "review", description: "Code review", invokable: true },
        body: "Review this code",
      });

      const content = command.getFileContent();
      expect(content).toContain("name: review");
      expect(content).toContain("description: Code review");
      expect(content).toContain("invokable: true");
      expect(content).toContain("Review this code");
    });
  });

  describe("fromRulesyncCommand", () => {
    it("should pass description and continue-specific fields", () => {
      const rulesyncCommand = new RulesyncCommand({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/commands",
        relativeFilePath: "review.md",
        frontmatter: {
          targets: ["continue"],
          description: "Code review",
          continue: { name: "review", invokable: true },
        },
        body: "Review the code",
      });

      const command = ContinueCommand.fromRulesyncCommand({
        outputRoot: testDir,
        rulesyncCommand,
      });

      expect(command.getFrontmatter()).toMatchObject({
        description: "Code review",
        name: "review",
        invokable: true,
      });
      expect(command.getRelativeDirPath()).toBe(join(".continue", "prompts"));
      expect(command.getRelativeFilePath()).toBe("review.md");
    });
  });

  describe("toRulesyncCommand", () => {
    it("should preserve continue-specific fields under continue section", () => {
      const command = new ContinueCommand({
        outputRoot: testDir,
        relativeDirPath: join(".continue", "prompts"),
        relativeFilePath: "review.md",
        frontmatter: { name: "review", description: "Code review", invokable: true },
        body: "Review the code",
      });

      const rulesync = command.toRulesyncCommand();
      const fm = rulesync.getFrontmatter();
      expect(fm.description).toBe("Code review");
      expect(fm.continue).toMatchObject({ name: "review", invokable: true });
    });
  });

  describe("fromFile", () => {
    it("should parse frontmatter and body", async () => {
      const filePath = join(testDir, ".continue", "prompts", "hi.md");
      await writeFileContent(
        filePath,
        stringifyFrontmatter("Say hi.", { name: "hi", description: "Greeting" }),
      );

      const command = await ContinueCommand.fromFile({
        outputRoot: testDir,
        relativeFilePath: "hi.md",
      });

      expect(command.getFrontmatter()).toMatchObject({ name: "hi", description: "Greeting" });
      expect(command.getBody()).toBe("Say hi.");
    });
  });

  describe("isTargetedByRulesyncCommand", () => {
    it("should accept wildcard and explicit continue target", () => {
      const wildcardCommand = new RulesyncCommand({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/commands",
        relativeFilePath: "x.md",
        frontmatter: { targets: ["*"] },
        body: "",
      });
      const explicitCommand = new RulesyncCommand({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/commands",
        relativeFilePath: "x.md",
        frontmatter: { targets: ["continue"] },
        body: "",
      });
      const otherCommand = new RulesyncCommand({
        outputRoot: testDir,
        relativeDirPath: ".rulesync/commands",
        relativeFilePath: "x.md",
        frontmatter: { targets: ["cursor"] },
        body: "",
      });

      expect(ContinueCommand.isTargetedByRulesyncCommand(wildcardCommand)).toBe(true);
      expect(ContinueCommand.isTargetedByRulesyncCommand(explicitCommand)).toBe(true);
      expect(ContinueCommand.isTargetedByRulesyncCommand(otherCommand)).toBe(false);
    });
  });
});
