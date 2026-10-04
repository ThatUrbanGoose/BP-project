import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import {
  z,
} from "zod";

import {
  environment,
} from "../config/environment.js";


export type PronunciationRuleKind =
  | "term"
  | "character";


export type PronunciationRuleScope =
  | "global"
  | "story";


export type PronunciationRule = {
  id: string;
  kind:
    PronunciationRuleKind;
  scope:
    PronunciationRuleScope;
  storyId:
    string | null;
  source: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  enabled: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
};


export type PronunciationDictionary = {
  version: 1;
  scope:
    PronunciationRuleScope;
  storyId:
    string | null;
  revision: string;
  updatedAt: string;
  rules:
    PronunciationRule[];
};


export type CreatePronunciationRuleInput = {
  kind:
    PronunciationRuleKind;
  source: string;
  replacement: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  enabled?: boolean;
  description?: string;
};


export type UpdatePronunciationRuleInput = {
  kind?:
    PronunciationRuleKind
    | undefined;

  source?:
    string
    | undefined;

  replacement?:
    string
    | undefined;

  caseSensitive?:
    boolean
    | undefined;

  wholeWord?:
    boolean
    | undefined;

  enabled?:
    boolean
    | undefined;

  description?:
    string
    | undefined;
};


const pronunciationRuleSchema =
  z.object({
    id:
      z.string()
        .uuid(),

    kind:
      z.enum([
        "term",
        "character",
      ]),

    scope:
      z.enum([
        "global",
        "story",
      ]),

    storyId:
      z.string()
        .nullable(),

    source:
      z.string()
        .trim()
        .min(1)
        .max(500),

    replacement:
      z.string()
        .trim()
        .min(1)
        .max(500),

    caseSensitive:
      z.boolean(),

    wholeWord:
      z.boolean(),

    enabled:
      z.boolean(),

    description:
      z.string()
        .max(1000),

    createdAt:
      z.string()
        .datetime(),

    updatedAt:
      z.string()
        .datetime(),
  });


const pronunciationDictionarySchema =
  z.object({
    version:
      z.literal(1),

    scope:
      z.enum([
        "global",
        "story",
      ]),

    storyId:
      z.string()
        .nullable(),

    revision:
      z.string()
        .regex(
          /^[a-f0-9]{64}$/,
        ),

    updatedAt:
      z.string()
        .datetime(),

    rules:
      z.array(
        pronunciationRuleSchema,
      ),
  });


function normalizeRuleText(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    );
}


function validateStoryId(
  storyId: string,
): string {
  const normalizedStoryId =
    storyId.trim();

  if (
    !/^[A-Za-z0-9._-]{1,100}$/
      .test(
        normalizedStoryId,
      )
  ) {
    throw new Error(
      "The story ID is invalid.",
    );
  }

  return normalizedStoryId;
}


function getStoriesDirectory():
string {
  return path.join(
    environment
      .directories
      .pronunciations,

    "stories",
  );
}


function getGlobalDictionaryPath():
string {
  return path.join(
    environment
      .directories
      .pronunciations,

    "global.json",
  );
}


function getStoryDictionaryPath(
  storyId: string,
): string {
  const safeStoryId =
    validateStoryId(
      storyId,
    );

  return path.join(
    getStoriesDirectory(),
    `${safeStoryId}.json`,
  );
}


function sortRules(
  rules:
    PronunciationRule[],
): PronunciationRule[] {
  return [
    ...rules,
  ].sort(
    (
      first,
      second,
    ) => {
      const kindComparison =
        first.kind.localeCompare(
          second.kind,
        );

      if (
        kindComparison !== 0
      ) {
        return kindComparison;
      }

      const sourceComparison =
        first.source.localeCompare(
          second.source,
        );

      if (
        sourceComparison !== 0
      ) {
        return sourceComparison;
      }

      return first.id.localeCompare(
        second.id,
      );
    },
  );
}


function createRevision(
  rules:
    PronunciationRule[],
): string {
  const revisionInput =
    sortRules(
      rules,
    ).map(
      (
        rule,
      ) => ({
        id:
          rule.id,

        kind:
          rule.kind,

        source:
          normalizeRuleText(
            rule.source,
          ),

        replacement:
          normalizeRuleText(
            rule.replacement,
          ),

        caseSensitive:
          rule.caseSensitive,

        wholeWord:
          rule.wholeWord,

        enabled:
          rule.enabled,
      }),
    );

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        revisionInput,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}


