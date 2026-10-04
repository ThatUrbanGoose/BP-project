import {
  createHash,
} from "node:crypto";

import {
  getGlobalPronunciationDictionary,
  getStoryPronunciationDictionary,
} from "./pronunciationStore.js";

import type {
  PronunciationDictionary,
  PronunciationRule,
  PronunciationRuleKind,
  PronunciationRuleScope,
} from "./pronunciationStore.js";


export type AppliedPronunciationRule = {
  ruleId: string;
  kind:
    PronunciationRuleKind;
  scope:
    PronunciationRuleScope;
  storyId:
    string | null;
  source: string;
  replacement: string;
  replacementCount: number;
};


export type PronunciationTransformation = {
  displayText: string;
  synthesisText: string;
  changed: boolean;
  appliedRules:
    AppliedPronunciationRule[];
  globalRevision: string;
  storyRevision:
    string | null;
  combinedRevision: string;
};


type PreparedRule = {
  rule:
    PronunciationRule;
  pattern:
    RegExp;
  precedence: number;
};


type RuleApplicationResult = {
  text: string;
  replacementCount: number;
};


function escapeRegularExpression(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}


function isWordCharacter(
  character:
    string | undefined,
): boolean {
  if (!character) {
    return false;
  }

  return /[\p{L}\p{N}_]/u
    .test(
      character,
    );
}


function hasWholeWordBoundaries(
  text: string,
  startIndex: number,
  matchLength: number,
): boolean {
  const previousCharacter =
    startIndex > 0
      ? text[
          startIndex - 1
        ]
      : undefined;

  const nextCharacter =
    text[
      startIndex
      + matchLength
    ];

  const startsWithWordCharacter =
    isWordCharacter(
      text[
        startIndex
      ],
    );

  const endsWithWordCharacter =
    isWordCharacter(
      text[
        startIndex
        + matchLength
        - 1
      ],
    );

  if (
    startsWithWordCharacter
    && isWordCharacter(
      previousCharacter,
    )
  ) {
    return false;
  }

  if (
    endsWithWordCharacter
    && isWordCharacter(
      nextCharacter,
    )
  ) {
    return false;
  }

  return true;
}


function getRulePrecedence(
  rule:
    PronunciationRule,
): number {
  if (
    rule.scope === "story"
    && rule.kind ===
      "character"
  ) {
    return 4;
  }

  if (
    rule.scope === "story"
    && rule.kind ===
      "term"
  ) {
    return 3;
  }

  if (
    rule.scope === "global"
    && rule.kind ===
      "character"
  ) {
    return 2;
  }

  return 1;
}


function prepareRule(
  rule:
    PronunciationRule,
): PreparedRule {
  const escapedSource =
    escapeRegularExpression(
      rule.source,
    );

  const flags =
    rule.caseSensitive
      ? "gu"
      : "giu";

  return {
    rule,

    pattern:
      new RegExp(
        escapedSource,
        flags,
      ),

    precedence:
      getRulePrecedence(
        rule,
      ),
  };
}


