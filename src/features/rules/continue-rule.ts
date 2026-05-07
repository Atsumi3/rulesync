import { join } from "node:path";

import { z } from "zod/mini";

import { RULESYNC_RULES_RELATIVE_DIR_PATH } from "../../constants/rulesync-paths.js";
import { AiFileParams, ValidationResult } from "../../types/ai-file.js";
import type { RulesyncTargets } from "../../types/tool-targets.js";
import { formatError } from "../../utils/error.js";
import { readFileContent } from "../../utils/file.js";
import { parseFrontmatter, stringifyFrontmatter } from "../../utils/frontmatter.js";
import { RulesyncRule, RulesyncRuleFrontmatter } from "./rulesync-rule.js";
import {
  ToolRule,
  ToolRuleForDeletionParams,
  ToolRuleFromFileParams,
  ToolRuleFromRulesyncRuleParams,
  ToolRuleSettablePaths,
  buildToolPath,
} from "./tool-rule.js";

export const ContinueRuleFrontmatterSchema = z.looseObject({
  name: z.optional(z.string()),
  description: z.optional(z.string()),
  globs: z.optional(z.union([z.string(), z.array(z.string())])),
  regex: z.optional(z.string()),
  alwaysApply: z.optional(z.boolean()),
  invokable: z.optional(z.boolean()),
});

function parseContinueGlobs(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export type ContinueRuleFrontmatter = z.infer<typeof ContinueRuleFrontmatterSchema>;

export type ContinueRuleParams = {
  frontmatter: ContinueRuleFrontmatter;
  body: string;
} & Omit<AiFileParams, "fileContent">;

export type ContinueRuleSettablePaths = Omit<ToolRuleSettablePaths, "root"> & {
  nonRoot: {
    relativeDirPath: string;
  };
};

export class ContinueRule extends ToolRule {
  private readonly frontmatter: ContinueRuleFrontmatter;
  private readonly body: string;

  static getSettablePaths(
    options: {
      global?: boolean;
      excludeToolDir?: boolean;
    } = {},
  ): ContinueRuleSettablePaths {
    return {
      nonRoot: {
        relativeDirPath: buildToolPath(".continue", "rules", options.excludeToolDir),
      },
    };
  }

  constructor({ frontmatter, body, ...rest }: ContinueRuleParams) {
    if (rest.validate) {
      const result = ContinueRuleFrontmatterSchema.safeParse(frontmatter);
      if (!result.success) {
        throw new Error(
          `Invalid frontmatter in ${join(rest.relativeDirPath, rest.relativeFilePath)}: ${formatError(result.error)}`,
        );
      }
    }

    super({
      ...rest,
      fileContent: stringifyFrontmatter(body, frontmatter),
    });

    this.frontmatter = frontmatter;
    this.body = body;
  }

  toRulesyncRule(): RulesyncRule {
    const targets: RulesyncTargets = ["*"];

    const globsArray = parseContinueGlobs(this.frontmatter.globs);
    const isAlwaysApply = this.frontmatter.alwaysApply === true;

    const rulesyncFrontmatter: RulesyncRuleFrontmatter = {
      targets,
      root: isAlwaysApply,
      description: this.frontmatter.description,
      globs: globsArray.length > 0 ? globsArray : isAlwaysApply ? ["**/*"] : [],
      continue: {
        alwaysApply: this.frontmatter.alwaysApply,
        globs: globsArray.length > 0 ? globsArray : undefined,
        regex: this.frontmatter.regex,
        invokable: this.frontmatter.invokable,
        name: this.frontmatter.name,
      },
    };

    return new RulesyncRule({
      frontmatter: rulesyncFrontmatter,
      body: this.body,
      relativeDirPath: RULESYNC_RULES_RELATIVE_DIR_PATH,
      relativeFilePath: this.relativeFilePath,
      validate: true,
    });
  }

  static fromRulesyncRule({
    outputRoot = process.cwd(),
    rulesyncRule,
    validate = true,
  }: ToolRuleFromRulesyncRuleParams): ContinueRule {
    const rulesyncFrontmatter = rulesyncRule.getFrontmatter();
    const continueOverrides = rulesyncFrontmatter.continue;

    const resolvedGlobs = continueOverrides?.globs ?? rulesyncFrontmatter.globs;
    const continueFrontmatter: ContinueRuleFrontmatter = {
      name: continueOverrides?.name,
      description: rulesyncFrontmatter.description,
      globs: resolvedGlobs && resolvedGlobs.length > 0 ? resolvedGlobs : undefined,
      regex: continueOverrides?.regex,
      alwaysApply: continueOverrides?.alwaysApply ?? (rulesyncFrontmatter.root ? true : undefined),
      invokable: continueOverrides?.invokable,
    };

    return new ContinueRule({
      outputRoot,
      frontmatter: continueFrontmatter,
      body: rulesyncRule.getBody(),
      relativeDirPath: this.getSettablePaths().nonRoot.relativeDirPath,
      relativeFilePath: rulesyncRule.getRelativeFilePath(),
      validate,
    });
  }

  static async fromFile({
    outputRoot = process.cwd(),
    relativeFilePath,
    validate = true,
  }: ToolRuleFromFileParams): Promise<ContinueRule> {
    const filePath = join(
      outputRoot,
      this.getSettablePaths().nonRoot.relativeDirPath,
      relativeFilePath,
    );
    const fileContent = await readFileContent(filePath);

    const { frontmatter, body: content } = parseFrontmatter(fileContent, filePath);

    const result = ContinueRuleFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      throw new Error(`Invalid frontmatter in ${filePath}: ${formatError(result.error)}`);
    }

    return new ContinueRule({
      outputRoot,
      relativeDirPath: this.getSettablePaths().nonRoot.relativeDirPath,
      relativeFilePath,
      frontmatter: result.data,
      body: content.trim(),
      validate,
    });
  }

  static forDeletion({
    outputRoot = process.cwd(),
    relativeDirPath,
    relativeFilePath,
  }: ToolRuleForDeletionParams): ContinueRule {
    return new ContinueRule({
      outputRoot,
      relativeDirPath,
      relativeFilePath,
      frontmatter: {},
      body: "",
      validate: false,
    });
  }

  validate(): ValidationResult {
    if (!this.frontmatter) {
      return { success: true, error: null };
    }
    const result = ContinueRuleFrontmatterSchema.safeParse(this.frontmatter);
    if (result.success) {
      return { success: true, error: null };
    }
    return {
      success: false,
      error: new Error(
        `Invalid frontmatter in ${join(this.relativeDirPath, this.relativeFilePath)}: ${formatError(result.error)}`,
      ),
    };
  }

  getFrontmatter(): ContinueRuleFrontmatter {
    return this.frontmatter;
  }

  getBody(): string {
    return this.body;
  }

  static isTargetedByRulesyncRule(rulesyncRule: RulesyncRule): boolean {
    return this.isTargetedByRulesyncRuleDefault({
      rulesyncRule,
      toolTarget: "continue",
    });
  }
}