function createEmptyDictionary(
  scope:
    PronunciationRuleScope,

  storyId:
    string | null,
): PronunciationDictionary {
  return {
    version: 1,

    scope,

    storyId,

    revision:
      createRevision(
        [],
      ),

    updatedAt:
      new Date()
        .toISOString(),

    rules: [],
  };
}


async function writeJsonAtomically(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath =
    `${filePath}.temporary`;

  await mkdir(
    path.dirname(
      filePath,
    ),
    {
      recursive: true,
    },
  );

  await writeFile(
    temporaryPath,
    JSON.stringify(
      value,
      null,
      2,
    ),
    "utf8",
  );

  await rename(
    temporaryPath,
    filePath,
  );
}


function isFileNotFoundError(
  error: unknown,
): boolean {
  if (
    error === null
    || typeof error !==
      "object"
    || !(
      "code" in error
    )
  ) {
    return false;
  }

  return error.code ===
    "ENOENT";
}


async function readDictionary(
  filePath: string,
  defaultDictionary:
    PronunciationDictionary,
): Promise<PronunciationDictionary> {
  try {
    const fileText =
      await readFile(
        filePath,
        "utf8",
      );

    const parsedValue:
      unknown =
        JSON.parse(
          fileText,
        );

    const validation =
      pronunciationDictionarySchema
        .safeParse(
          parsedValue,
        );

    if (
      !validation.success
    ) {
      throw new Error(
        "The pronunciation dictionary "
        + "is invalid.",
      );
    }

    return validation.data;

  } catch (error) {
    if (
      isFileNotFoundError(
        error,
      )
    ) {
      return defaultDictionary;
    }

    throw error;
  }
}


async function saveDictionary(
  filePath: string,
  dictionary:
    PronunciationDictionary,
): Promise<PronunciationDictionary> {
  const sortedRules =
    sortRules(
      dictionary.rules,
    );

  const savedDictionary:
    PronunciationDictionary = {
      version: 1,

      scope:
        dictionary.scope,

      storyId:
        dictionary.storyId,

      revision:
        createRevision(
          sortedRules,
        ),

      updatedAt:
        new Date()
          .toISOString(),

      rules:
        sortedRules,
  };

  const validation =
    pronunciationDictionarySchema
      .safeParse(
        savedDictionary,
      );

  if (
    !validation.success
  ) {
    throw new Error(
      "The pronunciation dictionary "
      + "could not be validated.",
    );
  }

  await writeJsonAtomically(
    filePath,
    validation.data,
  );

  return validation.data;
}


function createRule(
  scope:
    PronunciationRuleScope,

  storyId:
    string | null,

  input:
    CreatePronunciationRuleInput,
): PronunciationRule {
  const currentTime =
    new Date()
      .toISOString();

  return {
    id:
      randomUUID(),

    kind:
      input.kind,

    scope,

    storyId,

    source:
      normalizeRuleText(
        input.source,
      ),

    replacement:
      normalizeRuleText(
        input.replacement,
      ),

    caseSensitive:
      input.caseSensitive
      ?? false,

    wholeWord:
      input.wholeWord
      ?? true,

    enabled:
      input.enabled
      ?? true,

    description:
      input.description
        ?.trim()
      ?? "",

    createdAt:
      currentTime,

    updatedAt:
      currentTime,
  };
}


function updateRuleValues(
  rule:
    PronunciationRule,

  input:
    UpdatePronunciationRuleInput,
): void {
  if (
    input.kind !==
    undefined
  ) {
    rule.kind =
      input.kind;
  }

  if (
    input.source !==
    undefined
  ) {
    rule.source =
      normalizeRuleText(
        input.source,
      );
  }

  if (
    input.replacement !==
    undefined
  ) {
    rule.replacement =
      normalizeRuleText(
        input.replacement,
      );
  }

  if (
    input.caseSensitive !==
    undefined
  ) {
    rule.caseSensitive =
      input.caseSensitive;
  }

  if (
    input.wholeWord !==
    undefined
  ) {
    rule.wholeWord =
      input.wholeWord;
  }

  if (
    input.enabled !==
    undefined
  ) {
    rule.enabled =
      input.enabled;
  }

  if (
    input.description !==
    undefined
  ) {
    rule.description =
      input.description.trim();
  }

  rule.updatedAt =
    new Date()
      .toISOString();
}


function findRule(
  dictionary:
    PronunciationDictionary,

  ruleId: string,
): PronunciationRule {
  const rule =
    dictionary.rules.find(
      (
        currentRule,
      ) => (
        currentRule.id ===
        ruleId
      ),
    );

  if (!rule) {
    throw new Error(
      "The pronunciation rule "
      + "was not found.",
    );
  }

  return rule;
}


