import {
  access,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";


export type TimelineSegmentKind =
  | "heading"
  | "narration"
  | "dialogue";


export type TimelineTimingSource =
  | "estimated"
  | "aligned";


export type TimelineWord = {
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence:
    number | null;
};


export type SynthesisTimelineSegment = {
  id: string;
  index: number;
  kind:
    TimelineSegmentKind;
  speakerId:
    string | null;
  speakerName:
    string | null;
  speakerTransition:
    boolean;
  displayText: string;
  synthesisText: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  sourceStart: number;
  sourceEnd: number;
  paragraphIndex: number;
  sentenceIndex: number;
  confidence: number;
  words:
    TimelineWord[] | null;
};


export type SynthesisTimeline = {
  version: 1;
  cacheKey: string;
  timingSource:
    TimelineTimingSource;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  segments:
    SynthesisTimelineSegment[];
};


export type CreateTimelineInput = {
  cacheKey: string;
  displayText: string;
  synthesisText: string;
  durationSeconds: number;
};


type RawTimelineSegment = {
  kind:
    TimelineSegmentKind;
  speakerId:
    string | null;
  speakerName:
    string | null;
  displayText: string;
  synthesisText: string;
  sourceStart: number;
  sourceEnd: number;
  paragraphIndex: number;
  sentenceIndex: number;
  weight: number;
  confidence: number;
};


const SPEECH_VERBS =
  [
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


function roundSeconds(
  value: number,
): number {
  return Number(
    value.toFixed(
      3,
    ),
  );
}


function normalizeTimelineText(
  value: string,
): string {
  return String(
    value
    || "",
  )
    .replace(
      /\r\n/g,
      "\n",
    )
    .replace(
      /\r/g,
      "\n",
    )
    .replace(
      /[ \t]+\n/g,
      "\n",
    )
    .replace(
      /\n[ \t]+/g,
      "\n",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}


function normalizeComparableText(
  value: string,
): string {
  return String(
    value
    || "",
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}


function createSpeakerId(
  speakerName: string,
): string {
  const normalizedName =
    speakerName
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      );

  return (
    "speaker-"
    + (
      normalizedName
      || "unknown"
    )
  );
}


function isHeading(
  text: string,
): boolean {
  const value =
    text.trim();

  if (
    !value
    || value.length > 100
  ) {
    return false;
  }

  return /^(?:prologue|epilogue|introduction|preface|afterword|interlude|chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:.-]\s*.+)?|part\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.-]\s*.+)?|book\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.-]\s*.+)?)$/i.test(
    value,
  );
}


function beginsWithQuote(
  text: string,
): boolean {
  return /^[“"‘«]/u.test(
    text.trim(),
  );
}


function findSpeakerAttribution(
  text: string,
): {
  speakerId: string;
  speakerName: string;
  confidence: number;
} | null {
  const speechVerbPattern =
    SPEECH_VERBS.join(
      "|",
    );

  const nameBeforeVerb =
    new RegExp(
      String.raw`\b([A-Z][A-Za-z'-]{1,79})\s+(${speechVerbPattern})\b`,
      "u",
    );

  const verbBeforeName =
    new RegExp(
      String.raw`\b(${speechVerbPattern})\s+([A-Z][A-Za-z'-]{1,79})\b`,
      "u",
    );

  const firstMatch =
    text.match(
      nameBeforeVerb,
    );

  if (firstMatch?.[1]) {
    return {
      speakerId:
        createSpeakerId(
          firstMatch[1],
        ),

      speakerName:
        firstMatch[1],

      confidence:
        0.9,
    };
  }

  const secondMatch =
    text.match(
      verbBeforeName,
    );

  if (secondMatch?.[2]) {
    return {
      speakerId:
        createSpeakerId(
          secondMatch[2],
        ),

      speakerName:
        secondMatch[2],

      confidence:
        0.88,
    };
  }

  return null;
}


