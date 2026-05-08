import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RULESYNC_RULES_RELATIVE_DIR_PATH } from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { stringifyFrontmatter } from "../../utils/frontmatter.js";
import { ContinueRule } from "./continue-rule.js";
import { RulesyncRule } from "./rulesync-rule.js";

describe("ContinueRule", () => {
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
    it("should target .continue/rules", () => {
      const paths = ContinueRule.getSettablePaths();
      expect(paths.nonRoot.relativeDirPath).toBe(join(".continue", "rules"));
    });

    it("should respect excludeToolDir", () => {
      const paths = ContinueRule.getSettablePaths({ excludeToolDir: true });
      expect(paths.nonRoot.relativeDirPath).toBe("rules");
    });
  });

  describe("constructor", () => {
    it("should create with minimal frontmatter", () => {
      const rule = new ContinueRule({
        frontmatter: {},
        body: "rule body",
        relativeDirPath: join(".continue", "rules"),
        relativeFilePath: "test.md",
      });
      expect(rule.getBody()).toBe("rule body");
      expect(rule.getFrontmatter()).toEqual({});
    });

    it("should emit YAML frontmatter for full content", () => {
      const rule = new ContinueRule({
        frontmatter: {
          name: "ts-style",
          description: "TypeScript style",
          globs: ["**/*.ts"],
          alwaysApply: false,
          invokable: true,
        },
        body: "Use strict mode",
        relativeDirPath: join(".continue", "rules"),
        relativeFilePath: "ts.md",
      });

      const content = rule.getFileContent();
      expect(content).toContain("name: ts-style");
      expect(content).toContain("description: TypeScript style");
      expect(content).toContain("invokable: true");
      expect(content).toContain("alwaysApply: false");
      expect(content).toContain("Use strict mode");
    });
  });

  describe("fromRulesyncRule", () => {
    it("should map rulesync globs and description to Continue frontmatter", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: {
          targets: ["continue"],
          root: false,
          description: "Style guide",
          globs: ["**/*.ts", "**/*.tsx"],
        },
        body: "Rule body",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "ts-style.md",
      });

      const rule = ContinueRule.fromRulesyncRule({
        outputRoot: testDir,
        rulesyncRule,
      });

      const fm = rule.getFrontmatter();
      expect(fm.description).toBe("Style guide");
      expect(fm.globs).toEqual(["**/*.ts", "**/*.tsx"]);
      expect(fm.alwaysApply).toBeUndefined();
      expect(rule.getRelativeFilePath()).toBe("ts-style.md");
      expect(rule.getRelativeDirPath()).toBe(join(".continue", "rules"));
    });

    it("should mark root rules as alwaysApply: true", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: {
          targets: ["continue"],
          root: true,
          description: "Overview",
          globs: [],
        },
        body: "Top-level guidance",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "overview.md",
      });

      const rule = ContinueRule.fromRulesyncRule({
        outputRoot: testDir,
        rulesyncRule,
      });

      expect(rule.getFrontmatter().alwaysApply).toBe(true);
    });

    it("should let continue-specific overrides take priority over generic globs", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: {
          targets: ["continue"],
          root: false,
          description: "test",
          globs: ["**/*.ts"],
          continue: {
            globs: ["src/**/*.ts"],
            invokable: true,
            regex: "TODO",
            name: "todo-finder",
          },
        },
        body: "body",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "todo.md",
      });

      const rule = ContinueRule.fromRulesyncRule({
        outputRoot: testDir,
        rulesyncRule,
      });

      const fm = rule.getFrontmatter();
      expect(fm.globs).toEqual(["src/**/*.ts"]);
      expect(fm.invokable).toBe(true);
      expect(fm.regex).toBe("TODO");
      expect(fm.name).toBe("todo-finder");
    });
  });

  describe("toRulesyncRule", () => {
    it("should round-trip alwaysApply: true to root: true", () => {
      const rule = new ContinueRule({
        frontmatter: { alwaysApply: true, description: "always" },
        body: "body",
        relativeDirPath: join(".continue", "rules"),
        relativeFilePath: "always.md",
      });

      const rulesync = rule.toRulesyncRule();
      const fm = rulesync.getFrontmatter();
      expect(fm.root).toBe(true);
      expect(fm.globs).toEqual(["**/*"]);
      expect(fm.continue?.alwaysApply).toBe(true);
    });

    it("should normalize comma-separated glob string into array", () => {
      const rule = new ContinueRule({
        frontmatter: { globs: "**/*.ts, **/*.tsx" },
        body: "body",
        relativeDirPath: join(".continue", "rules"),
        relativeFilePath: "ts.md",
        validate: false,
      });

      const rulesync = rule.toRulesyncRule();
      expect(rulesync.getFrontmatter().globs).toEqual(["**/*.ts", "**/*.tsx"]);
    });
  });

  describe("fromFile", () => {
    it("should parse frontmatter and body from .continue/rules/<name>.md", async () => {
      const filePath = join(testDir, ".continue", "rules", "sample.md");
      const fileContent = stringifyFrontmatter("Body content", {
        name: "sample",
        description: "Sample rule",
        globs: ["**/*.ts"],
      });
      await writeFileContent(filePath, fileContent);

      const rule = await ContinueRule.fromFile({
        outputRoot: testDir,
        relativeFilePath: "sample.md",
      });

      const fm = rule.getFrontmatter();
      expect(fm.name).toBe("sample");
      expect(fm.description).toBe("Sample rule");
      expect(fm.globs).toEqual(["**/*.ts"]);
      expect(rule.getBody()).toBe("Body content");
    });
  });

  describe("isTargetedByRulesyncRule", () => {
    it("should match wildcard targets", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: { targets: ["*"] },
        body: "",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "x.md",
      });
      expect(ContinueRule.isTargetedByRulesyncRule(rulesyncRule)).toBe(true);
    });

    it("should match explicit continue target", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: { targets: ["continue"] },
        body: "",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "x.md",
      });
      expect(ContinueRule.isTargetedByRulesyncRule(rulesyncRule)).toBe(true);
    });

    it("should reject when targeting other tools only", () => {
      const rulesyncRule = new RulesyncRule({
        frontmatter: { targets: ["cursor"] },
        body: "",
        relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
        relativeFilePath: "x.md",
      });
      expect(ContinueRule.isTargetedByRulesyncRule(rulesyncRule)).toBe(false);
    });
  });
});