export async function initializePronunciationStore():
Promise<void> {
  await mkdir(
    environment
      .directories
      .pronunciations,

    {
      recursive: true,
    },
  );

  await mkdir(
    getStoriesDirectory(),

    {
      recursive: true,
    },
  );

  const globalPath =
    getGlobalDictionaryPath();

  const globalDictionary =
    await readDictionary(
      globalPath,

      createEmptyDictionary(
        "global",
        null,
      ),
    );

  await saveDictionary(
    globalPath,
    globalDictionary,
  );
}


export async function getGlobalPronunciationDictionary():
Promise<PronunciationDictionary> {
  return readDictionary(
    getGlobalDictionaryPath(),

    createEmptyDictionary(
      "global",
      null,
    ),
  );
}


export async function getStoryPronunciationDictionary(
  storyId: string,
): Promise<PronunciationDictionary> {
  const safeStoryId =
    validateStoryId(
      storyId,
    );

  return readDictionary(
    getStoryDictionaryPath(
      safeStoryId,
    ),

    createEmptyDictionary(
      "story",
      safeStoryId,
    ),
  );
}


export async function createGlobalPronunciationRule(
  input:
    CreatePronunciationRuleInput,
): Promise<PronunciationDictionary> {
  const dictionary =
    await getGlobalPronunciationDictionary();

  dictionary.rules.push(
    createRule(
      "global",
      null,
      input,
    ),
  );

  return saveDictionary(
    getGlobalDictionaryPath(),
    dictionary,
  );
}


export async function createStoryPronunciationRule(
  storyId: string,
  input:
    CreatePronunciationRuleInput,
): Promise<PronunciationDictionary> {
  const safeStoryId =
    validateStoryId(
      storyId,
    );

  const dictionary =
    await getStoryPronunciationDictionary(
      safeStoryId,
    );

  dictionary.rules.push(
    createRule(
      "story",
      safeStoryId,
      input,
    ),
  );

  return saveDictionary(
    getStoryDictionaryPath(
      safeStoryId,
    ),
    dictionary,
  );
}


export async function updateGlobalPronunciationRule(
  ruleId: string,
  input:
    UpdatePronunciationRuleInput,
): Promise<PronunciationDictionary> {
  const dictionary =
    await getGlobalPronunciationDictionary();

  const rule =
    findRule(
      dictionary,
      ruleId,
    );

  updateRuleValues(
    rule,
    input,
  );

  return saveDictionary(
    getGlobalDictionaryPath(),
    dictionary,
  );
}


export async function updateStoryPronunciationRule(
  storyId: string,
  ruleId: string,
  input:
    UpdatePronunciationRuleInput,
): Promise<PronunciationDictionary> {
  const safeStoryId =
    validateStoryId(
      storyId,
    );

  const dictionary =
    await getStoryPronunciationDictionary(
      safeStoryId,
    );

  const rule =
    findRule(
      dictionary,
      ruleId,
    );

  updateRuleValues(
    rule,
    input,
  );

  return saveDictionary(
    getStoryDictionaryPath(
      safeStoryId,
    ),
    dictionary,
  );
}


function removeRule(
  dictionary:
    PronunciationDictionary,

  ruleId: string,
): void {
  const originalLength =
    dictionary.rules.length;

  dictionary.rules =
    dictionary.rules.filter(
      (
        rule,
      ) => (
        rule.id !==
        ruleId
      ),
    );

  if (
    dictionary.rules.length ===
    originalLength
  ) {
    throw new Error(
      "The pronunciation rule "
      + "was not found.",
    );
  }
}


export async function deleteGlobalPronunciationRule(
  ruleId: string,
): Promise<PronunciationDictionary> {
  const dictionary =
    await getGlobalPronunciationDictionary();

  removeRule(
    dictionary,
    ruleId,
  );

  return saveDictionary(
    getGlobalDictionaryPath(),
    dictionary,
  );
}


export async function deleteStoryPronunciationRule(
  storyId: string,
  ruleId: string,
): Promise<PronunciationDictionary> {
  const safeStoryId =
    validateStoryId(
      storyId,
    );

  const dictionary =
    await getStoryPronunciationDictionary(
      safeStoryId,
    );

  removeRule(
    dictionary,
    ruleId,
  );

  return saveDictionary(
    getStoryDictionaryPath(
      safeStoryId,
    ),
    dictionary,
  );
}