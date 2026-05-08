import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RULESYNC_AIIGNORE_RELATIVE_FILE_PATH } from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { writeFileContent } from "../../utils/file.js";
import { ContinueIgnore } from "./continue-ignore.js";
import { RulesyncIgnore } from "./rulesync-ignore.js";

describe("ContinueIgnore", () => {
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
    it("should target the project root with .continueignore", () => {
      const paths = ContinueIgnore.getSettablePaths();
      expect(paths.relativeDirPath).toBe(".");
      expect(paths.relativeFilePath).toBe(".continueignore");
    });
  });

  describe("toRulesyncIgnore", () => {
    it("should preserve content when converting to RulesyncIgnore", () => {
      const fileContent = "*.log\nnode_modules/\n.env";
      const continueIgnore = new ContinueIgnore({
        outputRoot: testDir,
        relativeDirPath: ".",
        relativeFilePath: ".continueignore",
        fileContent,
      });

      const rulesyncIgnore = continueIgnore.toRulesyncIgnore();

      expect(rulesyncIgnore).toBeInstanceOf(RulesyncIgnore);
      expect(rulesyncIgnore.getFileContent()).toBe(fileContent);
      expect(rulesyncIgnore.getRelativeFilePath()).toBe(RULESYNC_AIIGNORE_RELATIVE_FILE_PATH);
    });
  });

  describe("fromRulesyncIgnore", () => {
    it("should produce .continueignore at the project root", () => {
      const rulesyncIgnore = new RulesyncIgnore({
        relativeDirPath: ".rulesync",
        relativeFilePath: ".rulesignore",
        fileContent: "*.tmp\nbuild/",
      });

      const continueIgnore = ContinueIgnore.fromRulesyncIgnore({
        outputRoot: testDir,
        rulesyncIgnore,
      });

      expect(continueIgnore.getRelativeDirPath()).toBe(".");
      expect(continueIgnore.getRelativeFilePath()).toBe(".continueignore");
      expect(continueIgnore.getFileContent()).toBe("*.tmp\nbuild/");
    });
  });

  describe("fromFile", () => {
    it("should read .continueignore from the project root", async () => {
      const fileContent = "*.log\nnode_modules/";
      await writeFileContent(join(testDir, ".continueignore"), fileContent);

      const continueIgnore = await ContinueIgnore.fromFile({ outputRoot: testDir });

      expect(continueIgnore).toBeInstanceOf(ContinueIgnore);
      expect(continueIgnore.getFileContent()).toBe(fileContent);
    });

    it("should reject when the file is missing", async () => {
      await expect(ContinueIgnore.fromFile({ outputRoot: testDir })).rejects.toThrow();
    });
  });

  describe("forDeletion", () => {
    it("should construct a non-validating placeholder", () => {
      const continueIgnore = ContinueIgnore.forDeletion({
        outputRoot: testDir,
        relativeDirPath: ".",
        relativeFilePath: ".continueignore",
      });

      expect(continueIgnore).toBeInstanceOf(ContinueIgnore);
      expect(continueIgnore.getFileContent()).toBe("");
    });
  });

  describe("round-trip", () => {
    it("should preserve content across ContinueIgnore -> Rulesync -> ContinueIgnore", () => {
      const original = "# Continue ignore\n*.log\nnode_modules/\n.env*";
      const continueIgnore = new ContinueIgnore({
        outputRoot: testDir,
        relativeDirPath: ".",
        relativeFilePath: ".continueignore",
        fileContent: original,
      });

      const roundTrip = ContinueIgnore.fromRulesyncIgnore({
        outputRoot: testDir,
        rulesyncIgnore: continueIgnore.toRulesyncIgnore(),
      });

      expect(roundTrip.getFileContent()).toBe(original);
    });
  });
});