function calculateSegmentWeight(
  text: string,
  kind:
    TimelineSegmentKind,
): number {
  const spokenCharacterCount =
    text.replace(
      /\s/g,
      "",
    ).length;

  const commaCount =
    (
      text.match(
        /[,;:]/g,
      )
      || []
    ).length;

  const sentenceEndingCount =
    (
      text.match(
        /[.!?…]+/g,
      )
      || []
    ).length;

  const dashCount =
    (
      text.match(
        /[-–—]/g,
      )
      || []
    ).length;

  const quoteCount =
    (
      text.match(
        /[“”"‘’«»]/g,
      )
      || []
    ).length;

  const baseWeight =
    Math.max(
      spokenCharacterCount,
      1,
    );

  const punctuationWeight =
    commaCount
    * 5
    + sentenceEndingCount
    * 11
    + dashCount
    * 6
    + quoteCount
    * 1.5;

  const kindWeight =
    kind === "heading"
      ? 18
      : kind === "dialogue"
        ? 8
        : 0;

  return (
    baseWeight
    + punctuationWeight
    + kindWeight
  );
}


function splitParagraphIntoSentences(
  paragraph: string,
  paragraphStart: number,
  paragraphIndex: number,
): RawTimelineSegment[] {
  const segments:
    RawTimelineSegment[] = [];

  const sentencePattern =
    /[^.!?…]+(?:[.!?…]+["'”’»)]*|$)/gu;

  let match:
    RegExpExecArray | null;

  let sentenceIndex =
    0;

  while (
    (
      match =
        sentencePattern.exec(
          paragraph,
        )
    ) !== null
  ) {
    const originalText =
      match[0];

    const leadingWhitespace =
      originalText.length
      - originalText
        .trimStart()
        .length;

    const cleanText =
      originalText.trim();

    if (!cleanText) {
      continue;
    }

    const localStart =
      match.index
      + leadingWhitespace;

    const sourceStart =
      paragraphStart
      + localStart;

    const sourceEnd =
      sourceStart
      + cleanText.length;

    const heading =
      isHeading(
        cleanText,
      );

    const dialogue =
      !heading
      && beginsWithQuote(
        cleanText,
      );

    const attribution =
      dialogue
        ? findSpeakerAttribution(
            paragraph,
          )
        : null;

    const kind:
      TimelineSegmentKind =
      heading
        ? "heading"
        : dialogue
          ? "dialogue"
          : "narration";

    segments.push({
      kind,

      speakerId:
        attribution?.speakerId
        || null,

      speakerName:
        attribution?.speakerName
        || (
          dialogue
            ? "Unknown speaker"
            : "Narrator"
        ),

      displayText:
        cleanText,

      synthesisText:
        cleanText,

      sourceStart,

      sourceEnd,

      paragraphIndex,

      sentenceIndex,

      weight:
        calculateSegmentWeight(
          cleanText,
          kind,
        ),

      confidence:
        attribution?.confidence
        || (
          dialogue
            ? 0.25
            : 1
        ),
    });

    sentenceIndex +=
      1;
  }

  if (
    segments.length === 0
    && paragraph.trim()
  ) {
    const cleanText =
      paragraph.trim();

    const leadingWhitespace =
      paragraph.length
      - paragraph
        .trimStart()
        .length;

    const sourceStart =
      paragraphStart
      + leadingWhitespace;

    const heading =
      isHeading(
        cleanText,
      );

    const dialogue =
      !heading
      && beginsWithQuote(
        cleanText,
      );

    const attribution =
      dialogue
        ? findSpeakerAttribution(
            paragraph,
          )
        : null;

    const kind:
      TimelineSegmentKind =
      heading
        ? "heading"
        : dialogue
          ? "dialogue"
          : "narration";

    segments.push({
      kind,

      speakerId:
        attribution?.speakerId
        || null,

      speakerName:
        attribution?.speakerName
        || (
          dialogue
            ? "Unknown speaker"
            : "Narrator"
        ),

      displayText:
        cleanText,

      synthesisText:
        cleanText,

      sourceStart,

      sourceEnd:
        sourceStart
        + cleanText.length,

      paragraphIndex,

      sentenceIndex:
        0,

      weight:
        calculateSegmentWeight(
          cleanText,
          kind,
        ),

      confidence:
        attribution?.confidence
        || (
          dialogue
            ? 0.25
            : 1
        ),
    });
  }

  return segments;
}


function createRawSegments(
  displayText: string,
  synthesisText: string,
): RawTimelineSegment[] {
  const normalizedDisplayText =
    normalizeTimelineText(
      displayText,
    );

  const normalizedSynthesisText =
    normalizeTimelineText(
      synthesisText,
    );

  if (!normalizedDisplayText) {
    return [];
  }

  const rawSegments:
    RawTimelineSegment[] = [];

  const paragraphPattern =
    /[^\n]+(?:\n(?!\n)[^\n]+)*/gu;

  let paragraphMatch:
    RegExpExecArray | null;

  let paragraphIndex =
    0;

  while (
    (
      paragraphMatch =
        paragraphPattern.exec(
          normalizedDisplayText,
        )
    ) !== null
  ) {
    const paragraph =
      paragraphMatch[0]
        .replace(
          /\n+/g,
          " ",
        )
        .trim();

    if (!paragraph) {
      continue;
    }

    const paragraphSegments =
      splitParagraphIntoSentences(
        paragraph,
        paragraphMatch.index,
        paragraphIndex,
      );

    rawSegments.push(
      ...paragraphSegments,
    );

    paragraphIndex +=
      1;
  }

  if (
    rawSegments.length === 0
  ) {
    return [];
  }

  const normalizedDisplayComparable =
    normalizeComparableText(
      normalizedDisplayText,
    );

  const normalizedSynthesisComparable =
    normalizeComparableText(
      normalizedSynthesisText,
    );

  if (
    normalizedDisplayComparable ===
    normalizedSynthesisComparable
  ) {
    return rawSegments;
  }

  let synthesisCursor =
    0;

  return rawSegments.map(
    (
      segment,
    ) => {
      const remainingSynthesisText =
        normalizedSynthesisComparable
          .slice(
            synthesisCursor,
          );

      const approximateLength =
        Math.max(
          1,
          Math.round(
            (
              segment
                .displayText
                .length
              / Math.max(
                  normalizedDisplayComparable
                    .length,
                  1,
                )
            )
            * normalizedSynthesisComparable
              .length,
          ),
        );

      const segmentSynthesisText =
        remainingSynthesisText
          .slice(
            0,
            approximateLength,
          )
          .trim()
        || segment.displayText;

      synthesisCursor +=
        approximateLength;

      return {
        ...segment,

        synthesisText:
          segmentSynthesisText,
      };
    },
  );
}


export function createEstimatedTimeline(
  input:
    CreateTimelineInput,
): SynthesisTimeline {
  const safeDuration =
    Number.isFinite(
      input.durationSeconds,
    )
    && input.durationSeconds > 0
      ? input.durationSeconds
      : 0;

  const rawSegments =
    createRawSegments(
      input.displayText,
      input.synthesisText,
    );

  const currentTime =
    new Date()
      .toISOString();

  if (
    rawSegments.length === 0
    || safeDuration <= 0
  ) {
    return {
      version:
        1,

      cacheKey:
        input.cacheKey,

      timingSource:
        "estimated",

      durationSeconds:
        roundSeconds(
          safeDuration,
        ),

      createdAt:
        currentTime,

      updatedAt:
        currentTime,

      segmentCount:
        0,

      segments:
        [],
    };
  }

  const totalWeight =
    rawSegments.reduce(
      (
        total,
        segment,
      ) => (
        total
        + segment.weight
      ),
      0,
    );

  let elapsedSeconds =
    0;

  let previousSpeakerId:
    string | null = null;

  let previousKind:
    TimelineSegmentKind | null =
      null;

  const segments =
    rawSegments.map(
      (
        segment,
        index,
      ):
        SynthesisTimelineSegment => {
        const finalSegment =
          index ===
          rawSegments.length
          - 1;

        const calculatedDuration =
          totalWeight > 0
            ? (
                segment.weight
                / totalWeight
              )
              * safeDuration
            : (
                safeDuration
                / rawSegments.length
              );

        const startSeconds =
          elapsedSeconds;

        const endSeconds =
          finalSegment
            ? safeDuration
            : Math.min(
                safeDuration,
                startSeconds
                + calculatedDuration,
              );

        elapsedSeconds =
          endSeconds;

        const currentSpeakerId =
          segment.kind ===
          "dialogue"
            ? segment.speakerId
            : null;

        const speakerTransition =
          index > 0
          && (
            segment.kind !==
              previousKind
            || currentSpeakerId !==
              previousSpeakerId
          );

        previousSpeakerId =
          currentSpeakerId;

        previousKind =
          segment.kind;

        return {
          id:
            `segment-${index + 1}`,

          index,

          kind:
            segment.kind,

          speakerId:
            segment.speakerId,

          speakerName:
            segment.speakerName,

          speakerTransition,

          displayText:
            segment.displayText,

          synthesisText:
            segment.synthesisText,

          startSeconds:
            roundSeconds(
              startSeconds,
            ),

          endSeconds:
            roundSeconds(
              endSeconds,
            ),

          durationSeconds:
            roundSeconds(
              Math.max(
                0,
                endSeconds
                - startSeconds,
              ),
            ),

          sourceStart:
            segment.sourceStart,

          sourceEnd:
            segment.sourceEnd,

          paragraphIndex:
            segment.paragraphIndex,

          sentenceIndex:
            segment.sentenceIndex,

          confidence:
            segment.confidence,

          words:
            null,
        };
      },
    );

  return {
    version:
      1,

    cacheKey:
      input.cacheKey,

    timingSource:
      "estimated",

    durationSeconds:
      roundSeconds(
        safeDuration,
      ),

    createdAt:
      currentTime,

    updatedAt:
      currentTime,

    segmentCount:
      segments.length,

    segments,
  };
}


export async function writeSynthesisTimeline(
  timelinePath: string,
  timeline:
    SynthesisTimeline,
): Promise<void> {
  const temporaryPath =
    `${timelinePath}.temporary`;

  await writeFile(
    temporaryPath,

    JSON.stringify(
      timeline,
      null,
      2,
    ),

    "utf8",
  );

  await rename(
    temporaryPath,
    timelinePath,
  );
}


export async function readSynthesisTimeline(
  timelinePath: string,
): Promise<
  SynthesisTimeline | null
> {
  try {
    await access(
      timelinePath,
    );

    const timelineText =
      await readFile(
        timelinePath,
        "utf8",
      );

    const timeline =
      JSON.parse(
        timelineText,
      ) as SynthesisTimeline;

    if (
      timeline.version !== 1
      || !timeline.cacheKey
      || !Array.isArray(
        timeline.segments,
      )
    ) {
      return null;
    }

    return timeline;

  } catch {
    return null;
  }
}