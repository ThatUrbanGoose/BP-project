export const CHAPTER_CHUNK_LIMITS = {
  fast:
    500,

  expressive:
    850,
};


function normalizeChapterText(
  text,
) {
  return String(
    text
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


function splitSentences(
  text,
) {
  const normalizedText =
    String(
      text
      || "",
    ).trim();

  if (!normalizedText) {
    return [];
  }

  const matches =
    normalizedText.match(
      /[^.!?…]+(?:[.!?…]+["'”’)]*|$)/gu,
    );

  if (
    !matches
    || matches.length === 0
  ) {
    return [
      normalizedText,
    ];
  }

  return matches
    .map(
      (
        sentence,
      ) => sentence.trim(),
    )
    .filter(
      Boolean,
    );
}


function splitAtWhitespace(
  text,
  maximumLength,
) {
  const chunks = [];

  let remainingText =
    String(
      text
      || "",
    ).trim();

  while (
    remainingText.length >
    maximumLength
  ) {
    const candidate =
      remainingText.slice(
        0,
        maximumLength + 1,
      );

    const whitespaceIndex =
      Math.max(
        candidate.lastIndexOf(
          " ",
        ),
        candidate.lastIndexOf(
          "\n",
        ),
        candidate.lastIndexOf(
          "\t",
        ),
      );

    const splitIndex =
      whitespaceIndex > 0
        ? whitespaceIndex
        : maximumLength;

    const chunk =
      remainingText
        .slice(
          0,
          splitIndex,
        )
        .trim();

    if (chunk) {
      chunks.push(
        chunk,
      );
    }

    remainingText =
      remainingText
        .slice(
          splitIndex,
        )
        .trim();
  }

  if (remainingText) {
    chunks.push(
      remainingText,
    );
  }

  return chunks;
}


function splitOversizedParagraph(
  paragraph,
  maximumLength,
) {
  const sentences =
    splitSentences(
      paragraph,
    );

  if (
    sentences.length <= 1
  ) {
    return splitAtWhitespace(
      paragraph,
      maximumLength,
    );
  }

  const chunks = [];

  let currentChunk =
    "";

  for (
    const sentence
    of sentences
  ) {
    if (
      sentence.length >
      maximumLength
    ) {
      if (currentChunk) {
        chunks.push(
          currentChunk,
        );

        currentChunk =
          "";
      }

      chunks.push(
        ...splitAtWhitespace(
          sentence,
          maximumLength,
        ),
      );

      continue;
    }

    const candidate =
      currentChunk
        ? `${currentChunk} ${sentence}`
        : sentence;

    if (
      candidate.length <=
      maximumLength
    ) {
      currentChunk =
        candidate;

      continue;
    }

    if (currentChunk) {
      chunks.push(
        currentChunk,
      );
    }

    currentChunk =
      sentence;
  }

  if (currentChunk) {
    chunks.push(
      currentChunk,
    );
  }

  return chunks;
}


function combineSegments(
  segments,
  maximumLength,
) {
  const chunks = [];

  let currentChunk =
    "";

  for (
    const segment
    of segments
  ) {
    const cleanSegment =
      segment.trim();

    if (!cleanSegment) {
      continue;
    }

    const candidate =
      currentChunk
        ? `${currentChunk}\n\n${cleanSegment}`
        : cleanSegment;

    if (
      candidate.length <=
      maximumLength
    ) {
      currentChunk =
        candidate;

      continue;
    }

    if (currentChunk) {
      chunks.push(
        currentChunk,
      );
    }

    currentChunk =
      cleanSegment;
  }

  if (currentChunk) {
    chunks.push(
      currentChunk,
    );
  }

  return chunks;
}


export function getChapterChunkLimit(
  mode,
) {
  return mode ===
    "expressive"
      ? CHAPTER_CHUNK_LIMITS
          .expressive
      : CHAPTER_CHUNK_LIMITS
          .fast;
}


export function splitChapterForSpeech(
  chapterText,
  {
    mode =
      "fast",

    maximumLength,
  } = {},
) {
  const normalizedText =
    normalizeChapterText(
      chapterText,
    );

  if (!normalizedText) {
    return [];
  }

  const resolvedMaximumLength =
    Number.isFinite(
      maximumLength,
    )
    && maximumLength > 0
      ? Math.floor(
          maximumLength,
        )
      : getChapterChunkLimit(
          mode,
        );

  const paragraphs =
    normalizedText
      .split(
        /\n{2,}/u,
      )
      .map(
        (
          paragraph,
        ) => paragraph.trim(),
      )
      .filter(
        Boolean,
      );

  const safeSegments = [];

  for (
    const paragraph
    of paragraphs
  ) {
    if (
      paragraph.length <=
      resolvedMaximumLength
    ) {
      safeSegments.push(
        paragraph,
      );

      continue;
    }

    safeSegments.push(
      ...splitOversizedParagraph(
        paragraph,
        resolvedMaximumLength,
      ),
    );
  }

  const chunks =
    combineSegments(
      safeSegments,
      resolvedMaximumLength,
    );

  return chunks.map(
    (
      text,
      index,
    ) => ({
      id:
        `chapter-chunk-${index + 1}`,

      index,

      number:
        index + 1,

      text,

      characterCount:
        text.length,

      maximumLength:
        resolvedMaximumLength,
    }),
  );
}


export function validateChapterChunks(
  chunks,
  maximumLength,
) {
  const problems = [];

  for (
    const chunk
    of chunks
  ) {
    if (
      !chunk.text.trim()
    ) {
      problems.push(
        `Chunk ${chunk.number} is empty.`,
      );
    }

    if (
      chunk.characterCount >
      maximumLength
    ) {
      problems.push(
        `Chunk ${chunk.number} exceeds the character limit.`,
      );
    }
  }

  return {
    valid:
      problems.length === 0,

    problems,
  };
}