function getEffectiveRules(
  globalDictionary:
    PronunciationDictionary,

  storyDictionary:
    PronunciationDictionary
    | null,
): PronunciationRule[] {
  const allRules = [
    ...globalDictionary.rules,
    ...(
      storyDictionary
        ?.rules
      ?? []
    ),
  ].filter(
    (
      rule,
    ) => (
      rule.enabled
      && rule.source.length > 0
      && rule.replacement.length > 0
    ),
  );

  return allRules.sort(
    (
      first,
      second,
    ) => {
      const precedenceDifference =
        getRulePrecedence(
          second,
        )
        - getRulePrecedence(
          first,
        );

      if (
        precedenceDifference !== 0
      ) {
        return precedenceDifference;
      }

      const sourceLengthDifference =
        second.source.length
        - first.source.length;

      if (
        sourceLengthDifference !== 0
      ) {
        return sourceLengthDifference;
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


function removeShadowedRules(
  rules:
    PronunciationRule[],
): PronunciationRule[] {
  const selectedRules:
    PronunciationRule[] = [];

  const signatures =
    new Set<string>();

  for (
    const rule
    of rules
  ) {
    const normalizedSource =
      rule.caseSensitive
        ? rule.source
        : rule.source
            .toLocaleLowerCase();

    const signature =
      JSON.stringify({
        source:
          normalizedSource,

        caseSensitive:
          rule.caseSensitive,

        wholeWord:
          rule.wholeWord,
      });

    if (
      signatures.has(
        signature,
      )
    ) {
      continue;
    }

    signatures.add(
      signature,
    );

    selectedRules.push(
      rule,
    );
  }

  return selectedRules;
}


function createCombinedRevision(
  globalRevision: string,
  storyRevision:
    string | null,
): string {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify({
        globalRevision,

        storyRevision:
          storyRevision
          ?? null,
      }),
      "utf8",
    )
    .digest(
      "hex",
    );
}


function applyRuleWithoutRecursion(
  text: string,
  preparedRule:
    PreparedRule,
  protectedIndexes:
    Set<number>,
): RuleApplicationResult {
  const rule =
    preparedRule.rule;

  const matches = [
    ...text.matchAll(
      preparedRule.pattern,
    ),
  ];

  if (
    matches.length === 0
  ) {
    return {
      text,
      replacementCount: 0,
    };
  }

  const acceptedMatches:
    Array<{
      start: number;
      end: number;
    }> = [];

  for (
    const match
    of matches
  ) {
    const start =
      match.index;

    if (
      start === undefined
    ) {
      continue;
    }

    const matchedText =
      match[0];

    const end =
      start
      + matchedText.length;

    let overlapsProtectedText =
      false;

    for (
      let index = start;
      index < end;
      index += 1
    ) {
      if (
        protectedIndexes.has(
          index,
        )
      ) {
        overlapsProtectedText =
          true;

        break;
      }
    }

    if (
      overlapsProtectedText
    ) {
      continue;
    }

    if (
      rule.wholeWord
      && !hasWholeWordBoundaries(
        text,
        start,
        matchedText.length,
      )
    ) {
      continue;
    }

    acceptedMatches.push({
      start,
      end,
    });
  }

  if (
    acceptedMatches.length === 0
  ) {
    return {
      text,
      replacementCount: 0,
    };
  }

  let outputText =
    "";

  let sourcePosition =
    0;

  let outputPosition =
    0;

  const updatedProtectedIndexes =
    new Set<number>();

  for (
    const match
    of acceptedMatches
  ) {
    const unchangedText =
      text.slice(
        sourcePosition,
        match.start,
      );

    outputText +=
      unchangedText;

    for (
      let index =
        sourcePosition;
      index < match.start;
      index += 1
    ) {
      if (
        protectedIndexes.has(
          index,
        )
      ) {
        const relativeIndex =
          index
          - sourcePosition;

        updatedProtectedIndexes.add(
          outputPosition
          + relativeIndex,
        );
      }
    }

    outputPosition +=
      unchangedText.length;

    outputText +=
      rule.replacement;

    for (
      let replacementIndex = 0;
      replacementIndex
        < rule.replacement.length;
      replacementIndex += 1
    ) {
      updatedProtectedIndexes.add(
        outputPosition
        + replacementIndex,
      );
    }

    outputPosition +=
      rule.replacement.length;

    sourcePosition =
      match.end;
  }

  const remainingText =
    text.slice(
      sourcePosition,
    );

  outputText +=
    remainingText;

  for (
    let index =
      sourcePosition;
    index < text.length;
    index += 1
  ) {
    if (
      protectedIndexes.has(
        index,
      )
    ) {
      const relativeIndex =
        index
        - sourcePosition;

      updatedProtectedIndexes.add(
        outputPosition
        + relativeIndex,
      );
    }
  }

  protectedIndexes.clear();

  for (
    const index
    of updatedProtectedIndexes
  ) {
    protectedIndexes.add(
      index,
    );
  }

  return {
    text:
      outputText,

    replacementCount:
      acceptedMatches.length,
  };
}


export async function transformPronunciationText(
  displayText: string,
  storyId?:
    string | null,
): Promise<PronunciationTransformation> {
  const globalDictionary =
    await getGlobalPronunciationDictionary();

  const normalizedStoryId =
    storyId
      ?.trim()
    || null;

  const storyDictionary =
    normalizedStoryId
      ? await getStoryPronunciationDictionary(
          normalizedStoryId,
        )
      : null;

  const effectiveRules =
    removeShadowedRules(
      getEffectiveRules(
        globalDictionary,
        storyDictionary,
      ),
    );

  const preparedRules =
    effectiveRules.map(
      prepareRule,
    );

  let synthesisText =
    displayText;

  const protectedIndexes =
    new Set<number>();

  const appliedRules:
    AppliedPronunciationRule[] = [];

  for (
    const preparedRule
    of preparedRules
  ) {
    const result =
      applyRuleWithoutRecursion(
        synthesisText,
        preparedRule,
        protectedIndexes,
      );

    synthesisText =
      result.text;

    if (
      result.replacementCount
      === 0
    ) {
      continue;
    }

    appliedRules.push({
      ruleId:
        preparedRule.rule.id,

      kind:
        preparedRule.rule.kind,

      scope:
        preparedRule.rule.scope,

      storyId:
        preparedRule.rule.storyId,

      source:
        preparedRule.rule.source,

      replacement:
        preparedRule.rule.replacement,

      replacementCount:
        result.replacementCount,
    });
  }

  const globalRevision =
    globalDictionary.revision;

  const storyRevision =
    storyDictionary
      ?.revision
    ?? null;

  return {
    displayText,

    synthesisText,

    changed:
      synthesisText
      !== displayText,

    appliedRules,

    globalRevision,

    storyRevision,

    combinedRevision:
      createCombinedRevision(
        globalRevision,
        storyRevision,
      ),
  };
}