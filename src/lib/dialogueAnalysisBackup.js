export const ANALYSIS_VERSION = 1;

const SPEECH_VERBS = [
  "said",
  "asked",
  "answered",
  "replied",
  "whispered",
  "shouted",
  "yelled",
  "cried",
  "murmured",
  "muttered",
  "called",
  "added",
  "continued",
  "explained",
  "demanded",
  "insisted",
  "warned",
  "admitted",
  "promised",
  "announced",
  "suggested",
  "ordered",
  "begged",
  "snapped",
  "growled",
  "sighed",
];

function normalizeText(text) {
  return String(text || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .trim();
}

function createBlocks(text) {
  const normalizedText =
    normalizeText(text);

  if (!normalizedText) {
    return [];
  }

  const paragraphs =
    normalizedText.split("\n\n");

  return paragraphs
    .map((paragraph, index) => {
      const lines =
        paragraph.split("\n");

      const cleanLines = lines
        .map((line) => line.trim())
        .filter((line) =>
          Boolean(line),
        );

      return {
        id: `paragraph-${index}`,
        text: cleanLines.join(" "),
      };
    })
    .filter((block) =>
      Boolean(block.text),
    );
}

function cleanWord(word) {
  return String(word || "")
    .replaceAll('"', "")
    .replaceAll("“", "")
    .replaceAll("”", "")
    .replaceAll("«", "")
    .replaceAll("»", "")
    .replaceAll(",", "")
    .replaceAll(".", "")
    .replaceAll("!", "")
    .replaceAll("?", "")
    .replaceAll(":", "")
    .replaceAll(";", "")
    .replaceAll("(", "")
    .replaceAll(")", "")
    .trim();
}

function normalizeName(name) {
  return cleanWord(name)
    .split(" ")
    .filter((part) =>
      Boolean(part),
    )
    .join(" ");
}

function createCharacterId(name) {
  const parts =
    normalizeName(name)
      .toLowerCase()
      .split(" ")
      .filter((part) =>
        Boolean(part),
      );

  const key =
    parts.join("-");

  return `character-${
    key || "unknown"
  }`;
}

function createSegmentId(
  blockId,
  type,
  startOffset,
  endOffset,
) {
  return `${blockId}-${type}-${startOffset}-${endOffset}`;
}

function getClosingQuote(
  openingQuote,
) {
  if (openingQuote === "“") {
    return "”";
  }

  if (openingQuote === "«") {
    return "»";
  }

  return '"';
}

function findNextOpeningQuote(
  text,
  startOffset,
) {
  const quoteCharacters = [
    '"',
    "“",
    "«",
  ];

  let result = null;

  quoteCharacters.forEach(
    (openingQuote) => {
      const index = text.indexOf(
        openingQuote,
        startOffset,
      );

      if (index < 0) {
        return;
      }

      if (
        result === null ||
        index < result.index
      ) {
        result = {
          index,
          openingQuote,
        };
      }
    },
  );

  return result;
}

function addSegment(
  segments,
  block,
  type,
  startOffset,
  endOffset,
) {
  let cleanStart = startOffset;
  let cleanEnd = endOffset;

  while (
    cleanStart < cleanEnd &&
    block.text[
      cleanStart
    ] === " "
  ) {
    cleanStart += 1;
  }

  while (
    cleanEnd > cleanStart &&
    block.text[
      cleanEnd - 1
    ] === " "
  ) {
    cleanEnd -= 1;
  }

  if (cleanStart >= cleanEnd) {
    return;
  }

  segments.push({
    id: createSegmentId(
      block.id,
      type,
      cleanStart,
      cleanEnd,
    ),
    blockId: block.id,
    type,
    text: block.text.slice(
      cleanStart,
      cleanEnd,
    ),
    startOffset: cleanStart,
    endOffset: cleanEnd,
  });
}

function splitBlockIntoSegments(
  block,
) {
  const segments = [];
  const text = block.text;

  let cursor = 0;

  while (cursor < text.length) {
    const opening =
      findNextOpeningQuote(
        text,
        cursor,
      );

    if (opening === null) {
      addSegment(
        segments,
        block,
        "narration",
        cursor,
        text.length,
      );

      break;
    }

    if (opening.index > cursor) {
      addSegment(
        segments,
        block,
        "narration",
        cursor,
        opening.index,
      );
    }

    const closingQuote =
      getClosingQuote(
        opening.openingQuote,
      );

    const closingIndex =
      text.indexOf(
        closingQuote,
        opening.index + 1,
      );

    if (closingIndex < 0) {
      addSegment(
        segments,
        block,
        "dialogue",
        opening.index,
        text.length,
      );

      break;
    }

    addSegment(
      segments,
      block,
      "dialogue",
      opening.index,
      closingIndex + 1,
    );

    cursor = closingIndex + 1;
  }

  if (
    segments.length === 0 &&
    text.trim()
  ) {
    addSegment(
      segments,
      block,
      "narration",
      0,
      text.length,
    );
  }

  return segments;
}

function isSpeechVerb(word) {
  const normalizedWord =
    cleanWord(word)
      .toLowerCase();

  return SPEECH_VERBS.includes(
    normalizedWord,
  );
}

function startsWithCapital(
  word,
) {
  const cleanedWord =
    cleanWord(word);

  if (!cleanedWord) {
    return false;
  }

  const firstCharacter =
    cleanedWord.charAt(0);

  return (
    firstCharacter ===
      firstCharacter.toUpperCase() &&
    firstCharacter !==
      firstCharacter.toLowerCase()
  );
}

function findAttribution(
  narrationText,
) {
  const words =
    String(narrationText || "")
      .split(" ")
      .map(cleanWord)
      .filter((word) =>
        Boolean(word),
      );

  for (
    let index = 0;
    index < words.length;
    index += 1
  ) {
    const currentWord =
      words[index];

    if (
      !isSpeechVerb(
        currentWord,
      )
    ) {
      continue;
    }

    const previousWord =
      words[index - 1];

    const nextWord =
      words[index + 1];

    if (
      previousWord &&
      startsWithCapital(
        previousWord,
      )
    ) {
      return {
        name:
          normalizeName(
            previousWord,
          ),
        verb:
          currentWord.toLowerCase(),
        attributionText:
          `${previousWord} ${currentWord}`,
        pattern:
          "name-before-verb",
        confidence: 0.92,
      };
    }

    if (
      nextWord &&
      startsWithCapital(
        nextWord,
      )
    ) {
      return {
        name:
          normalizeName(
            nextWord,
          ),
        verb:
          currentWord.toLowerCase(),
        attributionText:
          `${currentWord} ${nextWord}`,
        pattern:
          "verb-before-name",
        confidence: 0.9,
      };
    }
  }

  return null;
}

function findNearbyAttribution(
  segments,
  dialogueIndex,
) {
  const followingSegment =
    segments[
      dialogueIndex + 1
    ];

  if (
    followingSegment &&
    followingSegment.type ===
      "narration"
  ) {
    const attribution =
      findAttribution(
        followingSegment.text,
      );

    if (attribution) {
      return Object.assign(
        {},
        attribution,
        {
          source:
            "following-narration",
        },
      );
    }
  }

  const precedingSegment =
    segments[
      dialogueIndex - 1
    ];

  if (
    precedingSegment &&
    precedingSegment.type ===
      "narration"
  ) {
    const attribution =
      findAttribution(
        precedingSegment.text,
      );

    if (attribution) {
      return Object.assign(
        {},
        attribution,
        {
          source:
            "preceding-narration",
          confidence: 0.8,
        },
      );
    }
  }

  return null;
}

function createCharacterProfile(
  attribution,
) {
  const timestamp = Date.now();

  return {
    id: createCharacterId(
      attribution.name,
    ),
    name: attribution.name,
    aliases: [],
    role: "minor",
    locked: false,
    temporary: false,
    voiceCategory:
      "adult-neutral",
    preferredVoiceId: null,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createNarrationSegment(
  segment,
  storyId,
) {
  return Object.assign(
    {},
    segment,
    {
      storyId,
      speakerId: null,
      detectedSpeakerId: null,
      speakerName: null,
      attributionText: null,
      attributionSource: null,
      attributionPattern: null,
      confidence: 1,
      manuallyCorrected: false,
      locked: false,
      analysisVersion:
        ANALYSIS_VERSION,
    },
  );
}

function createDialogueSegment(
  segment,
  storyId,
  attribution,
) {
  const speakerId =
    attribution
      ? createCharacterId(
          attribution.name,
        )
      : null;

  return Object.assign(
    {},
    segment,
    {
      storyId,
      speakerId,
      detectedSpeakerId:
        speakerId,
      speakerName:
        attribution
          ? attribution.name
          : null,
      attributionText:
        attribution
          ? attribution
              .attributionText
          : null,
      attributionSource:
        attribution
          ? attribution.source
          : null,
      attributionPattern:
        attribution
          ? attribution.pattern
          : null,
      confidence:
        attribution
          ? attribution.confidence
          : 0.25,
      manuallyCorrected: false,
      locked: false,
      analysisVersion:
        ANALYSIS_VERSION,
    },
  );
}

export function createEmptyDialogueAnalysis(
  storyId,
) {
  return {
    analysisVersion:
      ANALYSIS_VERSION,
    analysedAt: null,
    storyId,
    narrationSegments: [],
    characters: [],
    statistics: {
      totalSegments: 0,
      narrationSegments: 0,
      dialogueSegments: 0,
      resolvedDialogue: 0,
      unresolvedDialogue: 0,
      lowConfidenceDialogue: 0,
    },
  };
}

export function analyseStoryDialogue(
  storyText,
  storyId,
  existingCharacters = [],
) {
  const blocks =
    createBlocks(storyText);

  const charactersById =
    new Map();

  existingCharacters.forEach(
    (character) => {
      if (
        !character ||
        !character.id
      ) {
        return;
      }

      charactersById.set(
        character.id,
        Object.assign(
          {},
          character,
          {
            aliases:
              Array.isArray(
                character.aliases,
              )
                ? character.aliases
                : [],
          },
        ),
      );
    },
  );

  const narrationSegments = [];

  blocks.forEach((block) => {
    const blockSegments =
      splitBlockIntoSegments(
        block,
      );

    blockSegments.forEach(
      (segment, index) => {
        if (
          segment.type ===
          "narration"
        ) {
          narrationSegments.push(
            createNarrationSegment(
              segment,
              storyId,
            ),
          );

          return;
        }

        const attribution =
          findNearbyAttribution(
            blockSegments,
            index,
          );

        if (
          attribution &&
          attribution.name
        ) {
          const characterId =
            createCharacterId(
              attribution.name,
            );

          if (
            !charactersById.has(
              characterId,
            )
          ) {
            charactersById.set(
              characterId,
              createCharacterProfile(
                attribution,
              ),
            );
          }
        }

        narrationSegments.push(
          createDialogueSegment(
            segment,
            storyId,
            attribution,
          ),
        );
      },
    );
  });

  const characters =
    Array.from(
      charactersById.values(),
    );

  const dialogueSegments =
    narrationSegments.filter(
      (segment) =>
        segment.type ===
        "dialogue",
    );

  const resolvedDialogue =
    dialogueSegments.filter(
      (segment) =>
        Boolean(
          segment.speakerId,
        ),
    );

  const unresolvedDialogue =
    dialogueSegments.filter(
      (segment) =>
        !segment.speakerId,
    );

  const lowConfidenceDialogue =
    dialogueSegments.filter(
      (segment) =>
        segment.confidence < 0.7,
    );

  const narrationCount =
    narrationSegments.length -
    dialogueSegments.length;

  return {
    analysisVersion:
      ANALYSIS_VERSION,
    analysedAt: Date.now(),
    storyId,
    narrationSegments,
    characters,
    statistics: {
      totalSegments:
        narrationSegments.length,
      narrationSegments:
        narrationCount,
      dialogueSegments:
        dialogueSegments.length,
      resolvedDialogue:
        resolvedDialogue.length,
      unresolvedDialogue:
        unresolvedDialogue.length,
      lowConfidenceDialogue:
        lowConfidenceDialogue.length,
    },
  };
}