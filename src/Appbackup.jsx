
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import {
analyseStoryDialogue,
createEmptyDialogueAnalysis,
} from "./lib/dialogueAnalysis";

import {
  BarChart3,
  BookOpen,
  Bookmark,
  ChevronLeft,
  Clock3,
  Minus,
  Plus,
  ChevronRight,
  Download,
  FilePlus2,
  Folder,
  FolderPlus,
  Library,
  MapPin,
  Menu,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  UploadCloud,
  UserRoundCog,
  X,
  XCircle,
  BookmarkPlus,
  List,
  ListTree,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  RotateCcw,
  Settings2,
  Square,
  Volume2,
} from "lucide-react";

const STORAGE_KEY = "bp-library";
const LEGACY_STORAGE_KEY =
  "bp-stage-1-library-v1";
const DATA_VERSION = 5;
 
const MAX_IMPORT_FILE_SIZE =
5 * 1024 * 1024;
 
const PAGE_LAYOUT = {
  desktopWidth: 520,
  desktopHeight: 680,
  mobileWidth: 420,
  mobileHeight: 680,
  paddingTop: 40,
  paddingRight: 40,
  paddingBottom: 72,
  paddingLeft: 40,
};

function getPagePadding(pageWidth, pageHeight) {
  return {
    horizontal: Math.max(
      22,
      Math.min(
        PAGE_LAYOUT.paddingLeft,
        pageWidth * 0.095,
      ),
    ),

    top: Math.max(
      28,
      Math.min(
        PAGE_LAYOUT.paddingTop,
        pageHeight * 0.06,
      ),
    ),

    bottom: Math.max(
      52,
      Math.min(
        PAGE_LAYOUT.paddingBottom,
        pageHeight * 0.11,
      ),
    ),
  };
}

const starterStory = {
  id: "welcome-story",
  folderId: "unfiled",
  title: "Welcome to BP",
  filename: "welcome.txt",
  author: "",
  description:
    "A short introduction to the BP reader.",
  tags: [],
  readingStatus: "unread",
  lastOpenedAt: null,
  readingSessions: 0,
  readingTimeSeconds: 0,
  text:
    "This is your first book. Import a text file from the library sidebar to add another story.\n\nThe first page is represented by the cover. Open the book to see page two on the left and page three on the right. Your library, folders, current story, page and reader settings are saved in this browser.\n\nStage One establishes the local library and reading foundation. Narration, automatic page turning and live highlighting will be added in later stages.",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  currentPage: 1,
  totalPages: 1,
  readingPosition: null,
  narrationPosition: null,
  dialogueAnalysis:
    createEmptyDialogueAnalysis(
      "welcome-story",
  ),
  bookmarks: [],
};

const initialData = {
  version: DATA_VERSION,
  folders: [
    { id: "all-stories", name: "My Library", parentId: null, system: true },
    { id: "unfiled", name: "Unfiled", parentId: null, system: true },
  ],
  stories: [starterStory],
  activeStoryId: starterStory.id,
  activeFolderId: "all-stories",
  settings: {
    fontSize: 17,
    lineHeight: 1.75,
    theme: "ivory",
    narrationVoiceId: "",
    narrationRate: 1,
    narrationWordHighlight: true,
    librarySort: "updated-desc",
  },
};

function uid(prefix) {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeLibraryData(
  savedData,
) {
  const source =
    savedData &&
    typeof savedData === "object"
      ? savedData
      : {};

  const savedFolders =
    Array.isArray(source.folders)
      ? source.folders
      : [];

  const savedStories =
    Array.isArray(source.stories)
      ? source.stories
      : [];

  const savedSettings =
    source.settings &&
    typeof source.settings === "object"
      ? source.settings
      : {};

  const folders = [
    {
      id: "all-stories",
      name: "My Library",
      parentId: null,
      system: true,
    },
    {
      id: "unfiled",
      name: "Unfiled",
      parentId: null,
      system: true,
    },
    ...savedFolders
      .filter(
        (folder) =>
          folder &&
          folder.id &&
          folder.id !==
            "all-stories" &&
          folder.id !== "unfiled",
      )
      .map((folder) => ({
        id: String(folder.id),
        name:
          String(
            folder.name || "Untitled folder",
          ).trim() ||
          "Untitled folder",
        parentId:
          folder.parentId || null,
        system: false,
      })),
  ];

  const validFolderIds = new Set(
    folders.map(
      (folder) => folder.id,
    ),
  );

  const stories = savedStories
    .filter(
      (story) =>
        story &&
        story.id &&
        typeof story.text ===
          "string",
    )
    .map((story) => {
      const requestedFolderId =
        story.folderId;

      const folderId =
        requestedFolderId &&
        requestedFolderId !==
          "all-stories" &&
        validFolderIds.has(
          requestedFolderId,
        )
          ? requestedFolderId
          : "unfiled";

      const bookmarks =
        Array.isArray(
          story.bookmarks,
        )
          ? story.bookmarks.filter(
              (bookmark) =>
                bookmark &&
                bookmark.id &&
                bookmark.blockId,
            )
          : [];

      return {
        ...story,
        id: String(story.id),
        folderId,
        title:
          String(
            story.title ||
              story.filename ||
              "Untitled story",
          ).trim() ||
          "Untitled story",
        filename:
          String(
            story.filename ||
              `${story.title || "story"}.txt`,
          ),

        author:
          typeof story.author === "string"
            ? story.author.trim()
            : "",

        description:
          typeof story.description ===
          "string"
            ? story.description.trim()
            : "",

        tags: Array.isArray(story.tags)
          ? [
              ...new Set(
                story.tags
                  .map((tag) =>
                    String(tag)
                      .trim()
                      .toLowerCase(),
                  )
                  .filter(Boolean),
              ),
            ].slice(0, 20)
          : [],

        readingStatus: [
          "unread",
          "reading",
          "finished",
        ].includes(story.readingStatus)
          ? story.readingStatus
          : (
              Number(story.currentPage) > 1
                ? "reading"
                : "unread"
            ),

        lastOpenedAt:
          Number.isFinite(
            story.lastOpenedAt,
          )
            ? story.lastOpenedAt
            : null,

        readingSessions: Math.max(
          0,
          Number.isFinite(
            story.readingSessions,
          )
            ? Math.floor(
                story.readingSessions,
              )
            : 0,
        ),

        readingTimeSeconds: Math.max(
          0,
          Number.isFinite(
            story.readingTimeSeconds,
          )
            ? Math.floor(
                story.readingTimeSeconds,
              )
            : 0,
        ),

        text: String(story.text),
        createdAt:
          Number.isFinite(
            story.createdAt,
          )
            ? story.createdAt
            : Date.now(),
        updatedAt:
          Number.isFinite(
            story.updatedAt,
          )
            ? story.updatedAt
            : Date.now(),
        currentPage: Math.max(
          1,
          Number.isFinite(
            story.currentPage,
          )
            ? story.currentPage
            : 1,
        ),

        totalPages: Math.max(
          1,
          Number.isFinite(
            story.totalPages,
          )
            ? story.totalPages
            : story.currentPage || 1,
        ),

        readingPosition:
          story.readingPosition ||
          null,
        narrationPosition:
          story.narrationPosition ||
          null,

        dialogueAnalysis:
          story.dialogueAnalysis &&
          typeof story.dialogueAnalysis ===
            "object"
            ? {
                ...createEmptyDialogueAnalysis(
                  String(story.id),
                ),
                ...story.dialogueAnalysis,

                narrationSegments:
                  Array.isArray(
                    story.dialogueAnalysis
                      .narrationSegments,
                  )
                    ? story.dialogueAnalysis
                        .narrationSegments
                    : [],

                characters:
                  Array.isArray(
                    story.dialogueAnalysis
                      .characters,
                  )
                    ? story.dialogueAnalysis
                        .characters
                    : [],
              }
            : createEmptyDialogueAnalysis(
                String(story.id),
              ),

        bookmarks,
      };
    });

  if (
    stories.length === 0 &&
    savedStories.length === 0
  ) {
    stories.push({
      ...starterStory,
      folderId: "unfiled",
    });
  }

  const activeStoryExists =
    stories.some(
      (story) =>
        story.id ===
        source.activeStoryId,
    );

  const activeFolderExists =
    validFolderIds.has(
      source.activeFolderId,
    );

  return {
    version: DATA_VERSION,
    folders,
    stories,
    activeStoryId:
      activeStoryExists
        ? source.activeStoryId
        : stories[0]?.id || null,
    activeFolderId:
      activeFolderExists
        ? source.activeFolderId
        : "all-stories",
    settings: {
      ...initialData.settings,
      ...savedSettings,
      fontSize: Math.min(
        26,
        Math.max(
          13,
          Number(
            savedSettings.fontSize ??
              initialData.settings
                .fontSize,
          ) ||
            initialData.settings
              .fontSize,
        ),
      ),
      lineHeight: Math.min(
        2.5,
        Math.max(
          1.2,
          Number(
            savedSettings.lineHeight ??
              initialData.settings
                .lineHeight,
          ) ||
            initialData.settings
              .lineHeight,
        ),
      ),
      theme: [
        "ivory",
        "white",
        "night",
      ].includes(
        savedSettings.theme,
      )
        ? savedSettings.theme
        : initialData.settings
            .theme,
      narrationVoiceId:
        typeof savedSettings
          .narrationVoiceId ===
        "string"
          ? savedSettings
              .narrationVoiceId
          : "",
      narrationRate: Math.min(
        2,
        Math.max(
          0.5,
          Number(
            savedSettings
              .narrationRate ?? 1,
          ) || 1,
        ),
      ),
      narrationWordHighlight:
        savedSettings
          .narrationWordHighlight !==
        false,

      librarySort: [
        "updated-desc",
        "created-desc",
        "opened-desc",
        "title-asc",
        "title-desc",
        "progress-desc",
      ].includes(
        savedSettings.librarySort,
      )
        ? savedSettings.librarySort
        : "updated-desc",
    },
  };
}

function loadData() {
  try {
    const currentRaw =
      localStorage.getItem(
        STORAGE_KEY,
      );

    if (currentRaw) {
      return normalizeLibraryData(
        JSON.parse(currentRaw),
      );
    }

    const legacyRaw =
      localStorage.getItem(
        LEGACY_STORAGE_KEY,
      );

    if (legacyRaw) {
      const migratedData =
        normalizeLibraryData(
          JSON.parse(legacyRaw),
        );

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          migratedData,
        ),
      );

      return migratedData;
    }

    return normalizeLibraryData(
      initialData,
    );
  } catch (error) {
    console.error(
      "BP could not load the saved library.",
      error,
    );

    return normalizeLibraryData(
      initialData,
    );
  }
}

function normalizeStoryText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function convertMarkdownToReadableText(
  text,
) {
  let readableText = String(
    text || "",
  )
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines =
    readableText.split("\n");

  function normalizedLine(line) {
    return line
      .replace(/^\uFEFF/, "")
      .replace(
        /[\u200B-\u200D\u2060]/g,
        "",
      )
      .trim();
  }

  const firstContentLine =
    lines.findIndex(
      (line) =>
        normalizedLine(line).length >
        0,
    );

  if (firstContentLine >= 0) {
    const openingLine =
      normalizedLine(
        lines[firstContentLine],
      );

    if (openingLine === "---") {
      const closingLine =
        lines.findIndex(
          (line, index) =>
            index >
              firstContentLine &&
            normalizedLine(line) ===
              "---",
        );

      if (closingLine >= 0) {
        lines.splice(
          firstContentLine,
          closingLine -
            firstContentLine +
            1,
        );

        readableText =
          lines.join("\n");
      }
    }
  }

  readableText = readableText.replace(
    /```[^\n]*\n?([\s\S]*?)```/g,
    "$1",
  );

  readableText = readableText.replace(
    /~~~[^\n]*\n?([\s\S]*?)~~~/g,
    "$1",
  );

  readableText = readableText.replace(
    /<br\s*\/?>/gi,
    "\n",
  );

  readableText = readableText.replace(
    /\[([^\]]+)\]\(\s*<a\b[\s\S]*?<\/a>\s*\)/gi,
    "$1",
  );

  readableText = readableText.replace(
    /<a\b[^>]*>(.*?)<\/a>/gis,
    "$1",
  );

  readableText = readableText.replace(
    /<\/?[^>]+>/g,
    "",
  );

  readableText = readableText.replace(
    /!\[([^\]]*)\]\([^\n]*?\)/g,
    "$1",
  );

  readableText = readableText.replace(
    /\[([^\]]+)\]\([^\n]*?\)/g,
    "$1",
  );

  readableText = readableText.replace(
    /^#{1,6}[ \t]+(.+)$/gm,
    "$1",
  );

  readableText = readableText.replace(
    /^[ \t]*>[ \t]?/gm,
    "",
  );

  readableText = readableText.replace(
    /^[ \t]*[-*+][ \t]+(.+)$/gm,
    "• $1\n",
  );

  readableText = readableText.replace(
    /^[ \t]*\d+[.)][ \t]+(.+)$/gm,
    "$1\n",
  );

  readableText = readableText.replace(
    /\*\*([^*\n]+)\*\*/g,
    "$1",
  );

  readableText = readableText.replace(
    /__([^_\n]+)__/g,
    "$1",
  );

  readableText = readableText.replace(
    /\*([^*\n]+)\*/g,
    "$1",
  );

  readableText = readableText.replace(
    /_([^_\n]+)_/g,
    "$1",
  );

  readableText = readableText.replace(
    /~~([^~\n]+)~~/g,
    "$1",
  );

  readableText = readableText.replace(
    /`([^`\n]+)`/g,
    "$1",
  );

  readableText = readableText.replace(
    /^[ \t]*(?:---+|\*\*\*+|___+)[ \t]*$/gm,
    "",
  );

  readableText = readableText.replace(
    /[ \t]+\n/g,
    "\n",
  );

  readableText = readableText.replace(
    /(• [^\n]+)\n(?=• )/g,
    "$1\n\n",
  );

  readableText = readableText.replace(
    /\n{3,}/g,
    "\n\n",
  );

  return readableText.trim();
}

function createUniqueStoryTitle(
  requestedTitle,
  existingTitles,
) {
  const baseTitle =
    String(
      requestedTitle ||
        "Untitled story",
    ).trim() ||
    "Untitled story";

  const normalizedTitles = new Set(
    existingTitles.map((title) =>
      String(title)
        .trim()
        .toLowerCase(),
    ),
  );

  if (
    !normalizedTitles.has(
      baseTitle.toLowerCase(),
    )
  ) {
    return baseTitle;
  }

  let suffix = 2;

  while (
    normalizedTitles.has(
      `${baseTitle} (${suffix})`
        .toLowerCase(),
    )
  ) {
    suffix += 1;
  }

  return `${baseTitle} (${suffix})`;
}

function createStoryBlocks(text) {
  const normalized = normalizeStoryText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n\s*\n/)
    .map((paragraph, index) => ({
      id: `paragraph-${index}`,
      text: paragraph.replace(/\s*\n\s*/g, " ").trim(),
    }))
    .filter((paragraph) => paragraph.text.length > 0);
}

function isChapterHeading(text) {
  const heading =
    String(text || "").trim();

  if (
    !heading ||
    heading.length > 100
  ) {
    return false;
  }

  return /^(?:prologue|epilogue|introduction|preface|afterword|interlude|chapter\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:.-]\s*.+)?|part\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.-]\s*.+)?|book\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*[:.-]\s*.+)?)$/i.test(
    heading,
  );
}

function createTableOfContents(
  storyText,
  pages,
) {
  const blocks =
    createStoryBlocks(storyText);

  return blocks
    .filter((block) =>
      isChapterHeading(
        block.text,
      ),
    )
    .map((block, index) => {
      const pageIndex =
        pages.findIndex((page) =>
          page.fragments.some(
            (fragment) =>
              fragment.blockId ===
              block.id,
          ),
        );

      return {
        id: `chapter-${index}`,
        blockId: block.id,
        title: block.text,
        pageNumber:
          pageIndex >= 0
            ? pageIndex + 2
            : null,
      };
    })
    .filter(
      (chapter) =>
        chapter.pageNumber !== null,
    );
}

function getStoryProgress(story) {
  const currentPage = Math.max(
    1,
    Number(story?.currentPage) || 1,
  );

  const totalPages = Math.max(
    currentPage,
    Number(story?.totalPages) || 1,
  );

  if (totalPages <= 1) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      (currentPage - 1) /
        (totalPages - 1),
    ),
  );
}

function formatReadingTime(
  totalSeconds,
) {
  const safeSeconds = Math.max(
    0,
    Number(totalSeconds) || 0,
  );

  const totalMinutes =
    Math.floor(
      safeSeconds / 60,
    );

  if (totalMinutes < 1) {
    return "< 1 min";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(
    totalMinutes / 60,
  );

  const minutes =
    totalMinutes % 60;

  if (minutes === 0) {
    return `${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    }`;
  }

  return `${hours}h ${minutes}m`;
}

function formatLastOpened(
  timestamp,
) {
  if (!Number.isFinite(timestamp)) {
    return "Never opened";
  }

  const elapsed =
    Date.now() - timestamp;

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (elapsed < minute) {
    return "Opened just now";
  }

  if (elapsed < hour) {
    const minutes =
      Math.floor(
        elapsed / minute,
      );

    return `Opened ${minutes} ${
      minutes === 1
        ? "minute"
        : "minutes"
    } ago`;
  }

  if (elapsed < day) {
    const hours =
      Math.floor(
        elapsed / hour,
      );

    return `Opened ${hours} ${
      hours === 1
        ? "hour"
        : "hours"
    } ago`;
  }

  if (elapsed < day * 7) {
    const days =
      Math.floor(
        elapsed / day,
      );

    return `Opened ${days} ${
      days === 1
        ? "day"
        : "days"
    } ago`;
  }

  return `Opened ${new Date(
    timestamp,
  ).toLocaleDateString()}`;
}

function splitBlockIntoSentences(block) {
  const text = block.text;

  if (!text) {
    return [];
  }

  const segments = [];
  let cursor = 0;
  let segmentIndex = 0;

  function addSegment(startOffset, endOffset) {
    let cleanStart = startOffset;
    let cleanEnd = endOffset;

    while (
      cleanStart < cleanEnd &&
      /\s/.test(text[cleanStart])
    ) {
      cleanStart += 1;
    }

    while (
      cleanEnd > cleanStart &&
      /\s/.test(text[cleanEnd - 1])
    ) {
      cleanEnd -= 1;
    }

    if (cleanStart >= cleanEnd) {
      return;
    }

    segments.push({
      id: `${block.id}-sentence-${segmentIndex}`,
      blockId: block.id,
      startOffset: cleanStart,
      endOffset: cleanEnd,
      text: text.slice(cleanStart, cleanEnd),
    });

    segmentIndex += 1;
  }

  function findNextQuote(startIndex) {
    const quoteCharacters = ['"', "“", "‘", "«"];

    let nearestIndex = -1;
    let openingQuote = null;

    quoteCharacters.forEach((quote) => {
      const quoteIndex = text.indexOf(
        quote,
        startIndex,
      );

      if (
        quoteIndex >= 0 &&
        (
          nearestIndex < 0 ||
          quoteIndex < nearestIndex
        )
      ) {
        nearestIndex = quoteIndex;
        openingQuote = quote;
      }
    });

    return {
      index: nearestIndex,
      openingQuote,
    };
  }

  function closingQuoteFor(openingQuote) {
    if (openingQuote === "“") {
      return "”";
    }

    if (openingQuote === "‘") {
      return "’";
    }

    if (openingQuote === "«") {
      return "»";
    }

    return '"';
  }

  function addNarrationSentences(
    startOffset,
    endOffset,
  ) {
    const narrationText = text.slice(
      startOffset,
      endOffset,
    );

    if (!narrationText.trim()) {
      return;
    }

    const pattern =
      /[^.!?]+(?:[.!?]+["'’”)]*|$)/g;

    let match;

    while (
      (match = pattern.exec(narrationText)) !==
      null
    ) {
      addSegment(
        startOffset + match.index,
        startOffset +
          match.index +
          match[0].length,
      );
    }
  }

  while (cursor < text.length) {
    const nextQuote = findNextQuote(cursor);

    if (nextQuote.index < 0) {
      addNarrationSentences(
        cursor,
        text.length,
      );

      break;
    }

    if (nextQuote.index > cursor) {
      addNarrationSentences(
        cursor,
        nextQuote.index,
      );
    }

    const closingQuote = closingQuoteFor(
      nextQuote.openingQuote,
    );

    const closingIndex = text.indexOf(
      closingQuote,
      nextQuote.index + 1,
    );

    if (closingIndex < 0) {
      addSegment(
        nextQuote.index,
        text.length,
      );

      break;
    }

    addSegment(
      nextQuote.index,
      closingIndex + 1,
    );

    cursor = closingIndex + 1;
  }

  if (!segments.length) {
    addSegment(0, text.length);
  }

  return segments;
}

function attachSentenceSegments(pages, blocks) {
  const blocksById = new Map(
    blocks.map((block) => [
      block.id,
      block,
    ]),
  );

  const sentencesByBlock = new Map(
    blocks.map((block) => [
      block.id,
      splitBlockIntoSentences(block),
    ]),
  );

  return pages.map((page) => ({
    ...page,

    fragments: page.fragments.map((fragment) => {
      const block = blocksById.get(
        fragment.blockId,
      );

      const sentences =
        sentencesByBlock.get(fragment.blockId) || [];

      if (!block) {
        return {
          ...fragment,
          displaySegments: [
            {
              id: `${fragment.id}-plain`,
              type: "plain",
              blockId: fragment.blockId,
              startOffset: fragment.startOffset,
              endOffset: fragment.endOffset,
              text: fragment.text,
            },
          ],
        };
      }

      const overlappingSentences = sentences.filter(
        (sentence) =>
          sentence.endOffset > fragment.startOffset &&
          sentence.startOffset < fragment.endOffset,
      );

      const displaySegments = [];
      let cursor = fragment.startOffset;

      overlappingSentences.forEach((sentence) => {
        const sentenceSegmentStart = Math.max(
          sentence.startOffset,
          fragment.startOffset,
        );

        const sentenceSegmentEnd = Math.min(
          sentence.endOffset,
          fragment.endOffset,
        );

        if (cursor < sentenceSegmentStart) {
          displaySegments.push({
            id: `${fragment.id}-plain-${cursor}`,
            type: "plain",
            blockId: fragment.blockId,
            startOffset: cursor,
            endOffset: sentenceSegmentStart,
            text: block.text.slice(
              cursor,
              sentenceSegmentStart,
            ),
          });
        }

        if (
          sentenceSegmentStart <
          sentenceSegmentEnd
        ) {
          displaySegments.push({
            id: `${sentence.id}-segment-${sentenceSegmentStart}`,
            type: "sentence",
            sentenceId: sentence.id,
            blockId: sentence.blockId,
            sentenceStartOffset:
              sentence.startOffset,
            sentenceEndOffset:
              sentence.endOffset,
            startOffset: sentenceSegmentStart,
            endOffset: sentenceSegmentEnd,
            text: block.text.slice(
              sentenceSegmentStart,
              sentenceSegmentEnd,
            ),
          });
        }

        cursor = Math.max(
          cursor,
          sentenceSegmentEnd,
        );
      });

      if (cursor < fragment.endOffset) {
        displaySegments.push({
          id: `${fragment.id}-plain-${cursor}`,
          type: "plain",
          blockId: fragment.blockId,
          startOffset: cursor,
          endOffset: fragment.endOffset,
          text: block.text.slice(
            cursor,
            fragment.endOffset,
          ),
        });
      }

      if (!displaySegments.length) {
        displaySegments.push({
          id: `${fragment.id}-plain`,
          type: "plain",
          blockId: fragment.blockId,
          startOffset: fragment.startOffset,
          endOffset: fragment.endOffset,
          text: fragment.text,
        });
      }

      return {
        ...fragment,
        displaySegments,
      };
    }),
  }));
}

function measurePageContent({
  blocks,
  width,
  height,
  fontSize,
  lineHeight,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
}) {
  if (!blocks.length) {
    return [
      {
        id: "page-1",
        fragments: [],
        text: "",
      },
    ];
  }

  const measurementPage = document.createElement("div");

  measurementPage.style.position = "fixed";
  measurementPage.style.left = "-100000px";
  measurementPage.style.top = "0";
  measurementPage.style.visibility = "hidden";
  measurementPage.style.pointerEvents = "none";
  const contentWidth =
    width - paddingLeft - paddingRight - 2;

  const contentHeight =
    height - paddingTop - paddingBottom - 2;
  measurementPage.style.boxSizing = "border-box";
  measurementPage.style.width = `${contentWidth}px`;
  measurementPage.style.height = `${contentHeight}px`;
  measurementPage.style.padding = "0";
  measurementPage.style.border = "0";
  measurementPage.style.overflow = "visible";
  measurementPage.style.display = "flow-root";
  measurementPage.style.whiteSpace = "pre-wrap";
  measurementPage.style.fontFamily = "Georgia, 'Times New Roman', serif";
  measurementPage.style.fontSize = `${fontSize}px`;
  measurementPage.style.lineHeight = String(lineHeight);
  measurementPage.style.overflowWrap = "break-word";

  document.body.appendChild(measurementPage);

  const pages = [];
  let currentFragments = [];

  function pageFits(fragments) {
  measurementPage.replaceChildren();

  fragments.forEach((fragment, index) => {
    const paragraph = document.createElement("p");

    paragraph.textContent = fragment.text;

    paragraph.style.display = "block";
    paragraph.style.margin =
      index === fragments.length - 1
        ? "0"
        : "0 0 1em";

    paragraph.style.padding = "0";
    paragraph.style.border = "0";
    paragraph.style.font = "inherit";
    paragraph.style.lineHeight = "inherit";
    paragraph.style.whiteSpace = "pre-wrap";
    paragraph.style.overflowWrap = "break-word";
    paragraph.style.wordBreak = "normal";
    paragraph.style.boxSizing = "border-box";

    measurementPage.appendChild(paragraph);
  });

  const lastParagraph = measurementPage.lastElementChild;

  if (!lastParagraph) {
    return true;
  }

  const pageRect = measurementPage.getBoundingClientRect();
  const paragraphRect = lastParagraph.getBoundingClientRect();

  return paragraphRect.bottom <= pageRect.bottom - 2;
  }

  function saveCurrentPage() {
    if (!currentFragments.length) {
      return;
    }

    pages.push({
      id: `page-${pages.length + 1}`,
      fragments: currentFragments,
      text: currentFragments
        .map((fragment) => fragment.text)
        .join("\n\n"),
    });

    currentFragments = [];
  }

  for (const block of blocks) {
    const wholeBlock = {
      id: `${block.id}-0`,
      blockId: block.id,
      startOffset: 0,
      endOffset: block.text.length,
      text: block.text,
    };

    if (pageFits([...currentFragments, wholeBlock])) {
      currentFragments.push(wholeBlock);
      continue;
    }

    if (currentFragments.length) {
      saveCurrentPage();
    }

    if (pageFits([wholeBlock])) {
      currentFragments.push(wholeBlock);
      continue;
    }

    const words = block.text.split(/\s+/);
    let activeWords = [];
    let activeStartOffset = 0;
    let consumedCharacters = 0;

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      const candidateWords = [...activeWords, word];
      const candidateText = candidateWords.join(" ");

      const candidateFragment = {
        id: `${block.id}-${activeStartOffset}`,
        blockId: block.id,
        startOffset: activeStartOffset,
        endOffset: activeStartOffset + candidateText.length,
        text: candidateText,
      };

      if (pageFits([...currentFragments, candidateFragment])) {
        activeWords = candidateWords;
        continue;
      }

      if (activeWords.length) {
        const fragmentText = activeWords.join(" ");

        currentFragments.push({
          id: `${block.id}-${activeStartOffset}`,
          blockId: block.id,
          startOffset: activeStartOffset,
          endOffset: activeStartOffset + fragmentText.length,
          text: fragmentText,
        });

        saveCurrentPage();

        consumedCharacters += fragmentText.length + 1;
        activeStartOffset = consumedCharacters;
        activeWords = [word];
      } else {
        currentFragments.push({
          id: `${block.id}-${activeStartOffset}`,
          blockId: block.id,
          startOffset: activeStartOffset,
          endOffset: activeStartOffset + word.length,
          text: word,
        });

        saveCurrentPage();

        consumedCharacters += word.length + 1;
        activeStartOffset = consumedCharacters;
        activeWords = [];
      }
    }

    if (activeWords.length) {
      const fragmentText = activeWords.join(" ");

      currentFragments.push({
        id: `${block.id}-${activeStartOffset}`,
        blockId: block.id,
        startOffset: activeStartOffset,
        endOffset: activeStartOffset + fragmentText.length,
        text: fragmentText,
      });
    }
  }

  saveCurrentPage();
  measurementPage.remove();

  const measuredPages = pages.length
    ? pages
    : [
        {
          id: "page-1",
          fragments: [],
          text: "",
        },
      ];

  return attachSentenceSegments(
    measuredPages,
    blocks,
  );
}

function findPageForPosition(pages, position) {
  if (!position?.blockId) {
    return -1;
  }

  return pages.findIndex((page) =>
    page.fragments.some((fragment) => {
      if (
        fragment.blockId !==
        position.blockId
      ) {
        return false;
      }

      if (position.sentenceId) {
        return fragment.displaySegments?.some(
          (segment) =>
            segment.type === "sentence" &&
            segment.sentenceId ===
              position.sentenceId,
        );
      }

      const offset = position.offset || 0;

      return (
        offset >= fragment.startOffset &&
        offset < fragment.endOffset
      );
    }),
  );
}

function getPositionText(pages, position) {
  if (!position?.blockId) {
    return "";
  }

  for (const page of pages) {
    for (const fragment of page.fragments) {
      const segments =
        fragment.displaySegments || [];

      const matchingSegment = segments.find(
        (segment) => {
          if (
            segment.type !== "sentence" ||
            segment.blockId !==
              position.blockId
          ) {
            return false;
          }

          if (position.sentenceId) {
            return (
              segment.sentenceId ===
              position.sentenceId
            );
          }

          return (
            position.offset >=
              segment.startOffset &&
            position.offset <
              segment.endOffset
          );
        },
      );

      if (matchingSegment) {
        return matchingSegment.text;
      }
    }
  }

  return "";
}

function createNarrationQueue(
  storyText,
  pages,
  dialogueAnalysis = null,
) {
  const blocks =
    createStoryBlocks(
      storyText,
    );

  const analysisSegments =
    Array.isArray(
      dialogueAnalysis
        ?.narrationSegments,
    )
      ? dialogueAnalysis
          .narrationSegments
      : [];

  const characters =
    Array.isArray(
      dialogueAnalysis
        ?.characters,
    )
      ? dialogueAnalysis.characters
      : [];

  const charactersById =
    new Map(
      characters.map(
        (character) => [
          character.id,
          character,
        ],
      ),
    );

  const analysisByBlock =
    new Map();

  analysisSegments.forEach(
    (segment) => {
      if (!segment?.blockId) {
        return;
      }

      const existing =
        analysisByBlock.get(
          segment.blockId,
        ) || [];

      existing.push(segment);

      analysisByBlock.set(
        segment.blockId,
        existing,
      );
    },
  );

  analysisByBlock.forEach(
    (segments) => {
      segments.sort(
        (first, second) =>
          (
            first.startOffset || 0
          ) -
          (
            second.startOffset || 0
          ),
      );
    },
  );

  function createQueueItem({
    sentence,
    startOffset,
    endOffset,
    text,
    analysisSegment,
    itemIndex,
  }) {
    const position = {
      blockId:
        sentence.blockId,
      sentenceId:
        sentence.id,
      offset: startOffset,
      sentenceStartOffset:
        sentence.startOffset,
      sentenceEndOffset:
        sentence.endOffset,
    };

    const pageIndex =
      findPageForPosition(
        pages,
        position,
      );

    const segmentType =
      analysisSegment?.type ===
      "dialogue"
        ? "dialogue"
        : "narration";

    const character =
      analysisSegment?.speakerId
        ? charactersById.get(
            analysisSegment
              .speakerId,
          )
        : null;

    const speakerName =
      segmentType === "dialogue"
        ? (
            character?.name ||
            analysisSegment
              ?.speakerName ||
            "Unknown speaker"
          )
        : "Narrator";

    return {
      id:
        `${sentence.id}-plan-${itemIndex}`,

      blockId:
        sentence.blockId,

      sentenceId:
        sentence.id,

      startOffset,
      endOffset,
      text,

      sentenceStartOffset:
        sentence.startOffset,

      sentenceEndOffset:
        sentence.endOffset,

      pageNumber:
        pageIndex >= 0
          ? pageIndex + 2
          : null,

      narrationType:
        segmentType,

      analysisSegmentId:
        analysisSegment?.id ||
        null,

      speakerId:
        analysisSegment
          ?.speakerId ||
        null,

      speakerName,

      speakerConfidence:
        Number(
          analysisSegment
            ?.confidence,
        ) || 0,

      manuallyCorrected:
        analysisSegment
          ?.manuallyCorrected ===
        true,

      correctionType:
        analysisSegment
          ?.correctionType ||
        null,

      voiceCategory:
        character
          ?.voiceCategory ||
        (
          segmentType ===
          "dialogue"
            ? "adult-neutral"
            : "narrator"
        ),

      preferredVoiceId:
        character
          ?.preferredVoiceId ||
        null,
    };
  }

  const queue = [];

  blocks.forEach((block) => {
    const sentences =
      splitBlockIntoSentences(
        block,
      );

    const blockAnalysis =
      analysisByBlock.get(
        block.id,
      ) || [];

    sentences.forEach(
      (sentence) => {
        const overlappingSegments =
          blockAnalysis.filter(
            (segment) =>
              (
                segment.endOffset || 0
              ) >
                sentence.startOffset &&
              (
                segment.startOffset || 0
              ) <
                sentence.endOffset,
          );

        if (
          overlappingSegments.length ===
          0
        ) {
          queue.push(
            createQueueItem({
              sentence,
              startOffset:
                sentence.startOffset,
              endOffset:
                sentence.endOffset,
              text: sentence.text,
              analysisSegment: null,
              itemIndex:
                queue.length,
            }),
          );

          return;
        }

        let cursor =
          sentence.startOffset;

        overlappingSegments.forEach(
          (analysisSegment) => {
            const segmentStart =
              Math.max(
                sentence.startOffset,
                analysisSegment
                  .startOffset || 0,
              );

            const segmentEnd =
              Math.min(
                sentence.endOffset,
                analysisSegment
                  .endOffset || 0,
              );

            if (
              cursor < segmentStart
            ) {
              const gapText =
                block.text
                  .slice(
                    cursor,
                    segmentStart,
                  )
                  .trim();

              if (gapText) {
                const leadingWhitespace =
                  block.text
                    .slice(
                      cursor,
                      segmentStart,
                    )
                    .indexOf(
                      gapText,
                    );

                const gapStart =
                  cursor +
                  Math.max(
                    leadingWhitespace,
                    0,
                  );

                queue.push(
                  createQueueItem({
                    sentence,
                    startOffset:
                      gapStart,
                    endOffset:
                      gapStart +
                      gapText.length,
                    text: gapText,
                    analysisSegment:
                      null,
                    itemIndex:
                      queue.length,
                  }),
                );
              }
            }

            if (
              segmentStart <
              segmentEnd
            ) {
              const segmentText =
                block.text
                  .slice(
                    segmentStart,
                    segmentEnd,
                  )
                  .trim();

              if (segmentText) {
                const leadingWhitespace =
                  block.text
                    .slice(
                      segmentStart,
                      segmentEnd,
                    )
                    .indexOf(
                      segmentText,
                    );

                const cleanStart =
                  segmentStart +
                  Math.max(
                    leadingWhitespace,
                    0,
                  );

                queue.push(
                  createQueueItem({
                    sentence,
                    startOffset:
                      cleanStart,
                    endOffset:
                      cleanStart +
                      segmentText.length,
                    text:
                      segmentText,
                    analysisSegment,
                    itemIndex:
                      queue.length,
                  }),
                );
              }
            }

            cursor = Math.max(
              cursor,
              segmentEnd,
            );
          },
        );

        if (
          cursor <
          sentence.endOffset
        ) {
          const finalText =
            block.text
              .slice(
                cursor,
                sentence.endOffset,
              )
              .trim();

          if (finalText) {
            const leadingWhitespace =
              block.text
                .slice(
                  cursor,
                  sentence.endOffset,
                )
                .indexOf(
                  finalText,
                );

            const finalStart =
              cursor +
              Math.max(
                leadingWhitespace,
                0,
              );

            queue.push(
              createQueueItem({
                sentence,
                startOffset:
                  finalStart,
                endOffset:
                  finalStart +
                  finalText.length,
                text: finalText,
                analysisSegment:
                  null,
                itemIndex:
                  queue.length,
              }),
            );
          }
        }
      },
    );
  });

  return queue;
}

function findNarrationQueueIndex(
  queue,
  position,
) {
  if (
    !Array.isArray(queue) ||
    !position?.blockId
  ) {
    return -1;
  }

  const requestedOffset =
    Number.isFinite(
      position.offset,
    )
      ? position.offset
      : Number.isFinite(
            position
              .sentenceStartOffset,
          )
        ? position
            .sentenceStartOffset
        : null;

  if (
    requestedOffset !== null
  ) {
    const containingIndex =
      queue.findIndex(
        (item) =>
          item.blockId ===
            position.blockId &&
          requestedOffset >=
            item.startOffset &&
          requestedOffset <
            item.endOffset,
      );

    if (
      containingIndex >= 0
    ) {
      return containingIndex;
    }
  }

  if (position.sentenceId) {
    return queue.findIndex(
      (item) =>
        item.blockId ===
          position.blockId &&
        item.sentenceId ===
          position.sentenceId,
    );
  }

  return queue.findIndex(
    (item) =>
      item.blockId ===
      position.blockId,
  );
}

function findWordRange(
  text,
  characterIndex,
  characterLength = 0,
) {
  if (!text) {
    return null;
  }

  const safeIndex = Math.min(
    Math.max(characterIndex || 0, 0),
    text.length - 1,
  );

  let startOffset = safeIndex;

  while (
    startOffset < text.length &&
    /\s/.test(text[startOffset])
  ) {
    startOffset += 1;
  }

  if (startOffset >= text.length) {
    return null;
  }

  let endOffset =
    characterLength > 0
      ? Math.min(
          startOffset + characterLength,
          text.length,
        )
      : startOffset;

  if (characterLength <= 0) {
    while (
      endOffset < text.length &&
      !/\s/.test(text[endOffset])
    ) {
      endOffset += 1;
    }
  } else {
    while (
      endOffset > startOffset &&
      /\s/.test(text[endOffset - 1])
    ) {
      endOffset -= 1;
    }
  }

  if (endOffset <= startOffset) {
    return null;
  }

  return {
    startOffset,
    endOffset,
  };
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-stone-950/45 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-white/50 bg-stone-50 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-stone-500 hover:bg-stone-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function BookPage({
  pageNumber,
  page,
  pageWidth = PAGE_LAYOUT.desktopWidth,
  pageHeight = PAGE_LAYOUT.desktopHeight,
  fontSize,
  lineHeight,
  theme,
  selectedPosition,
  readingPosition,
  narrationPosition,
  narrationWordPosition,
  onSelectSentence,
  onPreviousPage,
  onNextPage,
}) {
  const colors =
    theme === "night"
      ? "bg-stone-900 text-stone-200 border-stone-700"
      : theme === "white"
        ? "bg-white text-stone-800 border-stone-200"
        : "bg-[#fbf4df] text-stone-800 border-[#ddcfaa]";

  const fragments = page?.fragments || [];
  const pagePadding = getPagePadding(
    pageWidth,
    pageHeight,
  );

  const horizontalPadding =
    pagePadding.horizontal;

  const topPadding =
    pagePadding.top;

  const bottomPadding =
    pagePadding.bottom;

  function isSentenceSelected(segment) {
    if (
      segment.type !== "sentence" ||
      !selectedPosition?.blockId
    ) {
      return false;
    }

    if (
      segment.blockId !==
      selectedPosition.blockId
    ) {
      return false;
    }

    if (selectedPosition.sentenceId) {
      return (
        segment.sentenceId ===
        selectedPosition.sentenceId
      );
    }

    const offset =
      selectedPosition.offset || 0;

    return (
      offset >= segment.startOffset &&
      offset < segment.endOffset
    );
  }

  function isReadingPosition(segment) {
    if (
      segment.type !== "sentence" ||
      !readingPosition?.blockId
    ) {
      return false;
    }

    if (
      segment.blockId !==
      readingPosition.blockId
    ) {
      return false;
    }

    if (readingPosition.sentenceId) {
      return (
        segment.sentenceId ===
        readingPosition.sentenceId
      );
    }

    const offset =
      readingPosition.offset || 0;

    return (
      offset >= segment.startOffset &&
      offset < segment.endOffset
    );
  }

  function isNarrationPosition(segment) {
    if (
      segment.type !== "sentence" ||
      !narrationPosition?.blockId
    ) {
      return false;
    }

    if (
      segment.blockId !==
      narrationPosition.blockId
    ) {
      return false;
    }

    if (narrationPosition.sentenceId) {
      return (
        segment.sentenceId ===
        narrationPosition.sentenceId
      );
    }

    const offset =
      narrationPosition.offset || 0;

    return (
      offset >= segment.startOffset &&
      offset < segment.endOffset
    );
  }

  function renderNarrationSegment(segment) {
    if (
      !narrationWordPosition ||
      segment.type !== "sentence" ||
      segment.blockId !==
        narrationWordPosition.blockId ||
      segment.sentenceId !==
        narrationWordPosition.sentenceId
    ) {
      return segment.text;
    }

    const wordStart = Math.max(
      segment.startOffset,
      narrationWordPosition.startOffset,
    );

    const wordEnd = Math.min(
      segment.endOffset,
      narrationWordPosition.endOffset,
    );

    if (wordStart >= wordEnd) {
      return segment.text;
    }

    const localWordStart =
      wordStart - segment.startOffset;

    const localWordEnd =
      wordEnd - segment.startOffset;

    const beforeWord = segment.text.slice(
      0,
      localWordStart,
    );

    const spokenWord = segment.text.slice(
      localWordStart,
      localWordEnd,
    );

    const afterWord = segment.text.slice(
      localWordEnd,
    );

    return (
      <>
        {beforeWord}

        <mark
          className={
            theme === "night"
              ? "rounded-sm bg-emerald-300 px-0.5 text-stone-950"
              : "rounded-sm bg-emerald-500/65 px-0.5 text-stone-950"
          }
        >
          {spokenWord}
        </mark>

        {afterWord}
      </>
    );
  }

  return (
    <div
      className={`relative mx-auto shrink-0 overflow-hidden border shadow-xl ${colors}`}
      style={{
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        minHeight: `${pageHeight}px`,
        maxHeight: `${pageHeight}px`,
        maxWidth: "100%",
        boxSizing: "border-box",
        paddingTop: `${topPadding}px`,
        paddingRight: `${horizontalPadding}px`,
        paddingBottom: `${bottomPadding}px`,
        paddingLeft: `${horizontalPadding}px`,
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/10 to-transparent" />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPreviousPage?.();
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
        }}
        className="absolute left-0 top-0 z-10 w-8 bg-transparent opacity-0 transition-opacity hover:bg-black/5 hover:opacity-100"
        style={{
          bottom: `${bottomPadding}px`,
        }}
        aria-label="Previous page"
        title="Previous page"
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onNextPage?.();
        }}
        onTouchStart={(event) => {
          event.stopPropagation();
        }}
        className="absolute right-0 top-0 z-10 w-8 bg-transparent opacity-0 transition-opacity hover:bg-black/5 hover:opacity-100"
        style={{
          bottom: `${bottomPadding}px`,
        }}
        aria-label="Next page"
        title="Next page"
      />
      <div
        className="overflow-hidden break-words"
        style={{
          height: `${
            pageHeight -
            topPadding -
            bottomPadding -
            2
          }px`,
          fontFamily:
            "Georgia, 'Times New Roman', serif",
          fontSize,
          lineHeight,
          overflowWrap: "break-word",
        }}
      >
        {fragments.length > 0 ? (
          fragments.map(
            (fragment, fragmentIndex) => {
              const displaySegments =
                fragment.displaySegments || [];

              return (
                <p
                  key={fragment.id}
                  style={{
                    margin:
                      fragmentIndex ===
                      fragments.length - 1
                        ? "0"
                        : "0 0 1em",
                    padding: 0,
                    boxSizing: "border-box",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "break-word",
                  }}
                >
                  {displaySegments.length > 0
                    ? displaySegments.map(
                        (segment) => {
                          if (
                            segment.type ===
                            "plain"
                          ) {
                            return (
                              <React.Fragment
                                key={segment.id}
                              >
                                {segment.text}
                              </React.Fragment>
                            );
                          }

                          const selected =
                            isSentenceSelected(
                              segment,
                            );

                          const reading =
                            isReadingPosition(
                            segment,
                            );
                            
                          const narrating =
                            isNarrationPosition(
                            segment,
                            );
                          
                          return (
                            <span
                              key={segment.id}
                              onTouchStart={(event) => {
                                event.stopPropagation();
                              }}
                              onTouchMove={(event) => {
                                event.stopPropagation();
                              }}
                              onTouchEnd={(event) => {
                                event.stopPropagation();
                              }}
                              onClick={(event) => {
                                event.stopPropagation();

                                const rectangle =
                                  event.currentTarget.getBoundingClientRect();

                                onSelectSentence?.(
                                  segment,
                                  pageNumber,
                                  {
                                    x:
                                      rectangle.left +
                                      rectangle.width / 2,
                                    y: rectangle.bottom + 8,
                                  },
                                );
                              }}
                              className={`cursor-pointer rounded-sm transition-colors ${
                                narrating
                                  ? theme === "night"
                                    ? "bg-emerald-300/25 outline outline-1 outline-emerald-300/40"
                                    : "bg-emerald-300/35 outline outline-1 outline-emerald-800/25"
                                  : selected
                                    ? theme === "night"
                                      ? "bg-amber-300/25 outline outline-1 outline-amber-300/30"
                                      : "bg-amber-300/35 outline outline-1 outline-amber-700/20"
                                    : reading
                                      ? theme === "night"
                                        ? "border-b-2 border-sky-400"
                                        : "border-b-2 border-sky-700"
                                      : theme === "night"
                                        ? "hover:bg-white/5"
                                        : "hover:bg-amber-200/20"
                              }`}
                              title="Select this sentence"
                            >
                              {narrating
                                ? renderNarrationSegment(segment)
                                : segment.text}
                            </span>
                          );
                        },
                      )
                    : fragment.text}
                </p>
              );
            },
          )
        ) : (
          <span className="text-stone-400">
            Blank page
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-4 text-center font-serif text-xs opacity-50">
        {pageNumber}
      </div>
    </div>
  );
}

function PageTurnOverlay({
  direction,
  page,
  pageNumber,
  pageWidth,
  pageHeight,
  settings,
  selectedPosition,
  readingPosition,
  narrationPosition,
  narrationWordPosition,
  isMobileLayout,
  onComplete,
}) {
  const turningForward =
    direction === "forward";

  const overlayPosition = isMobileLayout
    ? {
        left: 0,
      }
    : turningForward
      ? {
          left: pageWidth + 4,
        }
      : {
          left: 0,
        };

  return (
    <motion.div
      initial={{
        rotateY: 0,
      }}
      animate={{
        rotateY: turningForward
          ? -180
          : 180,
      }}
      transition={{
        duration: 0.55,
        ease: [0.42, 0, 0.24, 1],
      }}
      onAnimationComplete={onComplete}
      className="pointer-events-none absolute top-0 z-30"
      style={{
        ...overlayPosition,
        width: `${pageWidth}px`,
        height: `${pageHeight}px`,
        transformOrigin: turningForward
          ? "left center"
          : "right center",
        transformStyle: "preserve-3d",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <div
        className="relative h-full w-full"
        style={{
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        <BookPage
          pageNumber={pageNumber}
          page={page}
          pageWidth={pageWidth}
          pageHeight={pageHeight}
          selectedPosition={selectedPosition}
          readingPosition={readingPosition}
          narrationPosition={narrationPosition}
          narrationWordPosition={
            narrationWordPosition
          }
          {...settings}
        />

        <motion.div
          aria-hidden="true"
          className="absolute inset-0"
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: [
              0,
              0.18,
              0.42,
              0.12,
            ],
          }}
          transition={{
            duration: 0.55,
            times: [0, 0.35, 0.7, 1],
          }}
          style={{
            background: turningForward
              ? "linear-gradient(to left, rgba(0,0,0,0.42), rgba(0,0,0,0.04) 54%, rgba(255,255,255,0.08))"
              : "linear-gradient(to right, rgba(0,0,0,0.42), rgba(0,0,0,0.04) 54%, rgba(255,255,255,0.08))",
          }}
        />
      </div>
    </motion.div>
    
  );
}


export default function App() {
  const [data, setData] = useState(loadData);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [draftName, setDraftName] =
    useState("");

  const [draftAuthor, setDraftAuthor] =
    useState("");

  const [
    draftDescription,
    setDraftDescription,
  ] = useState("");

  const [draftTags, setDraftTags] =
    useState("");

  const [
    draftReadingStatus,
    setDraftReadingStatus,
  ] = useState("unread");

  const [
    draftFolderId,
    setDraftFolderId,
  ] = useState("unfiled");

  const [pages, setPages] = useState([
    {
      id: "page-1",
      fragments: [],
      text: "",
    },
  ]);
  const [isPaginating, setIsPaginating] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [selectionMenu, setSelectionMenu] = useState(null);
  const [
    bookmarkPanelOpen,
    setBookmarkPanelOpen,
  ] = useState(false);

  const [
    tableOfContentsOpen,
    setTableOfContentsOpen,
  ] = useState(false);

  const [
    statisticsPanelOpen,
    setStatisticsPanelOpen,
  ] = useState(false);

  const [
    characterManagerOpen,
    setCharacterManagerOpen,
  ] = useState(false);

  const [
    characterEditingId,
    setCharacterEditingId,
  ] = useState(null);

  const [
    characterDraftName,
    setCharacterDraftName,
  ] = useState("");

  const [
    characterDraftAliases,
    setCharacterDraftAliases,
  ] = useState("");

  const [
    characterDraftRole,
    setCharacterDraftRole,
  ] = useState("minor");

  const [
    characterDraftLocked,
    setCharacterDraftLocked,
  ] = useState(false);

  const [
    characterDraftTemporary,
    setCharacterDraftTemporary,
  ] = useState(false);

  const [
    characterDraftVoiceCategory,
    setCharacterDraftVoiceCategory,
  ] = useState("adult-neutral");

  const [
    characterDraftVoiceId,
    setCharacterDraftVoiceId,
  ] = useState("");

  const [
    characterDraftNotes,
    setCharacterDraftNotes,
  ] = useState("");

  const [
    characterDeleteCandidateId,
    setCharacterDeleteCandidateId,
  ] = useState(null);

  const [
    characterMergeTargetId,
    setCharacterMergeTargetId,
  ] = useState("");

  const [
    characterMergeConfirmation,
    setCharacterMergeConfirmation,
  ] = useState(false);

  const [
    dialogueReviewOpen,
    setDialogueReviewOpen,
  ] = useState(false);

  const [
    dialogueReviewFilter,
    setDialogueReviewFilter,
  ] = useState("all");

  const [
    dialogueEditingSegmentId,
    setDialogueEditingSegmentId,
  ] = useState(null);

  const [
    dialogueNewCharacterName,
    setDialogueNewCharacterName,
  ] = useState("");

  const [
    dialogueAnalysisRunning,
    setDialogueAnalysisRunning,
  ] = useState(false);

  const [
    dialogueAnalysisError,
    setDialogueAnalysisError,
  ] = useState("");

  const [bookmarkBeingRenamed, setBookmarkBeingRenamed] =
    useState(null);

  const [bookmarkName, setBookmarkName] =
    useState("");
  const [pageInput, setPageInput] =
    useState("");
  const [touchGesture, setTouchGesture] =
    useState(null);
  const [pageTurn, setPageTurn] =
    useState(null);
  const [voices, setVoices] =
  useState([]);
  const [
    selectedVoiceId,
    setSelectedVoiceId,
  ] = useState(
    () =>
      data.settings
        ?.narrationVoiceId || "",
  );

  const [
    narrationRate,
    setNarrationRate,
  ] = useState(
    () =>
      data.settings
        ?.narrationRate || 1,
  );

  const [
    narrationWordHighlightEnabled,
    setNarrationWordHighlightEnabled,
  ] = useState(
    () =>
      data.settings
        ?.narrationWordHighlight !==
      false,
  );
  const [narrationStatus, setNarrationStatus] =
    useState("idle");

  const [
    narrationPosition,
    setNarrationPosition,
  ] = useState(null);

  const [
    narrationSpeaker,
    setNarrationSpeaker,
  ] = useState(null);

  const [
    narrationWordPosition,
    setNarrationWordPosition,
  ] = useState(null);

  const [narrationError, setNarrationError] =
    useState("");

  const [
    storageError,
    setStorageError,
  ] = useState("");

  const [
    importResult,
    setImportResult,
  ] = useState(null);

  const [isMobileLayout, setIsMobileLayout] = useState(

    () => window.innerWidth < 768,
  );

  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const readerRef = useRef(null);
  const narrationQueueRef = useRef([]);
  const narrationIndexRef = useRef(-1);
  const narrationSessionRef = useRef(0);
  const narrationUtteranceRef =
  useRef(null);

  const narrationPageRef =
    useRef(null);

  const [readerPageSize, setReaderPageSize] =
    useState({
      width: PAGE_LAYOUT.desktopWidth,
      height: PAGE_LAYOUT.desktopHeight,
    });

  const prefersReducedMotion =
    useReducedMotion();

const activeStory =
  data.stories.find((story) => story.id === data.activeStoryId) ||
  data.stories[0];

const currentPage = Math.min(
  Math.max(activeStory?.currentPage || 1, 1),
  pages.length + 1,
);

const displayedPage =
  currentPage <= 1
    ? 2
    : isMobileLayout
      ? currentPage
      : currentPage % 2 === 0
        ? currentPage
        : currentPage - 1;

  const navigationStep =
    isMobileLayout ? 1 : 2;

  const chapters = useMemo(
    () =>
      createTableOfContents(
        activeStory?.text || "",
        pages,
      ),
    [
      activeStory?.id,
      activeStory?.text,
      pages,
    ],
  );

  const activeChapter = useMemo(() => {
    if (
      !chapters.length ||
      currentPage <= 1
    ) {
      return null;
    }

    let matchingChapter = null;

    chapters.forEach((chapter) => {
      if (
        chapter.pageNumber <=
        currentPage
      ) {
        matchingChapter = chapter;
      }
    });

    return matchingChapter;
  }, [
    chapters,
    currentPage,
  ]);

  const dialogueCharacters =
  useMemo(() => {
    const characters =
      activeStory
        ?.dialogueAnalysis
        ?.characters;

    if (!Array.isArray(characters)) {
      return [];
    }

    return characters
      .slice()
      .sort((first, second) =>
        String(
          first.name || "",
        ).localeCompare(
          String(
            second.name || "",
          ),
          undefined,
          {
            sensitivity: "base",
          },
        ),
      );
  }, [
    activeStory?.id,
    activeStory
      ?.dialogueAnalysis
      ?.characters,
  ]);

  const dialogueSegments =
    useMemo(() => {
      const segments =
        activeStory
          ?.dialogueAnalysis
          ?.narrationSegments;

      if (!Array.isArray(segments)) {
        return [];
      }

      return segments.filter(
        (segment) =>
          segment.type ===
          "dialogue",
      );
    }, [
      activeStory?.id,
      activeStory
        ?.dialogueAnalysis
        ?.analysedAt,
      activeStory
        ?.dialogueAnalysis
        ?.narrationSegments,
    ]);

  const filteredDialogueSegments =
    useMemo(() => {
      if (
        dialogueReviewFilter ===
        "unresolved"
      ) {
        return dialogueSegments.filter(
          (segment) =>
            !segment.speakerId &&
            segment.correctionType !==
              "confirmed-unknown",
        );
      }

      if (
        dialogueReviewFilter ===
        "low-confidence"
      ) {
        return dialogueSegments.filter(
          (segment) =>
            !segment.manuallyCorrected &&
            Number(
              segment.confidence,
            ) < 0.7,
        );
      }

      if (
        dialogueReviewFilter ===
        "resolved"
      ) {
        return dialogueSegments.filter(
          (segment) =>
            Boolean(
              segment.speakerId,
            ) ||
            segment.correctionType ===
              "confirmed-unknown",
        );
      }

      return dialogueSegments;
    }, [
      dialogueSegments,
      dialogueReviewFilter,
    ]);

  const unresolvedDialogueCount =
    dialogueSegments.filter(
      (segment) =>
        !segment.speakerId &&
        segment.correctionType !==
          "confirmed-unknown",
    ).length;

  const lowConfidenceDialogueCount =
    dialogueSegments.filter(
      (segment) =>
        !segment.manuallyCorrected &&
        Number(
          segment.confidence,
        ) < 0.7,
    ).length;

  const narrationPreview = useMemo(() => {
  const position =
    narrationPosition ||
    activeStory?.narrationPosition;

  if (
    !activeStory?.text ||
    !position?.sentenceId
  ) {
    return "";
  }

  const queue = createNarrationQueue(
    activeStory.text,
    pages,
    activeStory.dialogueAnalysis,
  );

  const itemIndex =
    findNarrationQueueIndex(
      queue,
      position,
    );

  return itemIndex >= 0
    ? queue[itemIndex].text
    : "";
}, [
  activeStory?.id,
  activeStory?.text,
  activeStory?.narrationPosition,
  activeStory?.dialogueAnalysis,
  narrationPosition,
  pages,
]);

const narrationStatusLabel =
  narrationStatus === "playing"
    ? "Playing"
    : narrationStatus === "paused"
      ? "Paused"
      : activeStory?.narrationPosition
        ? "Ready to resume"
        : "Not started";

useEffect(() => {
  setBookOpen(
    (activeStory?.currentPage || 1) > 1,
  );

  narrationSessionRef.current += 1;
  narrationQueueRef.current = [];
  narrationIndexRef.current = -1;
  narrationUtteranceRef.current = null;
  narrationPageRef.current = null;

  if (
    typeof window !== "undefined" &&
    "speechSynthesis" in window
  ) {
    window.speechSynthesis.cancel();
  }

  setNarrationStatus("idle");
  setNarrationPosition(null);
  setNarrationSpeaker(null);
  setNarrationWordPosition(null);
  setNarrationError("");

  setSelectedPosition(null);
  setSelectionMenu(null);
  setBookmarkPanelOpen(false);
  setTableOfContentsOpen(false);
  setStatisticsPanelOpen(false);
  setCharacterManagerOpen(false);
  setCharacterEditingId(null);
  setCharacterDraftName("");
  setCharacterDraftAliases("");
  setCharacterDraftRole("minor");
  setCharacterDraftLocked(false);
  setCharacterDraftTemporary(false);
  setCharacterDraftVoiceCategory(
    "adult-neutral",
  );
  setCharacterDraftVoiceId("");
  setCharacterDraftNotes("");
  setCharacterDeleteCandidateId(
    null,
  );

  setCharacterMergeTargetId("");
  setCharacterMergeConfirmation(
    false,
  );

  setDialogueReviewOpen(false);
  setDialogueReviewFilter("all");
  setDialogueEditingSegmentId(null);
  setDialogueNewCharacterName("");
  setBookmarkBeingRenamed(null);
  setBookmarkName("");
  setPageInput("");
  setPageTurn(null);
}, [activeStory?.id]);

useEffect(() => {
  if (
    !bookOpen ||
    !activeStory?.id
  ) {
    return;
  }

  function addReadingTime() {
    if (
      document.visibilityState !==
      "visible"
    ) {
      return;
    }

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) =>
            story.id ===
            activeStory.id
              ? {
                  ...story,
                  readingTimeSeconds:
                    (
                      story.readingTimeSeconds ||
                      0
                    ) + 30,
                }
              : story,
        ),
    }));
  }

  const timer = window.setInterval(
    addReadingTime,
    30000,
  );

  return () => {
    window.clearInterval(
      timer,
    );
  };
}, [
  activeStory?.id,
  bookOpen,
]);

useEffect(() => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...data,
        version: DATA_VERSION,
      }),
    );

    if (
      localStorage.getItem(
        LEGACY_STORAGE_KEY,
      )
    ) {
      localStorage.removeItem(
        LEGACY_STORAGE_KEY,
      );
    }

    setStorageError("");
  } catch (error) {
    console.error(
      "BP could not save the library.",
      error,
    );

    if (
      error?.name ===
        "QuotaExceededError" ||
      error?.code === 22
    ) {
      setStorageError(
        "Browser storage is full. Your latest changes may not be saved. Remove unused stories or export a backup.",
      );
    } else {
      setStorageError(
        "BP could not save your latest changes in this browser.",
      );
    }
  }
}, [data]);

useEffect(() => {
  setData((current) => {
    const currentVoiceId =
      current.settings
        ?.narrationVoiceId || "";

    const currentRate =
      current.settings
        ?.narrationRate || 1;

    const currentWordHighlight =
      current.settings
        ?.narrationWordHighlight !==
      false;

    if (
      currentVoiceId ===
        selectedVoiceId &&
      currentRate ===
        narrationRate &&
      currentWordHighlight ===
        narrationWordHighlightEnabled
    ) {
      return current;
    }

    return {
      ...current,

      settings: {
        ...current.settings,
        narrationVoiceId:
          selectedVoiceId,
        narrationRate,
        narrationWordHighlight:
          narrationWordHighlightEnabled,
      },
    };
  });
}, [
  selectedVoiceId,
  narrationRate,
  narrationWordHighlightEnabled,
]);

useEffect(() => {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window)
  ) {
    setNarrationError(
      "Speech synthesis is not supported by this browser.",
    );

    return;
  }

  const synthesis =
    window.speechSynthesis;

  function loadVoices() {
    const availableVoices =
      synthesis.getVoices();

    setVoices(availableVoices);

    if (availableVoices.length > 0) {
      setSelectedVoiceId(
        (currentVoiceId) => {
          const existingVoice =
            availableVoices.some(
              (voice) =>
                voice.voiceURI ===
                currentVoiceId,
            );

          if (existingVoice) {
            return currentVoiceId;
          }

          const englishVoice =
            availableVoices.find(
              (voice) =>
                voice.lang
                  .toLowerCase()
                  .startsWith("en"),
            );

          return (
            englishVoice?.voiceURI ||
            availableVoices[0].voiceURI
          );
        },
      );
    }
  }

  loadVoices();

  synthesis.addEventListener(
    "voiceschanged",
    loadVoices,
  );

  return () => {
    synthesis.removeEventListener(
      "voiceschanged",
      loadVoices,
    );
  };
}, []);

useEffect(() => {
  return () => {
    narrationSessionRef.current += 1;

    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
    }
  };
}, []);

useEffect(() => {
  function handleResize() {
    setIsMobileLayout(
      window.innerWidth < 768,
    );
  }

  window.addEventListener(
    "resize",
    handleResize,
  );

  return () => {
    window.removeEventListener(
      "resize",
      handleResize,
    );
  };
}, []);

  useEffect(() => {
    const element = readerRef.current;

    if (!element || !bookOpen) {
      return;
    }

    function updatePageSize() {
      const availableWidth =
        element.clientWidth;

      const availableHeight = Math.max(
        360,
        window.innerHeight - 190,
      );

      const baseWidth = isMobileLayout
        ? PAGE_LAYOUT.mobileWidth
        : PAGE_LAYOUT.desktopWidth;

      const baseHeight = isMobileLayout
        ? PAGE_LAYOUT.mobileHeight
        : PAGE_LAYOUT.desktopHeight;

      const availableWidthPerPage =
        isMobileLayout
          ? Math.max(
              280,
              availableWidth - 4,
            )
          : Math.max(
              320,
              (availableWidth - 4) / 2,
            );

      const widthScale = Math.min(
        1,
        availableWidthPerPage / baseWidth,
      );

      const heightScale = Math.min(
        1,
        availableHeight / baseHeight,
      );

      const scale = Math.min(
        widthScale,
        heightScale,
      );

      setReaderPageSize({
        width: Math.floor(
          baseWidth * scale,
        ),
        height: Math.floor(
          baseHeight * scale,
        ),
      });
    }

    updatePageSize();

    const observer =
      new ResizeObserver(updatePageSize);

    observer.observe(element);

    window.addEventListener(
      "resize",
      updatePageSize,
    );

    return () => {
      observer.disconnect();

      window.removeEventListener(
        "resize",
        updatePageSize,
      );
    };
  }, [
    isMobileLayout,
    sidebarOpen,
    bookOpen,
  ]);

  useEffect(() => {
  let cancelled = false;

  async function paginateStory() {
    setIsPaginating(true);

    await document.fonts.ready;

    if (cancelled) {
      return;
    }

    const blocks = createStoryBlocks(activeStory?.text || "");

    const pagePadding = getPagePadding(
      readerPageSize.width,
      readerPageSize.height,
    );

    const nextPages = measurePageContent({
      blocks,
      width: readerPageSize.width,
      height: readerPageSize.height,
      fontSize: data.settings.fontSize,
      lineHeight: data.settings.lineHeight,
      paddingTop: pagePadding.top,
      paddingRight: pagePadding.horizontal,
      paddingBottom: pagePadding.bottom,
      paddingLeft: pagePadding.horizontal,
    });

    if (!cancelled) {
      setPages(nextPages);

      const maximumPage =
        nextPages.length + 1;

      if (
        activeStory &&
        activeStory.totalPages !==
          maximumPage
      ) {
        setData((current) => ({
          ...current,

          stories:
            current.stories.map(
              (story) =>
                story.id ===
                activeStory.id
                  ? {
                      ...story,
                      totalPages:
                        maximumPage,
                    }
                  : story,
            ),
        }));
      }

      if (
        activeStory &&
        activeStory.currentPage >
          maximumPage
      ) {
        setData((current) => ({
          ...current,

          stories: current.stories.map(
            (story) =>
              story.id === activeStory.id
                ? {
                    ...story,
                    currentPage: maximumPage,
                  }
                : story,
          ),
        }));
      }

      setIsPaginating(false);
    }
  }

  paginateStory();

  return () => {
    cancelled = true;
  };
}, [
  activeStory?.id,
  activeStory?.text,
  data.settings.fontSize,
  data.settings.lineHeight,
  readerPageSize.width,
  readerPageSize.height,
]);
useEffect(() => {
  function handleKeyDown(event) {
    if (!activeStory || modal) {
      return;
    }

    if (pageTurn) {
      return;
    }

    const element = document.activeElement;
    const isTyping =
      element?.tagName === "INPUT" ||
      element?.tagName === "TEXTAREA" ||
      element?.tagName === "SELECT";

    if (isTyping) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateBackward();
    }

    if (
      event.key === "ArrowRight" && bookOpen
    ) {
      event.preventDefault();
      navigateForward();
    }

    if (event.key === "Home") {
      event.preventDefault();
      goToPage(1);
    }
  }

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [
  activeStory?.id,
  bookOpen,
  modal,
  displayedPage,
  navigationStep,
  pages.length,
  pageTurn,
]);
  const visibleStories = useMemo(() => {
    const filter =
      query.trim().toLowerCase();

    const filteredStories =
      data.stories
        .filter(
          (story) =>
            data.activeFolderId ===
              "all-stories" ||
            story.folderId ===
              data.activeFolderId,
        )
        .filter((story) => {
          if (!filter) {
            return true;
          }

          const searchableContent = [
            story.title,
            story.filename,
            story.author,
            story.description,
            ...(story.tags || []),
            story.text,
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase();

          return searchableContent.includes(
            filter,
          );
        });

    return filteredStories
      .slice()
      .sort((first, second) => {
        const sortMode =
          data.settings.librarySort ||
          "updated-desc";

        if (
          sortMode === "created-desc"
        ) {
          return (
            (second.createdAt || 0) -
            (first.createdAt || 0)
          );
        }
        if (
          sortMode === "opened-desc"
        ) {
          return (
            (second.lastOpenedAt || 0) -
            (first.lastOpenedAt || 0)
          );
        }

        if (
          sortMode === "title-asc"
        ) {
          return first.title.localeCompare(
            second.title,
            undefined,
            {
              sensitivity: "base",
              numeric: true,
            },
          );
        }

        if (
          sortMode === "title-desc"
        ) {
          return second.title.localeCompare(
            first.title,
            undefined,
            {
              sensitivity: "base",
              numeric: true,
            },
          );
        }

        if (
          sortMode ===
          "progress-desc"
        ) {
          return (
            getStoryProgress(second) -
            getStoryProgress(first)
          );
        }

        return (
          (second.updatedAt || 0) -
          (first.updatedAt || 0)
        );
      });
  }, [
    data.stories,
    data.activeFolderId,
    data.settings.librarySort,
    query,
  ]);

  const libraryStatistics =
    useMemo(() => {
      const totalStories =
        data.stories.length;

      const unreadStories =
        data.stories.filter(
          (story) =>
            story.readingStatus ===
            "unread",
        ).length;

      const readingStories =
        data.stories.filter(
          (story) =>
            story.readingStatus ===
            "reading",
        ).length;

      const finishedStories =
        data.stories.filter(
          (story) =>
            story.readingStatus ===
            "finished",
        ).length;

      const totalSessions =
        data.stories.reduce(
          (sum, story) =>
            sum +
            (
              story.readingSessions ||
              0
            ),
          0,
        );

      const totalReadingTime =
        data.stories.reduce(
          (sum, story) =>
            sum +
            (
              story.readingTimeSeconds ||
              0
            ),
          0,
        );

      const totalBookmarks =
        data.stories.reduce(
          (sum, story) =>
            sum +
            (
              story.bookmarks?.length ||
              0
            ),
          0,
        );

      const mostReadStory =
        data.stories
          .slice()
          .sort(
            (first, second) =>
              (
                second.readingTimeSeconds ||
                0
              ) -
              (
                first.readingTimeSeconds ||
                0
              ),
          )[0] || null;

      return {
        totalStories,
        unreadStories,
        readingStories,
        finishedStories,
        totalSessions,
        totalReadingTime,
        totalBookmarks,
        mostReadStory,
      };
    }, [
      data.stories,
    ]);

  function updateStory(storyId, changes) {
    setData((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === storyId ? { ...story, ...changes, updatedAt: Date.now() } : story
      ),
    }));
  }

  function analyseActiveStoryDialogue() {
    if (
      !activeStory?.id ||
      !activeStory.text ||
      dialogueAnalysisRunning
    ) {
      return;
    }

    setDialogueAnalysisRunning(true);
    setDialogueAnalysisError("");

    try {
      const previousAnalysis =
        activeStory.dialogueAnalysis;

      const existingCharacters =
        Array.isArray(
          previousAnalysis?.characters,
        )
          ? previousAnalysis.characters
          : [];

      const rawFreshAnalysis =
        analyseStoryDialogue(
          activeStory.text,
          activeStory.id,
          existingCharacters,
        );

      const characterMerges =
        previousAnalysis
          ?.characterMerges &&
        typeof previousAnalysis
          .characterMerges ===
          "object"
          ? previousAnalysis
              .characterMerges
          : {};

      function resolveMergedCharacterId(
        characterId,
      ) {
        let resolvedId =
          characterId;

        const visitedIds =
          new Set();

        while (
          resolvedId &&
          characterMerges[
            resolvedId
          ] &&
          !visitedIds.has(
            resolvedId,
          )
        ) {
          visitedIds.add(
            resolvedId,
          );

          resolvedId =
            characterMerges[
              resolvedId
            ];
        }

        return resolvedId;
      }

      const freshCharactersById =
        new Map(
          rawFreshAnalysis.characters.map(
            (character) => [
              character.id,
              character,
            ],
          ),
        );

      const redirectedSegments =
        rawFreshAnalysis
          .narrationSegments
          .map((segment) => {
            const resolvedSpeakerId =
              resolveMergedCharacterId(
                segment.speakerId,
              );

            const resolvedDetectedId =
              resolveMergedCharacterId(
                segment
                  .detectedSpeakerId,
              );

            if (
              resolvedSpeakerId ===
                segment.speakerId &&
              resolvedDetectedId ===
                segment
                  .detectedSpeakerId
            ) {
              return segment;
            }

            const resolvedCharacter =
              freshCharactersById.get(
                resolvedSpeakerId,
              ) ||
              existingCharacters.find(
                (character) =>
                  character.id ===
                  resolvedSpeakerId,
              );

            return {
              ...segment,
              speakerId:
                resolvedSpeakerId ||
                null,
              speakerName:
                resolvedCharacter
                  ?.name ||
                segment.speakerName,
              detectedSpeakerId:
                resolvedDetectedId ||
                null,
            };
          });

      const redirectedCharacters =
        rawFreshAnalysis.characters
          .filter(
            (character) =>
              resolveMergedCharacterId(
                character.id,
              ) === character.id,
          );

      existingCharacters.forEach(
        (character) => {
          const resolvedId =
            resolveMergedCharacterId(
              character.id,
            );

          if (
            resolvedId !==
            character.id
          ) {
            return;
          }

          const alreadyIncluded =
            redirectedCharacters.some(
              (candidate) =>
                candidate.id ===
                character.id,
            );

          if (!alreadyIncluded) {
            redirectedCharacters.push(
              character,
            );
          }
        },
      );

      const freshAnalysis = {
        ...rawFreshAnalysis,
        characters:
          redirectedCharacters,
        narrationSegments:
          redirectedSegments,
        characterMerges,
      };

      const previousSegmentsById =
        new Map(
          (
            previousAnalysis
              ?.narrationSegments ||
            []
          ).map((segment) => [
            segment.id,
            segment,
          ]),
        );

      const narrationSegments =
        freshAnalysis.narrationSegments.map(
          (freshSegment) => {
            const previousSegment =
              previousSegmentsById.get(
                freshSegment.id,
              );

            if (
              !previousSegment
                ?.manuallyCorrected
            ) {
              return freshSegment;
            }

            return {
              ...freshSegment,
              type:
                previousSegment.type,
              speakerId:
                previousSegment.speakerId ??
                null,
              speakerName:
                previousSegment.speakerName ??
                null,
              confidence: 1,
              manuallyCorrected: true,
              correctionType:
                previousSegment
                  .correctionType ||
                null,
            };
          },
        );

      const dialogueSegments =
        narrationSegments.filter(
          (segment) =>
            segment.type ===
            "dialogue",
        );

      const narrationCount =
        narrationSegments.filter(
          (segment) =>
            segment.type ===
            "narration",
        ).length;

      const unresolvedCount =
        dialogueSegments.filter(
          (segment) =>
            !segment.speakerId &&
            segment.correctionType !==
              "confirmed-unknown",
        ).length;

      const resolvedCount =
        dialogueSegments.filter(
          (segment) =>
            Boolean(
              segment.speakerId,
            ) ||
            segment.correctionType ===
              "confirmed-unknown",
        ).length;

      const lowConfidenceCount =
        dialogueSegments.filter(
          (segment) =>
            !segment.manuallyCorrected &&
            Number(
              segment.confidence,
            ) < 0.7,
        ).length;

      const mergedAnalysis = {
        ...freshAnalysis,
        narrationSegments,

        statistics: {
          ...freshAnalysis.statistics,
          totalSegments:
            narrationSegments.length,
          narrationSegments:
            narrationCount,
          dialogueSegments:
            dialogueSegments.length,
          resolvedDialogue:
            resolvedCount,
          unresolvedDialogue:
            unresolvedCount,
          lowConfidenceDialogue:
            lowConfidenceCount,
        },
      };

      setData((current) => ({
        ...current,

        stories:
          current.stories.map(
            (story) =>
              story.id ===
              activeStory.id
                ? {
                    ...story,
                    dialogueAnalysis:
                      mergedAnalysis,
                  }
                : story,
          ),
      }));
    } catch (error) {
      console.error(
        "BP could not analyse dialogue.",
        error,
      );

      setDialogueAnalysisError(
        "BP could not analyse this story's dialogue.",
      );
    } finally {
      setDialogueAnalysisRunning(false);
    }
  }

  function beginReadingSession(
    storyId,
  ) {
    if (!storyId) {
      return;
    }

    const now = Date.now();

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) =>
            story.id === storyId
              ? {
                  ...story,
                  lastOpenedAt: now,
                  readingSessions:
                    (
                      story.readingSessions ||
                      0
                    ) + 1,
                }
              : story,
        ),
  }));
  }

  function selectStory(storyId) {
    const story =
      data.stories.find(
        (item) =>
          item.id === storyId,
      );

    setData((current) => ({
      ...current,
      activeStoryId: storyId,
    }));

    const shouldOpenBook =
      (story?.currentPage || 1) > 1;

    setBookOpen(
      shouldOpenBook,
    );

    if (shouldOpenBook) {
      beginReadingSession(
        storyId,
      );
    }
  }

  function goToPage(pageNumber) {
    if (!activeStory) {
      return;
    }

    const next = Math.min(
      Math.max(pageNumber, 1),
      pages.length + 1,
    );

    const finalPage =
      pages.length + 1;

    const automaticStatus =
      next >= finalPage
        ? "finished"
        : next > 1
          ? "reading"
          : activeStory.readingStatus ||
            "unread";

    updateStory(activeStory.id, {
      currentPage: next,
      readingStatus:
        automaticStatus,
    });

    setPageInput("");
    setSelectionMenu(null);
    setBookOpen(next > 1);
  }

  function goToEnteredPage() {
    const requestedPage =
      Number.parseInt(pageInput, 10);

    if (!Number.isFinite(requestedPage)) {
      setPageInput("");
      return;
    }

    const maximumPage =
      pages.length + 1;

    const safePage = Math.min(
      Math.max(requestedPage, 1),
      maximumPage,
    );

    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    setTableOfContentsOpen(false);
    goToPage(safePage);
    setPageInput("");
  }

  function stopNarration() {
    narrationSessionRef.current += 1;
    narrationQueueRef.current = [];
    narrationIndexRef.current = -1;
    narrationUtteranceRef.current = null;
    narrationPageRef.current = null;

    if (
      typeof window !== "undefined" &&
      "speechSynthesis" in window
    ) {
      window.speechSynthesis.cancel();
    }

    setNarrationStatus("idle");
    setNarrationPosition(null);
    setNarrationSpeaker(null);
    setNarrationWordPosition(null);
  }

  function findVoiceForCategory(
    voiceCategory,
    narratorVoice,
  ) {
    if (!voices.length) {
      return null;
    }

    const narratorLanguage =
      narratorVoice?.lang
        ?.split("-")[0]
        ?.toLocaleLowerCase() ||
      "";

    const languageVoices =
      narratorLanguage
        ? voices.filter(
            (voice) =>
              voice.lang
                .toLocaleLowerCase()
                .startsWith(
                  narratorLanguage,
                ),
          )
        : voices.slice();

    const availableVoices =
      languageVoices.length > 0
        ? languageVoices
        : voices;

    const categoryIndexes = {
      "adult-neutral": 0,
      "adult-light": 1,
      "adult-deep": 2,
      "young-neutral": 3,
      "elder-neutral": 4,
      creature: 5,
      synthetic: 6,
    };

    const requestedIndex =
      categoryIndexes[
        voiceCategory
      ] ?? 0;

    return availableVoices[
      requestedIndex %
        availableVoices.length
    ] || narratorVoice || null;
  }

  function speakNarrationItem(
    itemIndex,
    sessionId,
  ) {
    if (
      sessionId !==
      narrationSessionRef.current
    ) {
      return;
    }

    const queue =
      narrationQueueRef.current;

    const item = queue[itemIndex];

    if (!item) {
      narrationIndexRef.current = -1;
      narrationUtteranceRef.current = null;
      narrationPageRef.current = null;
      setNarrationStatus("idle");
      setNarrationPosition(null);
      setNarrationSpeaker(null);
      setNarrationWordPosition(null);
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      setNarrationError(
        "Speech synthesis is not supported by this browser.",
      );

      setNarrationStatus("idle");
      setNarrationPosition(null);
      setNarrationWordPosition(null);

      return;
    }

    narrationIndexRef.current =
      itemIndex;

    const position = {
      blockId:
        item.blockId,

      sentenceId:
        item.sentenceId,

      offset:
        item.startOffset,

      sentenceStartOffset:
        item.sentenceStartOffset ??
        item.startOffset,

      sentenceEndOffset:
        item.sentenceEndOffset ??
        item.endOffset,

      planStartOffset:
        item.startOffset,

      planEndOffset:
        item.endOffset,

      narrationItemId:
        item.id,

      analysisSegmentId:
        item.analysisSegmentId ||
        null,

      pageNumber:
        item.pageNumber,
    };

    setNarrationPosition(position);

    setNarrationSpeaker({
      type:
        item.narrationType ||
        "narration",
      speakerId:
        item.speakerId ||
        null,
      speakerName:
        item.speakerName ||
        "Narrator",
      voiceCategory:
        item.voiceCategory ||
        "narrator",
      preferredVoiceId:
        item.preferredVoiceId ||
        null,
    });

    setNarrationWordPosition(null);

    if (activeStory?.id) {
      updateStory(activeStory.id, {
        narrationPosition: position,
      });
    }

    if (
      item.pageNumber &&
      item.pageNumber !==
        narrationPageRef.current
    ) {
      narrationPageRef.current =
        item.pageNumber;

      setBookOpen(true);
      goToPage(item.pageNumber);
    }

    const utterance =
      new SpeechSynthesisUtterance(
        item.text,
      );

    const narratorVoice =
      voices.find(
        (voice) =>
          voice.voiceURI ===
          selectedVoiceId,
      ) || null;

    const explicitCharacterVoice =
      item.narrationType ===
        "dialogue" &&
      item.preferredVoiceId
        ? voices.find(
            (voice) =>
              voice.voiceURI ===
              item.preferredVoiceId,
          ) || null
        : null;

    const categoryVoice =
      item.narrationType ===
        "dialogue" &&
      !explicitCharacterVoice &&
      item.speakerId
        ? findVoiceForCategory(
            item.voiceCategory,
            narratorVoice,
          )
        : null;

    const selectedVoice =
      explicitCharacterVoice ||
      categoryVoice ||
      narratorVoice;

    if (selectedVoice) {
      utterance.voice =
        selectedVoice;

      utterance.lang =
        selectedVoice.lang;
    }

    utterance.rate = narrationRate;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onboundary = (event) => {
      if (
        sessionId !==
        narrationSessionRef.current
      ) {
        return;
      }

      if (
        event.name &&
        event.name !== "word"
      ) {
        return;
      }

      const wordRange = findWordRange(
        item.text,
        event.charIndex,
        event.charLength || 0,
      );

      if (!wordRange) {
        return;
      }

      setNarrationWordPosition({
        blockId: item.blockId,
        sentenceId: item.sentenceId,
        startOffset:
          item.startOffset +
          wordRange.startOffset,
        endOffset:
          item.startOffset +
          wordRange.endOffset,
      });
    };

    utterance.onend = () => {
      if (
        sessionId !==
        narrationSessionRef.current
      ) {
        return;
      }

      setNarrationWordPosition(null);

      speakNarrationItem(
        itemIndex + 1,
        sessionId,
      );
    };

    utterance.onerror = (event) => {
      if (
        sessionId !==
        narrationSessionRef.current
      ) {
        return;
      }

      if (
        event.error === "canceled" ||
        event.error === "interrupted"
      ) {
        return;
      }

      narrationIndexRef.current = -1;
      narrationUtteranceRef.current = null;
      narrationPageRef.current = null;

      setNarrationError(
        `Narration stopped: ${
          event.error || "unknown error"
        }.`,
      );

      setNarrationStatus("idle");
      setNarrationPosition(null);
      setNarrationSpeaker(null);
      setNarrationWordPosition(null);
    };

    narrationUtteranceRef.current =
      utterance;

    window.speechSynthesis.speak(
      utterance,
    );
  }

  function startNarration() {
    if (
      !activeStory ||
      !activeStory.text
    ) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      setNarrationError(
        "Speech synthesis is not supported by this browser.",
      );

      return;
    }

    setNarrationError("");

    const queue = createNarrationQueue(
      activeStory.text,
      pages,
      activeStory.dialogueAnalysis,
    );

    if (!queue.length) {
      setNarrationError(
        "No narratable text was found.",
      );

      return;
    }

    let startIndex = 0;

    const requestedPosition =
      activeStory.narrationPosition ||
      narrationPosition ||
      activeStory.readingPosition;

    if (requestedPosition?.blockId) {
      const matchingIndex =
        findNarrationQueueIndex(
          queue,
          requestedPosition,
        );

      if (matchingIndex >= 0) {
        startIndex = matchingIndex;
      }
    } else if (currentPage > 1) {
      const visibleIndex =
        queue.findIndex(
          (item) =>
            isMobileLayout
              ? item.pageNumber ===
                currentPage
              : (
                  item.pageNumber ===
                    displayedPage ||
                  item.pageNumber ===
                    displayedPage + 1
                ),
        );

      if (visibleIndex >= 0) {
        startIndex = visibleIndex;
      }
    }

    narrationSessionRef.current += 1;

    const sessionId =
      narrationSessionRef.current;

    window.speechSynthesis.cancel();

    narrationQueueRef.current = queue;
    narrationIndexRef.current =
      startIndex;
    narrationUtteranceRef.current = null;
    narrationPageRef.current = null;

    setSelectedPosition(null);
    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    setNarrationStatus("playing");

    speakNarrationItem(
      startIndex,
      sessionId,
    );
  }

  function pauseNarration() {
    if (
      narrationStatus !== "playing" ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    window.speechSynthesis.pause();
    setNarrationStatus("paused");
  }

  function resumeNarration() {
    if (
      narrationStatus !== "paused" ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    window.speechSynthesis.resume();
    setNarrationStatus("playing");
  }

  function toggleNarration() {
    if (narrationStatus === "playing") {
      pauseNarration();
      return;
    }

    if (narrationStatus === "paused") {
      resumeNarration();
      return;
    }

    startNarration();
  }

  function narrateFromSelection() {
    if (!selectedPosition) {
      return;
    }

    stopNarration();
    setSelectionMenu(null);

    const queue = createNarrationQueue(
      activeStory?.text || "",
      pages,
      activeStory?.dialogueAnalysis,
    );

    const startIndex =
      findNarrationQueueIndex(
        queue,
        selectedPosition,
      );

    if (startIndex < 0) {
      setNarrationError(
        "The selected sentence could not be found.",
      );

      return;
    }

    narrationSessionRef.current += 1;

    const sessionId =
      narrationSessionRef.current;

    narrationQueueRef.current = queue;
    narrationIndexRef.current =
      startIndex;
    narrationUtteranceRef.current = null;
    narrationPageRef.current = null;

    setNarrationWordPosition(null);
    setNarrationStatus("playing");
    setNarrationError("");

    speakNarrationItem(
      startIndex,
      sessionId,
    );
  }

  function jumpNarrationBy(amount) {
    if (
      !activeStory?.text ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    let queue =
      narrationQueueRef.current;

    if (!queue.length) {
      queue = createNarrationQueue(
        activeStory.text,
        pages,
        activeStory.dialogueAnalysis,
      );

      narrationQueueRef.current = queue;
    }

    if (!queue.length) {
      return;
    }

    let currentIndex =
      narrationIndexRef.current;

    if (currentIndex < 0) {
      const savedPosition =
        activeStory.narrationPosition ||
        narrationPosition ||
        activeStory.readingPosition;

      if (savedPosition?.blockId) {
        currentIndex =
          findNarrationQueueIndex(
            queue,
            savedPosition,
          );
      }
    }

    if (currentIndex < 0) {
      currentIndex = 0;
    }

    const targetIndex = Math.min(
      Math.max(
        currentIndex + amount,
        0,
      ),
      queue.length - 1,
    );

    narrationSessionRef.current += 1;

    const sessionId =
      narrationSessionRef.current;

    window.speechSynthesis.cancel();

    narrationIndexRef.current =
      targetIndex;
    narrationUtteranceRef.current = null;
    narrationPageRef.current = null;

    setSelectedPosition(null);
    setSelectionMenu(null);
    setNarrationWordPosition(null);
    setNarrationError("");
    setNarrationStatus("playing");

    speakNarrationItem(
      targetIndex,
      sessionId,
    );
  }

  function narratePreviousSentence() {
    jumpNarrationBy(-1);
  }

  function narrateNextSentence() {
    jumpNarrationBy(1);
  }

  function restartNarration() {
    if (
      !activeStory?.text ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    stopNarration();

    const queue = createNarrationQueue(
      activeStory.text,
      pages,
      activeStory.dialogueAnalysis,
    );

    if (!queue.length) {
      setNarrationError(
        "No narratable text was found.",
      );

      return;
    }

    narrationSessionRef.current += 1;

    const sessionId =
      narrationSessionRef.current;

    narrationQueueRef.current = queue;
    narrationIndexRef.current = 0;
    narrationUtteranceRef.current = null;
    narrationPageRef.current = null;

    setSelectedPosition(null);
    setSelectionMenu(null);
    setNarrationWordPosition(null);
    setNarrationError("");
    setNarrationStatus("playing");

    speakNarrationItem(
      0,
      sessionId,
    );
  }

  function returnToNarrationPosition() {
    const savedPosition =
      narrationPosition ||
      activeStory?.narrationPosition;

    if (!savedPosition) {
      return;
    }

    const pageIndex =
      findPageForPosition(
        pages,
        savedPosition,
      );

    if (pageIndex < 0) {
      setNarrationError(
        "The saved narration position could not be found.",
      );

      return;
    }

    const pageNumber =
      pageIndex + 2;

    setBookOpen(true);
    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    goToPage(pageNumber);
  }

  function navigateBackward() {
    if (pageTurn) {
      return;
    }

    if (displayedPage <= 2) {
      goToPage(1);
      return;
    }

    const targetPage =
      displayedPage - navigationStep;

    if (prefersReducedMotion) {
      goToPage(targetPage);
      return;
    }

    const outgoingPageIndex =
      displayedPage - 2;

    setPageTurn({
      key: `backward-${Date.now()}`,
      direction: "backward",
      page:
        pages[outgoingPageIndex] || null,
      pageNumber: displayedPage,
    });

    goToPage(targetPage);
  }

  function navigateForward() {
    if (pageTurn) {
      return;
    }

    const finalPage =
      pages.length + 1;

    const canMoveForward =
      isMobileLayout
        ? displayedPage < finalPage
        : displayedPage + 1 < finalPage;

    if (!canMoveForward) {
      return;
    }

    const targetPage =
      displayedPage + navigationStep;

    if (prefersReducedMotion) {
      goToPage(targetPage);
      return;
    }

    const outgoingPageIndex =
      isMobileLayout
        ? displayedPage - 2
        : displayedPage - 1;

    const outgoingPageNumber =
      isMobileLayout
        ? displayedPage
        : displayedPage + 1;

    setPageTurn({
      key: `forward-${Date.now()}`,
      direction: "forward",
      page:
        pages[outgoingPageIndex] || null,
      pageNumber:
        outgoingPageNumber,
    });

    goToPage(targetPage);
  }

  function handleReaderTouchStart(event) {
  if (pageTurn) {
    setTouchGesture(null);
    return;
  }

  if (event.touches.length !== 1) {
      setTouchGesture(null);
      return;
    }

    const touch = event.touches[0];

    setTouchGesture({
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
      startedAt: Date.now(),
    });
  }

  function handleReaderTouchMove(event) {
    if (
      !touchGesture ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];

    setTouchGesture((current) =>
      current
        ? {
            ...current,
            currentX: touch.clientX,
            currentY: touch.clientY,
          }
        : null,
    );
  }

  function handleReaderTouchEnd(event) {
    if (!touchGesture) {
      return;
    }

    const changedTouch =
      event.changedTouches[0];

    const endX =
      changedTouch?.clientX ??
      touchGesture.currentX;

    const endY =
      changedTouch?.clientY ??
      touchGesture.currentY;

    const horizontalDistance =
      endX - touchGesture.startX;

    const verticalDistance =
      endY - touchGesture.startY;

    const duration =
      Date.now() - touchGesture.startedAt;

    setTouchGesture(null);

    const isHorizontalGesture =
      Math.abs(horizontalDistance) >
      Math.abs(verticalDistance) * 1.25;

    const isSwipe =
      isHorizontalGesture &&
      Math.abs(horizontalDistance) >= 55 &&
      duration <= 700;

    if (!isSwipe) {
      return;
    }

    if (horizontalDistance < 0) {
      navigateForward();
    } else {
      navigateBackward();
    }
  }

  function cancelReaderTouch() {
    setTouchGesture(null);
  }

  function selectSentence(
    sentence,
    pageNumber,
    menuPosition,
  ) {
    if (!activeStory || !sentence) {
      return;
    }

    const position = {
      blockId: sentence.blockId,
      sentenceId: sentence.sentenceId,
      offset: sentence.startOffset,
      sentenceStartOffset:
        sentence.sentenceStartOffset,
      sentenceEndOffset:
        sentence.sentenceEndOffset,
      pageNumber,
      segmentId: sentence.id,
    };

    setSelectedPosition(position);

    setSelectionMenu({
      x: menuPosition?.x || 0,
      y: menuPosition?.y || 0,
    });
  }

  function setSelectedAsReadingPosition() {
  if (
    !activeStory ||
    !selectedPosition
  ) {
    return;
  }

  updateStory(activeStory.id, {
    currentPage:
      selectedPosition.pageNumber,
    readingPosition:
      selectedPosition,
  });

  setSelectionMenu(null);
  }

  function clearSentenceSelection() {
    setSelectedPosition(null);
    setSelectionMenu(null);
  }

  function addBookmarkFromSelection() {
    if (
      !activeStory ||
      !selectedPosition
    ) {
      return;
    }

    const selectedText = getPositionText(
      pages,
      selectedPosition,
    );

    const defaultLabel =
      selectedText.length > 55
        ? `${selectedText.slice(0, 55).trim()}...`
        : selectedText.trim() ||
          `Page ${selectedPosition.pageNumber}`;

    const bookmark = {
      id: uid("bookmark"),
      label: defaultLabel,
      blockId: selectedPosition.blockId,
      sentenceId:
        selectedPosition.sentenceId || null,
      offset: selectedPosition.offset,
      sentenceStartOffset:
        selectedPosition.sentenceStartOffset,
      sentenceEndOffset:
        selectedPosition.sentenceEndOffset,
      pageNumber:
        selectedPosition.pageNumber,
      createdAt: Date.now(),
    };

    updateStory(activeStory.id, {
      bookmarks: [
        ...(activeStory.bookmarks || []),
        bookmark,
      ],
    });

    setSelectionMenu(null);
  }

  function returnToReadingPosition() {
    if (!activeStory?.readingPosition) {
      return;
    }

    const pageIndex = findPageForPosition(
      pages,
      activeStory.readingPosition,
    );

    if (pageIndex < 0) {
      return;
    }

    const pageNumber = pageIndex + 2;

    setSelectedPosition(
      activeStory.readingPosition,
    );

    setBookOpen(true);
    goToPage(pageNumber);
  }

  function goToBookmark(bookmark) {
    if (!bookmark) {
      return;
    }

    const pageIndex = findPageForPosition(
      pages,
      bookmark,
    );

    if (pageIndex < 0) {
      return;
    }

    const restoredPosition = {
      blockId: bookmark.blockId,
      sentenceId:
        bookmark.sentenceId || null,
      offset: bookmark.offset,
      sentenceStartOffset:
        bookmark.sentenceStartOffset,
      sentenceEndOffset:
        bookmark.sentenceEndOffset,
      pageNumber: pageIndex + 2,
      bookmarkId: bookmark.id,
    };

    setSelectedPosition(restoredPosition);
    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    setBookOpen(true);
    goToPage(pageIndex + 2);
  }

  function beginRenamingBookmark(bookmark) {
    setBookmarkBeingRenamed(bookmark.id);
    setBookmarkName(bookmark.label);
  }

  function saveBookmarkName() {
    if (
      !activeStory ||
      !bookmarkBeingRenamed
    ) {
      return;
    }

    const nextName = bookmarkName.trim();

    if (!nextName) {
      return;
    }

    updateStory(activeStory.id, {
      bookmarks: (
        activeStory.bookmarks || []
      ).map((bookmark) =>
        bookmark.id === bookmarkBeingRenamed
          ? {
              ...bookmark,
              label: nextName,
            }
          : bookmark,
      ),
    });

    setBookmarkBeingRenamed(null);
    setBookmarkName("");
  }

  function deleteBookmark(bookmarkId) {
  if (!activeStory) {
    return;
  }

  updateStory(activeStory.id, {
    bookmarks: (
      activeStory.bookmarks || []
    ).filter(
      (bookmark) =>
        bookmark.id !== bookmarkId,
    ),
  });

  if (
    bookmarkBeingRenamed === bookmarkId
  ) {
    setBookmarkBeingRenamed(null);
    setBookmarkName("");
  }
  } 

  function createDialogueStatistics(
    narrationSegments,
  ) {
    const safeSegments =
      Array.isArray(
        narrationSegments,
      )
        ? narrationSegments
        : [];

    const dialogueSegments =
      safeSegments.filter(
        (segment) =>
          segment.type ===
          "dialogue",
      );

    const narrationCount =
      safeSegments.filter(
        (segment) =>
          segment.type ===
          "narration",
      ).length;

    const unresolvedCount =
      dialogueSegments.filter(
        (segment) =>
          !segment.speakerId &&
          segment.correctionType !==
            "confirmed-unknown",
      ).length;

    const resolvedCount =
      dialogueSegments.filter(
        (segment) =>
          Boolean(
            segment.speakerId,
          ) ||
          segment.correctionType ===
            "confirmed-unknown",
      ).length;

    const lowConfidenceCount =
      dialogueSegments.filter(
        (segment) =>
          !segment.manuallyCorrected &&
          Number(
            segment.confidence,
          ) < 0.7,
      ).length;

    return {
      totalSegments:
        safeSegments.length,
      narrationSegments:
        narrationCount,
      dialogueSegments:
        dialogueSegments.length,
      resolvedDialogue:
        resolvedCount,
      unresolvedDialogue:
        unresolvedCount,
      lowConfidenceDialogue:
        lowConfidenceCount,
    };
  }

  function correctDialogueSegment(
    segmentId,
    correction,
  ) {
    if (
      !activeStory?.id ||
      !segmentId ||
      !correction
    ) {
      return;
    }

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (
              !analysis ||
              !Array.isArray(
                analysis.narrationSegments,
              )
            ) {
              return story;
            }

            const characters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters
                : [];

            const selectedCharacter =
              correction.speakerId
                ? characters.find(
                    (character) =>
                      character.id ===
                      correction.speakerId,
                  )
                : null;

            const narrationSegments =
              analysis.narrationSegments.map(
                (segment) => {
                  if (
                    segment.id !==
                    segmentId
                  ) {
                    return segment;
                  }

                  if (
                    correction.type ===
                    "narration"
                  ) {
                    return {
                      ...segment,
                      automaticType:
                        segment.automaticType ??
                        segment.type,
                      automaticSpeakerId:
                        segment.automaticSpeakerId ??
                        segment.detectedSpeakerId ??
                        segment.speakerId ??
                        null,
                      automaticSpeakerName:
                        segment.automaticSpeakerName ??
                        segment.speakerName ??
                        null,
                      automaticConfidence:
                        segment.automaticConfidence ??
                        segment.confidence ??
                        0.25,
                      type: "narration",
                      speakerId: null,
                      speakerName: null,
                      confidence: 1,
                      manuallyCorrected: true,
                      correctionType:
                        "narration",
                    };
                  }

                  if (
                    correction.type ===
                    "unknown"
                  ) {
                    return {
                      ...segment,
                      automaticType:
                        segment.automaticType ??
                        segment.type,
                      automaticSpeakerId:
                        segment.automaticSpeakerId ??
                        segment.detectedSpeakerId ??
                        segment.speakerId ??
                        null,
                      automaticSpeakerName:
                        segment.automaticSpeakerName ??
                        segment.speakerName ??
                        null,
                      automaticConfidence:
                        segment.automaticConfidence ??
                        segment.confidence ??
                        0.25,
                      type: "dialogue",
                      speakerId: null,
                      speakerName:
                        "Unknown speaker",
                      confidence: 1,
                      manuallyCorrected: true,
                      correctionType:
                        "confirmed-unknown",
                    };
                  }

                  if (
                    correction.type ===
                      "speaker" &&
                    correction.speakerId &&
                    selectedCharacter
                  ) {
                    return {
                      ...segment,
                      automaticType:
                        segment.automaticType ??
                        segment.type,
                      automaticSpeakerId:
                        segment.automaticSpeakerId ??
                        segment.detectedSpeakerId ??
                        segment.speakerId ??
                        null,
                      automaticSpeakerName:
                        segment.automaticSpeakerName ??
                        segment.speakerName ??
                        null,
                      automaticConfidence:
                        segment.automaticConfidence ??
                        segment.confidence ??
                        0.25,
                      type: "dialogue",
                      speakerId:
                        selectedCharacter.id,
                      speakerName:
                        selectedCharacter.name,
                      confidence: 1,
                      manuallyCorrected: true,
                      correctionType:
                        "speaker-assignment",
                    };
                  }

                  return segment;
                },
              );

            const dialogueSegments =
              narrationSegments.filter(
                (segment) =>
                  segment.type ===
                  "dialogue",
              );

            const narrationCount =
              narrationSegments.filter(
                (segment) =>
                  segment.type ===
                  "narration",
              ).length;

            const unresolvedCount =
              dialogueSegments.filter(
                (segment) =>
                  !segment.speakerId &&
                  segment.correctionType !==
                    "confirmed-unknown",
              ).length;

            const resolvedCount =
              dialogueSegments.filter(
                (segment) =>
                  Boolean(
                    segment.speakerId,
                  ) ||
                  segment.correctionType ===
                    "confirmed-unknown",
              ).length;

            const lowConfidenceCount =
              dialogueSegments.filter(
                (segment) =>
                  !segment.manuallyCorrected &&
                  Number(
                    segment.confidence,
                  ) < 0.7,
              ).length;

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,
                narrationSegments,

                statistics: {
                  ...analysis.statistics,
                  totalSegments:
                    narrationSegments.length,
                  narrationSegments:
                    narrationCount,
                  dialogueSegments:
                    dialogueSegments.length,
                  resolvedDialogue:
                    resolvedCount,
                  unresolvedDialogue:
                    unresolvedCount,
                  lowConfidenceDialogue:
                    lowConfidenceCount,
                },
              },
            };
          },
        ),
    }));

    setDialogueEditingSegmentId(
      null,
    );
  }

  function previewCharacterVoice() {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      setDialogueAnalysisError(
        "Speech synthesis is not supported by this browser.",
      );

      return;
    }

    const characterName =
      characterDraftName.trim() ||
      "This character";

    const previewText =
      `${characterName} will use this voice for dialogue.`;

    const utterance =
      new SpeechSynthesisUtterance(
        previewText,
      );

    const selectedCharacterVoice =
      voices.find(
        (voice) =>
          voice.voiceURI ===
          characterDraftVoiceId,
      );

    const narratorVoice =
      voices.find(
        (voice) =>
          voice.voiceURI ===
          selectedVoiceId,
      );

    const previewVoice =
      selectedCharacterVoice ||
      narratorVoice;

    if (previewVoice) {
      utterance.voice =
        previewVoice;

      utterance.lang =
        previewVoice.lang;
    }

    utterance.rate =
      narrationRate;

    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(
      utterance,
    );
  }

  function openCharacterEditor(
    character,
  ) {
    if (!character?.id) {
      return;
    }

    setCharacterEditingId(
      character.id,
    );

    setCharacterDeleteCandidateId(
      null,
    );

    setCharacterMergeTargetId("");
    setCharacterMergeConfirmation(
      false,
    );

    setCharacterDraftName(
      character.name || "",
    );

    setCharacterDraftAliases(
      Array.isArray(
        character.aliases,
      )
        ? character.aliases.join(", ")
        : "",
    );

    setCharacterDraftRole(
      character.role || "minor",
    );

    setCharacterDraftLocked(
      character.locked === true,
    );

    setCharacterDraftTemporary(
      character.temporary === true,
    );

    setCharacterDraftVoiceCategory(
      character.voiceCategory ||
        "adult-neutral",
    );

    setCharacterDraftVoiceId(
      character.preferredVoiceId ||
        "",
    );

    setCharacterDraftNotes(
      character.notes || "",
    );

    setDialogueAnalysisError("");
  }

  function closeCharacterEditor() {
    setCharacterEditingId(null);
    setCharacterDeleteCandidateId(
      null,
    );
    setCharacterMergeTargetId("");
    setCharacterMergeConfirmation(
      false,
    );
    setCharacterDraftName("");
    setCharacterDraftAliases("");
    setCharacterDraftRole("minor");
    setCharacterDraftLocked(false);
    setCharacterDraftTemporary(false);
    setCharacterDraftVoiceCategory(
      "adult-neutral",
    );
    setCharacterDraftVoiceId("");
    setCharacterDraftNotes("");
    setDialogueAnalysisError("");
  }

  function saveCharacterProfile() {
    if (
      !activeStory?.id ||
      !characterEditingId
    ) {
      return;
    }

    const nextName =
      characterDraftName.trim();

    if (!nextName) {
      setDialogueAnalysisError(
        "A character name is required.",
      );

      return;
    }

    const duplicateCharacter =
      dialogueCharacters.find(
        (character) =>
          character.id !==
            characterEditingId &&
          String(
            character.name || "",
          )
            .trim()
            .toLocaleLowerCase() ===
            nextName.toLocaleLowerCase(),
      );

    if (duplicateCharacter) {
      setDialogueAnalysisError(
        "Another character already uses that name.",
      );

      return;
    }

    const aliases = [
      ...new Set(
        characterDraftAliases
          .split(",")
          .map((alias) =>
            alias.trim(),
          )
          .filter(Boolean),
      ),
    ].slice(0, 20);

    const now = Date.now();

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (!analysis) {
              return story;
            }

            const characters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters.map(
                    (character) =>
                      character.id ===
                      characterEditingId
                        ? {
                            ...character,
                            name: nextName,
                            aliases,
                            role:
                              characterDraftRole,
                            locked:
                              characterDraftLocked,
                            temporary:
                              characterDraftTemporary,
                            voiceCategory:
                              characterDraftVoiceCategory,
                            preferredVoiceId:
                              characterDraftVoiceId ||
                              null,
                            notes:
                              characterDraftNotes.trim(),
                            updatedAt: now,
                          }
                        : character,
                  )
                : [];

            const narrationSegments =
              Array.isArray(
                analysis.narrationSegments,
              )
                ? analysis.narrationSegments.map(
                    (segment) =>
                      segment.speakerId ===
                      characterEditingId
                        ? {
                            ...segment,
                            speakerName:
                              nextName,
                          }
                        : segment,
                  )
                : [];

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,
                characters,
                narrationSegments,
              },
            };
          },
        ),
    }));

    closeCharacterEditor();
    }

  function getStrongerCharacterRole(
    firstRole,
    secondRole,
  ) {
    const roleRanks = {
      background: 1,
      minor: 2,
      major: 3,
    };

    const safeFirstRole =
      roleRanks[firstRole]
        ? firstRole
        : "minor";
    const safeSecondRole =
      roleRanks[secondRole]
        ? secondRole
        : "minor";

    return roleRanks[safeFirstRole] >=
      roleRanks[safeSecondRole]
      ? safeFirstRole
      : safeSecondRole;
  }

  function mergeCharacterProfiles(
    sourceCharacterId,
    targetCharacterId,
  ) {
    if (
      !activeStory?.id ||
      !sourceCharacterId ||
      !targetCharacterId ||
      sourceCharacterId ===
        targetCharacterId
    ) {
      return;
    }

    const sourceCharacter =
      dialogueCharacters.find(
        (character) =>
          character.id ===
          sourceCharacterId,
      );

    const targetCharacter =
      dialogueCharacters.find(
        (character) =>
          character.id ===
          targetCharacterId,
      );

    if (
      !sourceCharacter ||
      !targetCharacter
    ) {
      setDialogueAnalysisError(
        "One of the selected character profiles could not be found.",
      );

      return;
    }

    if (sourceCharacter.locked) {
      setDialogueAnalysisError(
        "Locked profiles cannot be merged. Unlock and save the source profile first.",
      );

      return;
    }

    const now = Date.now();

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (!analysis) {
              return story;
            }

            const currentCharacters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters
                : [];

            const source =
              currentCharacters.find(
                (character) =>
                  character.id ===
                  sourceCharacterId,
              );

            const target =
              currentCharacters.find(
                (character) =>
                  character.id ===
                  targetCharacterId,
              );

            if (!source || !target) {
              return story;
            }

            const aliasCandidates = [
              target.name,
              ...(target.aliases || []),
              source.name,
              ...(source.aliases || []),
            ];

            const combinedAliases = [];

            aliasCandidates.forEach(
              (alias) => {
                const cleanedAlias =
                  String(
                    alias || "",
                  ).trim();

                if (!cleanedAlias) {
                  return;
                }

                if (
                  cleanedAlias.toLocaleLowerCase() ===
                  String(
                    target.name || "",
                  ).toLocaleLowerCase()
                ) {
                  return;
                }

                const alreadyExists =
                  combinedAliases.some(
                    (existingAlias) =>
                      existingAlias.toLocaleLowerCase() ===
                      cleanedAlias.toLocaleLowerCase(),
                  );

                if (
                  !alreadyExists &&
                  combinedAliases.length < 20
                ) {
                  combinedAliases.push(
                    cleanedAlias,
                  );
                }
              },
            );

            const noteCandidates = [
              target.notes,
              source.notes,
            ]
              .map((note) =>
                String(
                  note || "",
                ).trim(),
              )
              .filter(Boolean);

            const uniqueNotes = [];

            noteCandidates.forEach(
              (note) => {
                if (
                  !uniqueNotes.includes(
                    note,
                  )
                ) {
                  uniqueNotes.push(
                    note,
                  );
                }
              },
            );

            const mergedTarget = {
              ...target,
              aliases:
                combinedAliases,
              role:
                getStrongerCharacterRole(
                  target.role,
                  source.role,
                ),
              locked:
                target.locked === true ||
                source.locked === true,
              temporary:
                target.temporary === true &&
                source.temporary === true,
              voiceCategory:
                target.voiceCategory ||
                source.voiceCategory ||
                "adult-neutral",
              preferredVoiceId:
                target.preferredVoiceId ||
                source.preferredVoiceId ||
                null,
              notes:
                uniqueNotes.join(
                  "\n\n",
                ),
              updatedAt: now,
            };

            const characters =
              currentCharacters
                .filter(
                  (character) =>
                    character.id !==
                    sourceCharacterId,
                )
                .map((character) =>
                  character.id ===
                  targetCharacterId
                    ? mergedTarget
                    : character,
                );

            const currentSegments =
              Array.isArray(
                analysis.narrationSegments,
              )
                ? analysis.narrationSegments
                : [];

            const narrationSegments =
              currentSegments.map(
                (segment) => {
                  const speakerWasSource =
                    segment.speakerId ===
                    sourceCharacterId;

                  const detectedWasSource =
                    segment
                      .detectedSpeakerId ===
                    sourceCharacterId;

                  const automaticWasSource =
                    segment
                      .automaticSpeakerId ===
                    sourceCharacterId;

                  if (
                    !speakerWasSource &&
                    !detectedWasSource &&
                    !automaticWasSource
                  ) {
                    return segment;
                  }

                  return {
                    ...segment,

                    speakerId:
                      speakerWasSource
                        ? targetCharacterId
                        : segment.speakerId,

                    speakerName:
                      speakerWasSource
                        ? mergedTarget.name
                        : segment.speakerName,

                    detectedSpeakerId:
                      detectedWasSource
                        ? targetCharacterId
                        : segment
                            .detectedSpeakerId,

                    automaticSpeakerId:
                      automaticWasSource
                        ? targetCharacterId
                        : segment
                            .automaticSpeakerId,

                    automaticSpeakerName:
                      automaticWasSource
                        ? mergedTarget.name
                        : segment
                            .automaticSpeakerName,
                  };
                },
              );

            const existingMerges =
              analysis.characterMerges &&
              typeof analysis
                .characterMerges ===
                "object"
                ? analysis.characterMerges
                : {};

            const characterMerges = {
            ...existingMerges,
            [sourceCharacterId]:
              targetCharacterId,
          };

            Object.keys(
              characterMerges,
            ).forEach(
              (mergedCharacterId) => {
                if (
                  characterMerges[
                    mergedCharacterId
                  ] === sourceCharacterId
                ) {
                  characterMerges[
                    mergedCharacterId
                  ] = targetCharacterId;
                }
              },
            );

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,
                characters,
                narrationSegments,
                characterMerges,

                statistics:
                  createDialogueStatistics(
                    narrationSegments,
                  ),
              },
            };
          },
        ),
    }));

    closeCharacterEditor();
    setDialogueAnalysisError("");
  }

  function deleteCharacterProfile(
    characterId,
  ) {
    if (
      !activeStory?.id ||
      !characterId
    ) {
      return;
    }

    const character =
      dialogueCharacters.find(
        (item) =>
          item.id === characterId,
      );

    if (!character) {
      setDialogueAnalysisError(
        "The selected character could not be found.",
      );

      return;
    }

    if (character.locked) {
      setDialogueAnalysisError(
        "Locked character profiles cannot be deleted. Unlock the profile first.",
      );

      setCharacterDeleteCandidateId(
        null,
      );

      return;
    }

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (!analysis) {
              return story;
            }

            const characters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters.filter(
                    (existingCharacter) =>
                      existingCharacter.id !==
                      characterId,
                  )
                : [];

            const narrationSegments =
              Array.isArray(
                analysis.narrationSegments,
              )
                ? analysis.narrationSegments.map(
                    (segment) => {
                      if (
                        segment.speakerId !==
                        characterId
                      ) {
                        return segment;
                      }

                      return {
                        ...segment,
                        speakerId: null,
                        speakerName: null,
                        confidence: 0.25,
                        manuallyCorrected:
                          false,
                        correctionType: null,
                      };
                    },
                  )
                : [];

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,
                characters,
                narrationSegments,

                statistics:
                  createDialogueStatistics(
                    narrationSegments,
                  ),
              },
            };
          },
        ),
    }));

    setCharacterDeleteCandidateId(
      null,
    );

    setCharacterEditingId(null);
    setDialogueAnalysisError("");
  }

  function createDialogueCharacter(
    segmentId,
  ) {
    if (
      !activeStory?.id ||
      !segmentId
    ) {
      return;
    }

    const characterName =
      dialogueNewCharacterName.trim();

    if (!characterName) {
      return;
    }

    const existingNames =
      dialogueCharacters.map(
        (character) =>
          String(
            character.name || "",
          ).toLocaleLowerCase(),
      );

    if (
      existingNames.includes(
        characterName.toLocaleLowerCase(),
      )
    ) {
      setDialogueAnalysisError(
        "A character with that name already exists. Select the existing character instead.",
      );

      return;
    }

    const characterId =
      uid("character");

    const now = Date.now();

    const newCharacter = {
      id: characterId,
      name: characterName,
      aliases: [],
      role: "minor",
      locked: false,
      temporary: false,
      voiceCategory:
        "adult-neutral",
      preferredVoiceId: null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (
              !analysis ||
              !Array.isArray(
                analysis.narrationSegments,
              )
            ) {
              return story;
            }

            const existingCharacters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters
                : [];

            const narrationSegments =
              analysis.narrationSegments.map(
                (segment) => {
                  if (
                    segment.id !==
                    segmentId
                  ) {
                    return segment;
                  }

                  return {
                    ...segment,
                    automaticType:
                      segment.automaticType ??
                      segment.type,
                    automaticSpeakerId:
                      segment.automaticSpeakerId ??
                      segment.detectedSpeakerId ??
                      segment.speakerId ??
                      null,
                    automaticSpeakerName:
                      segment.automaticSpeakerName ??
                      segment.speakerName ??
                      null,
                    automaticConfidence:
                      segment.automaticConfidence ??
                      segment.confidence ??
                      0.25,
                    type: "dialogue",
                    speakerId:
                      characterId,
                    speakerName:
                      characterName,
                    confidence: 1,
                    manuallyCorrected: true,
                    correctionType:
                      "speaker-assignment",
                  };
                },
              );

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,

                characters: [
                  ...existingCharacters,
                  newCharacter,
                ],

                narrationSegments,

                statistics:
                  createDialogueStatistics(
                    narrationSegments,
                  ),
              },
            };
          },
        ),
    }));

    setDialogueNewCharacterName("");
    setDialogueEditingSegmentId(null);
    setDialogueAnalysisError("");
  }

  function revertDialogueCorrection(
    segmentId,
  ) {
    if (
      !activeStory?.id ||
      !segmentId
    ) {
      return;
    }

    setData((current) => ({
      ...current,

      stories:
        current.stories.map(
          (story) => {
            if (
              story.id !==
              activeStory.id
            ) {
              return story;
            }

            const analysis =
              story.dialogueAnalysis;

            if (
              !analysis ||
              !Array.isArray(
                analysis.narrationSegments,
              )
            ) {
              return story;
            }

            const characters =
              Array.isArray(
                analysis.characters,
              )
                ? analysis.characters
                : [];

            const narrationSegments =
              analysis.narrationSegments.map(
                (segment) => {
                  if (
                    segment.id !==
                    segmentId
                  ) {
                    return segment;
                  }

                  const restoredSpeakerId =
                    segment
                      .automaticSpeakerId ??
                    segment
                      .detectedSpeakerId ??
                    null;

                  const restoredCharacter =
                    restoredSpeakerId
                      ? characters.find(
                          (character) =>
                            character.id ===
                            restoredSpeakerId,
                        )
                      : null;

                  return {
                    ...segment,
                    type:
                      segment
                        .automaticType ||
                      "dialogue",
                    speakerId:
                      restoredSpeakerId,
                    speakerName:
                      segment
                        .automaticSpeakerName ??
                      restoredCharacter
                        ?.name ??
                      null,
                    confidence:
                      segment
                        .automaticConfidence ??
                      (
                        restoredSpeakerId
                          ? 0.8
                          : 0.25
                      ),
                    manuallyCorrected:
                      false,
                    correctionType:
                      null,
                  };
                },
              );

            return {
              ...story,

              dialogueAnalysis: {
                ...analysis,
                narrationSegments,

                statistics:
                  createDialogueStatistics(
                    narrationSegments,
                  ),
              },
            };
          },
        ),
    }));

    setDialogueEditingSegmentId(null);
    setDialogueNewCharacterName("");
  }

  function goToDialogueSegment(
    segment,
  ) {
    if (
      !segment?.blockId ||
      !activeStory
    ) {
      return;
    }

    const position = {
      blockId: segment.blockId,
      offset:
        segment.startOffset || 0,
    };

    const pageIndex =
      findPageForPosition(
        pages,
        position,
      );

    if (pageIndex < 0) {
      setDialogueAnalysisError(
        "The selected dialogue passage could not be found in the current pagination.",
      );

      return;
    }

    stopNarration();

    setSelectedPosition({
      blockId: segment.blockId,
      sentenceId: null,
      offset:
        segment.startOffset || 0,
      sentenceStartOffset:
        segment.startOffset || 0,
      sentenceEndOffset:
        segment.endOffset || 0,
      pageNumber:
        pageIndex + 2,
      segmentId: segment.id,
    });

    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    setTableOfContentsOpen(false);
    setStatisticsPanelOpen(false);
    setDialogueReviewOpen(false);
    setCharacterManagerOpen(false);
    setBookOpen(true);

    goToPage(
      pageIndex + 2,
    );
  }

  function goToChapter(chapter) {
    if (
      !chapter?.pageNumber ||
      !activeStory
    ) {
      return;
    }

    stopNarration();
    setSelectedPosition(null);
    setSelectionMenu(null);
    setBookmarkPanelOpen(false);
    setTableOfContentsOpen(false);
    setBookOpen(true);

    goToPage(
      chapter.pageNumber,
    );
  }
    function returnToSelectedSentence() {
    if (!selectedPosition) {
      return;
    }

    const pageIndex = findPageForPosition(
      pages,
      selectedPosition,
    );

    if (pageIndex < 0) {
      return;
    }

    const pageNumber = pageIndex + 2;

    setSelectionMenu(null);
    setBookOpen(true);
    goToPage(pageNumber);
  }

  async function importFiles(event) {
    const selectedFiles = Array.from(
      event.target.files || [],
    );

    event.target.value = "";

    if (!selectedFiles.length) {
      return;
    }

    setImportResult(null);

    const extensionSupportedFiles =
      selectedFiles.filter((file) =>
        /\.(txt|md)$/i.test(
          file.name,
        ),
      );

    const unsupportedCount =
      selectedFiles.length -
      extensionSupportedFiles.length;

    const supportedFiles =
      extensionSupportedFiles.filter(
        (file) =>
          file.size <=
          MAX_IMPORT_FILE_SIZE,
      );

    const oversizedCount =
      extensionSupportedFiles.length -
      supportedFiles.length;

    const destinationFolderId =
      data.activeFolderId ===
      "all-stories"
        ? "unfiled"
        : data.activeFolderId;

    const fileResults =
      await Promise.all(
        supportedFiles.map(
          async (file) => {
            try {
              return {
                file,
                text: await file.text(),
                error: null,
              };
            } catch (error) {
              return {
                file,
                text: "",
                error,
              };
            }
          },
        ),
      );

    const knownContents = new Set(
      data.stories.map((story) =>
        normalizeStoryText(
          story.text,
        ),
      ),
    );

    const knownTitles =
      data.stories.map(
        (story) => story.title,
      );

    const importedStories = [];

    let duplicateCount = 0;
    let emptyCount = 0;
    let failedCount = 0;

    fileResults.forEach(
      ({ file, text, error }) => {
        if (error) {
          failedCount += 1;
          return;
        }

        const isMarkdown =
          /\.md$/i.test(file.name);

        const importedText =
          isMarkdown
            ? convertMarkdownToReadableText(
                text,
              )
            : text;

        const normalizedText =
          normalizeStoryText(
            importedText,
          );

        if (!normalizedText) {
          emptyCount += 1;
          return;
        }

        if (
          knownContents.has(
            normalizedText,
          )
        ) {
          duplicateCount += 1;
          return;
        }

        const requestedTitle =
          file.name.replace(
            /\.(txt|md)$/i,
            "",
          );

        const uniqueTitle =
          createUniqueStoryTitle(
            requestedTitle,
            knownTitles,
          );

        const now = Date.now();
        const storyId = uid("story");

        const story = {
          id: storyId,
          folderId:
            destinationFolderId,
          title: uniqueTitle,
          filename: file.name,
          author: "",
          description: "",
          tags: [],
          readingStatus: "unread",
          lastOpenedAt: null,
          readingSessions: 0,
          readingTimeSeconds: 0,
          text: importedText,
          createdAt: now,
          updatedAt: now,
          currentPage: 1,
          totalPages: 1,
          readingPosition: null,
          narrationPosition: null,
          dialogueAnalysis:
            createEmptyDialogueAnalysis(
              storyId,
            ),
          bookmarks: [],
        };

        importedStories.push(story);

        knownContents.add(
          normalizedText,
        );

        knownTitles.push(
          uniqueTitle,
        );
      },
    );

    if (importedStories.length > 0) {
      const finalStory =
        importedStories[
          importedStories.length - 1
        ];

      setData((current) => ({
        ...current,
        stories: [
          ...current.stories,
          ...importedStories,
        ],
        activeStoryId:
          finalStory.id,
      }));

      setBookOpen(false);
    }

    setImportResult({
      imported:
        importedStories.length,
      duplicates:
        duplicateCount,
      empty: emptyCount,
      unsupported:
        unsupportedCount,
      oversized:
        oversizedCount,
      failed: failedCount,
      restored: false,
    });
  }

  function exportLibraryBackup() {
    try {
      const backupData = {
        ...data,
        version: DATA_VERSION,
        exportedAt:
          new Date().toISOString(),
      };

      const blob = new Blob(
        [
          JSON.stringify(
            backupData,
            null,
            2,
          ),
        ],
        {
          type: "application/json",
        },
      );

      const url =
        URL.createObjectURL(blob);

      const link =
        document.createElement("a");

      const date =
        new Date()
          .toISOString()
          .slice(0, 10);

      link.href = url;
      link.download =
        `bp-library-backup-${date}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(
        "BP could not export the library.",
        error,
      );

      setStorageError(
        "BP could not create the library backup.",
      );
    }
  }

  async function importLibraryBackup(
    event,
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (
      file.size >
      MAX_IMPORT_FILE_SIZE
    ) {
      setStorageError(
        "The selected backup is larger than 5 MB and could not be restored.",
      );

      return;
    }

    setImportResult(null);
    setStorageError("");

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(
          parsed.stories,
        ) ||
        !Array.isArray(
          parsed.folders,
        )
      ) {
        throw new Error(
          "Invalid BP backup.",
        );
      }

      const restoredData =
        normalizeLibraryData(parsed);

      stopNarration();
      setSelectedPosition(null);
      setSelectionMenu(null);
      setBookmarkPanelOpen(false);
      setBookOpen(false);

      setSelectedVoiceId(
        restoredData.settings
          ?.narrationVoiceId || "",
      );

      setNarrationRate(
        restoredData.settings
          ?.narrationRate || 1,
      );

      setNarrationWordHighlightEnabled(
        restoredData.settings
          ?.narrationWordHighlight !==
          false,
      );

      setData(restoredData);
      setModal(null);

      setImportResult({
        imported:
          restoredData.stories.length,
        duplicates: 0,
        empty: 0,
        unsupported: 0,
        oversized: 0,
        failed: 0,
        restored: true,
      });

    } catch (error) {
      console.error(
        "BP could not restore the backup.",
        error,
      );

      setStorageError(
        "The selected file is not a valid BP library backup.",
      );
    }
  }

  function createFolder() {
    const name = draftName.trim();
    if (!name) return;
    setData((current) => ({
      ...current,
      folders: [...current.folders, { id: uid("folder"), name, parentId: null, system: false }],
    }));
    setDraftName("");
    setModal(null);
  }

  function renameFolder() {
    const name = draftName.trim();
    if (!name || !modal?.id) return;
    setData((current) => ({
      ...current,
      folders: current.folders.map((folder) => folder.id === modal.id ? { ...folder, name } : folder),
    }));
    setDraftName("");
    setModal(null);
  }

  function deleteFolder(folderId) {
    setData((current) => ({
      ...current,
      activeFolderId: current.activeFolderId === folderId ? "all-stories" : current.activeFolderId,
      folders: current.folders.filter((folder) => folder.id !== folderId),
      stories: current.stories.map((story) => story.folderId === folderId ? { ...story, folderId: "unfiled" } : story),
    }));
  }

  function openStoryDetails(
    story,
  ) {
    if (!story) {
      return;
    }

    setDraftName(
      story.title || "",
    );

    setDraftAuthor(
      story.author || "",
    );

    setDraftDescription(
      story.description || "",
    );

    setDraftTags(
      (story.tags || []).join(", "),
    );

    setDraftReadingStatus(
      story.readingStatus ||
        (
          (story.currentPage || 1) > 1
            ? "reading"
            : "unread"
        ),
    );

    setDraftFolderId(
      story.folderId || "unfiled",
    );

    setModal({
      type: "story-actions",
      id: story.id,
    });
  }

  function saveStoryDetails() {
    const title = draftName.trim();

    if (!title || !modal?.id) {
      return;
    }

    const tags = [
      ...new Set(
        draftTags
          .split(",")
          .map((tag) =>
            tag
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ].slice(0, 20);

  updateStory(modal.id, {
    title,
    author:
      draftAuthor.trim(),
    description:
      draftDescription.trim(),
    tags,
    readingStatus:
      draftReadingStatus,
    folderId:
      draftFolderId,
  });

    setDraftName("");
    setDraftAuthor("");
    setDraftDescription("");
    setDraftTags("");
    setDraftReadingStatus("unread");
    setDraftFolderId("unfiled");
    setModal(null);
  }

  function deleteStory(storyId) {
    setData((current) => {
      const stories = current.stories.filter((story) => story.id !== storyId);
      return {
        ...current,
        stories,
        activeStoryId: current.activeStoryId === storyId ? stories[0]?.id || null : current.activeStoryId,
      };
    });
    setModal(null);
    setBookOpen(false);
  }

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#171714] text-stone-100">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        multiple
        hidden
        onChange={importFiles}
      />

      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={importLibraryBackup}
      />

      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="relative z-30 flex h-screen shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#22221e]"
          >
            <div className="flex items-center justify-between px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-200 text-stone-900 shadow-lg shadow-amber-950/20">
                  <Library size={20} />
                </div>
                <div>
                  <h1 className="font-serif text-lg font-semibold">BP Library</h1>
                  <p className="text-xs text-stone-400">Stage 4 complete</p>
                </div>
              </div>
              <button className="rounded-xl p-2 text-stone-400 hover:bg-white/10 hover:text-white" onClick={() => setSidebarOpen(false)}>
                <ChevronLeft size={20} />
              </button>
            </div>

            <div className="px-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
                <Search
                  size={17}
                  className="shrink-0 text-stone-500"
                />

                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search stories or metadata"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-500"
                  aria-label="Search library"
                />

                {query && (
                  <button
                    type="button"
                    onClick={() =>
                      setQuery("")
                    }
                    className="shrink-0 rounded-lg p-1 text-stone-500 hover:bg-white/10 hover:text-white"
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    <XCircle size={16} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2">
                <SlidersHorizontal
                  size={15}
                  className="shrink-0 text-stone-500"
                />

                <select
                  value={
                    data.settings.librarySort ||
                    "updated-desc"
                  }
                  onChange={(event) =>
                    setData((current) => ({
                      ...current,

                      settings: {
                        ...current.settings,
                        librarySort:
                          event.target.value,
                      },
                    }))
                  }
                  className="min-w-0 flex-1 bg-transparent text-xs text-stone-300 outline-none"
                  aria-label="Sort stories"
                >
                  <option value="updated-desc">
                    Recently updated
                  </option>

                  <option value="created-desc">
                    Recently added
                  </option>
                   
                  <option value="opened-desc">
                    Recently read
                  </option>

                  <option value="title-asc">
                    Title A to Z
                  </option>

                  <option value="title-desc">
                    Title Z to A
                  </option>

                  <option value="progress-desc">
                    Reading progress
                  </option>
                </select>

                <span className="shrink-0 text-[10px] text-stone-600">
                  {visibleStories.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-200 px-3 py-2.5 text-sm font-medium text-stone-900 hover:bg-amber-100"
                >
                  <Upload size={16} />
                  Import
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDraftName("");
                    setModal({
                      type: "new-folder",
                    });
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-stone-200 hover:bg-white/10"
                >
                  <FolderPlus size={16} />
                  Folder
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={
                    exportLibraryBackup
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-300 hover:bg-white/10"
                >
                  <Download size={15} />
                  Backup
                </button>

                <button
                  type="button"
                  onClick={() =>
                    backupInputRef.current?.click()
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-300 hover:bg-white/10"
                >
                  <UploadCloud size={15} />
                  Restore
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBookmarkPanelOpen(false);
                  setTableOfContentsOpen(false);
                  setStatisticsPanelOpen(false);
                  setDialogueReviewOpen(false);
                  setCharacterManagerOpen(true);
                }}
                disabled={
                  !activeStory
                    ?.dialogueAnalysis
                    ?.analysedAt
                }
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                title={
                  activeStory
                    ?.dialogueAnalysis
                    ?.analysedAt
                    ? "Manage story characters"
                    : "Analyse the active story first"
                }
              >
                <UserRoundCog size={15} />

                Character manager

                {dialogueCharacters.length >
                  0 && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-stone-400">
                    {dialogueCharacters.length}
                  </span>
                )}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBookmarkPanelOpen(false);
                    setTableOfContentsOpen(false);
                    setDialogueReviewOpen(false);
                    setCharacterManagerOpen(false);
                    setStatisticsPanelOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-2 py-2 text-xs text-stone-300 hover:bg-white/10"
                >
                  <BarChart3 size={15} />
                  Statistics
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBookmarkPanelOpen(false);
                    setTableOfContentsOpen(false);
                    setStatisticsPanelOpen(false);
                    setCharacterManagerOpen(false);

                    setDialogueReviewFilter(
                      unresolvedDialogueCount > 0
                        ? "unresolved"
                        : "all",
                    );

                    setDialogueReviewOpen(true);
                  }}
                  disabled={
                    !activeStory
                      ?.dialogueAnalysis
                      ?.analysedAt ||
                    dialogueSegments.length === 0
                  }
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-2 py-2 text-xs text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                  title={
                    activeStory
                      ?.dialogueAnalysis
                      ?.analysedAt
                      ? "Review detected dialogue"
                      : "Analyse the active story first"
                  }
                >
                  <MessageSquareText
                    size={15}
                  />

                  Dialogue

                  {unresolvedDialogueCount >
                    0 && (
                    <span className="rounded-full bg-amber-200/15 px-1.5 py-0.5 text-[9px] text-amber-200">
                      {
                        unresolvedDialogueCount
                      }
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-5 border-y border-white/10 py-3">
              {data.folders.map((folder) => {
                const count = folder.id === "all-stories" ? data.stories.length : data.stories.filter((story) => story.folderId === folder.id).length;
                const active = data.activeFolderId === folder.id;
                return (
                  <div key={folder.id} className="group flex items-center px-3">
                    <button onClick={() => setData((current) => ({ ...current, activeFolderId: folder.id }))} className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${active ? "bg-amber-200/15 text-amber-100" : "text-stone-300 hover:bg-white/5"}`}>
                      {folder.id === "all-stories" ? <BookOpen size={17} /> : <Folder size={17} />}
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="text-xs text-stone-500">{count}</span>
                    </button>
                    {!folder.system && (
                      <button onClick={() => { setDraftName(folder.name); setModal({ type: "folder-actions", id: folder.id }); }} className="invisible rounded-lg p-2 text-stone-500 hover:bg-white/10 group-hover:visible">
                        <MoreVertical size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Stories</p>
              <div className="space-y-1.5">
                {visibleStories.map((story) => (
                  <div key={story.id} className={`group flex items-center rounded-2xl border ${story.id === data.activeStoryId ? "border-amber-200/30 bg-amber-200/10" : "border-transparent hover:bg-white/5"}`}>
                    <button onClick={() => selectStory(story.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left">
                      <div className="grid h-10 w-8 shrink-0 place-items-center rounded-sm bg-gradient-to-br from-amber-800 to-stone-900 shadow-md">
                        <BookOpen size={14} className="text-amber-100" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-stone-100">
                            {story.title}
                          </p>

                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              story.readingStatus ===
                              "finished"
                                ? "bg-emerald-400"
                                : story.readingStatus ===
                                    "reading"
                                  ? "bg-amber-300"
                                  : "bg-stone-600"
                            }`}
                            title={
                              story.readingStatus ===
                              "finished"
                                ? "Finished"
                                : story.readingStatus ===
                                    "reading"
                                  ? "Reading"
                                  : "Unread"
                            }
                            aria-label={
                              story.readingStatus ===
                              "finished"
                                ? "Finished"
                                : story.readingStatus ===
                                    "reading"
                                  ? "Reading"
                                  : "Unread"
                            }
                          />
                        </div>

                        {story.author && (
                          <p className="mt-0.5 truncate text-xs text-stone-400">
                            {story.author}
                          </p>
                        )}

                        {story.lastOpenedAt && (
                          <p
                            className="mt-0.5 truncate text-[10px] text-stone-600"
                            title={new Date(
                              story.lastOpenedAt,
                            ).toLocaleString()}
                          >
                            {formatLastOpened(
                              story.lastOpenedAt,
                            )}
                          </p>
                        )}

                        <div className="mt-1">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500">
                            <span>
                              Page{" "}
                              {story.currentPage || 1}
                            </span>

                            <span>
                              {Math.round(
                                getStoryProgress(story) *
                                  100,
                              )}
                              %
                            </span>
                          </div>

                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                            <div
                              className={`h-full rounded-full ${
                                story.readingStatus ===
                                "finished"
                                  ? "bg-emerald-400/70"
                                  : "bg-amber-200/60"
                              }`}
                              style={{
                                width: `${Math.round(
                                  getStoryProgress(story) *
                                    100,
                                )}%`,
                              }}
                            />
                          </div>
                        </div>

                        {(story.tags || []).length >
                          0 && (
                          <div className="mt-1.5 flex gap-1 overflow-hidden">
                            {story.tags
                              .slice(0, 2)
                              .map((tag) => (
                                <span
                                  key={tag}
                                  className="max-w-[82px] truncate rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-stone-500"
                                  title={tag}
                                >
                                  {tag}
                                </span>
                              ))}

                            {(story.tags || []).length >
                              2 && (
                              <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-stone-600">
                                +
                                {(story.tags || [])
                                  .length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openStoryDetails(story)
                      }
                      className="invisible mr-2 rounded-lg p-2 text-stone-500 hover:bg-white/10 group-hover:visible"
                      aria-label={`Open options for ${story.title}`}
                      title="Story details"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </div>
                ))}
                {!visibleStories.length && <p className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-stone-500">No stories found.</p>}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <main className="relative flex h-screen min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,#35342d_0%,#1a1a17_52%,#11110f_100%)]">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/10 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 hover:bg-white/10"><Menu size={20} /></button>}
            <div className="min-w-0">
              <p className="truncate font-serif text-lg font-semibold">{activeStory?.title || "No story selected"}</p>
              <p className="text-xs text-stone-500">{activeStory ? `${pages.length + 1} pages including cover` : "Import a text file to begin"}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden items-center rounded-xl border border-white/10 bg-black/20 sm:flex">
              <button
                type="button"
                onClick={() =>
                  setData((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      fontSize: Math.max(13, current.settings.fontSize - 1),
                    },
                  }))
                }
                className="p-2 text-stone-300 hover:bg-white/10"
                aria-label="Decrease font size"
              >
                <Minus size={15} />
              </button>

              <span className="min-w-10 text-center text-xs text-stone-400">
                {data.settings.fontSize}px
              </span>

              <button
                type="button"
                onClick={() =>
                  setData((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      fontSize: Math.min(26, current.settings.fontSize + 1),
                    },
                  }))
                }
                className="p-2 text-stone-300 hover:bg-white/10"
                aria-label="Increase font size"
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setModal({
                  type: "narration-settings",
                })
              }
              className="hidden max-w-[220px] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white/10 md:flex"
              title="Narration settings"
              aria-label="Open narration settings"
            >
              <Volume2
                size={15}
                className={
                  narrationStatus === "playing"
                    ? "shrink-0 text-emerald-300"
                    : narrationStatus === "paused"
                      ? "shrink-0 text-amber-300"
                      : "shrink-0 text-stone-400"
                }
              />

              <span className="min-w-0">
                <span className="block truncate text-xs text-stone-200">
                  {narrationStatus !==
                    "idle" &&
                  narrationSpeaker?.speakerName
                    ? `${narrationSpeaker.speakerName} · ${narrationStatusLabel}`
                    : narrationStatusLabel}
                </span>

                <span className="block max-w-[170px] truncate text-[10px] text-stone-500">
                  {narrationRate}x
                  {narrationPreview
                    ? ` · ${narrationPreview}`
                    : ""}
                </span>
              </span>
            </button>

          <button
            type="button"
            onClick={() => {
              setBookmarkPanelOpen(false);
              setStatisticsPanelOpen(false);
              setDialogueReviewOpen(false);
              setCharacterManagerOpen(false);
              setTableOfContentsOpen(true);
            }}
            disabled={
              !activeStory ||
              chapters.length === 0
            }
            className="hidden items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-stone-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 lg:flex"
            title={
              chapters.length > 0
                ? "Open table of contents"
                : "No chapters detected"
            }
          >
            <ListTree size={16} />

            <span>
              Contents
            </span>

            {chapters.length > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
                {chapters.length}
              </span>
            )}
          </button>

          <select
            value={data.settings.theme}
              onChange={(e) => setData((current) => ({ ...current, settings: { ...current.settings, theme: e.target.value } }))}
              className="max-w-[112px] rounded-xl border border-white/10 bg-black/20 px-2 py-2 text-xs text-stone-200 outline-none sm:max-w-none sm:px-3"
            >
              <option value="ivory">Ivory paper</option>
              <option value="white">White paper</option>
              <option value="night">Night paper</option>
            </select>
            <button onClick={() => fileInputRef.current?.click()} className="hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/10 sm:flex">
              <FilePlus2 size={16} /> Add story
            </button>
          </div>
        </header>

        {importResult && (
  <div
    className={`z-20 flex items-center justify-between gap-4 border-b px-4 py-2 text-sm ${
      importResult.imported > 0
        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
        : "border-amber-400/20 bg-amber-500/10 text-amber-100"
    }`}
  >
    <span>
      {importResult.restored
        ? `Library restored with ${importResult.imported} ${
            importResult.imported === 1
              ? "story"
              : "stories"
          }.`
        : importResult.imported > 0
          ? `${importResult.imported} ${
              importResult.imported === 1
                ? "story"
                : "stories"
            } imported.`
          : "No stories were imported."}

      {!importResult.restored && (
        <>
          {importResult.duplicates > 0
            ? ` ${importResult.duplicates} ${
                importResult.duplicates === 1
                  ? "duplicate was"
                  : "duplicates were"
              } skipped.`
            : ""}

          {importResult.empty > 0
            ? ` ${importResult.empty} ${
                importResult.empty === 1
                  ? "empty file was"
                  : "empty files were"
              } skipped.`
            : ""}

          {importResult.unsupported > 0
            ? ` ${importResult.unsupported} unsupported ${
                importResult.unsupported === 1
                  ? "file was"
                  : "files were"
              } skipped.`
            : ""}

          {importResult.oversized > 0
            ? ` ${importResult.oversized} ${
                importResult.oversized === 1
                  ? "file was"
                  : "files were"
              } larger than 5 MB and skipped.`
            : ""}

          {importResult.failed > 0
            ? ` ${importResult.failed} ${
                importResult.failed === 1
                  ? "file could"
                  : "files could"
              } not be read.`
            : ""}
        </>
      )}
    </span>

    <button
      type="button"
      onClick={() =>
        setImportResult(null)
      }
      className="shrink-0 rounded-lg p-1 hover:bg-white/10"
      aria-label="Dismiss import result"
    >
      <X size={16} />
    </button>
  </div>
)}
        {storageError && (
          <div className="z-20 flex items-center justify-between gap-4 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
            <span>
              {storageError}
            </span>

            <button
              type="button"
              onClick={() =>
                setStorageError("")
              }
              className="rounded-lg p-1 hover:bg-white/10"
              aria-label="Dismiss storage warning"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {narrationError && (
          <div className="z-20 flex items-center justify-between gap-4 border-b border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            <span>
              {narrationError}
            </span>

            <button
              type="button"
              onClick={() =>
                setNarrationError("")
              }
              className="rounded-lg p-1 hover:bg-white/10"
              aria-label="Dismiss narration error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="relative min-h-0 flex-1 overflow-auto p-4 sm:p-8">
          {isPaginating && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-[#171714]/70 backdrop-blur-sm">
              <div className="rounded-2xl border border-white/10 bg-stone-900 px-5 py-3 text-sm text-stone-300 shadow-xl">
                Repaginating story...
              </div>
            </div>
          )}
          {!activeStory ? (
            <div className="grid h-full place-items-center">
              <button onClick={() => fileInputRef.current?.click()} className="rounded-3xl border border-dashed border-white/20 p-12 text-center hover:bg-white/5">
                <Upload className="mx-auto mb-4 text-amber-200" />
                <p className="font-serif text-2xl">Import your first story</p>
                <p className="mt-2 text-sm text-stone-500">TXT and Markdown are currently supported.</p>
              </button>
            </div>
          ) : !bookOpen ? (
            <div className="grid min-h-full place-items-center py-8">
              <motion.button
                whileHover={{ y: -5, rotateY: -4 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  const savedPage =
                    activeStory?.currentPage || 1;

                  beginReadingSession(
                    activeStory.id,
                  );

                  setBookOpen(true);

                  goToPage(
                    savedPage > 1
                      ? savedPage
                      : 2,
                  );
                }}
                className="relative aspect-[2/3] w-[min(72vw,360px)] overflow-hidden rounded-r-xl border-l-[12px] border-amber-950 bg-gradient-to-br from-[#7d2d21] via-[#4d1f1a] to-[#21100e] p-8 text-left shadow-[0_30px_80px_rgba(0,0,0,.55)]"
                style={{ transformStyle: "preserve-3d" }}
              >
                <div className="absolute inset-4 rounded-r-lg border border-amber-200/20" />
                <div className="relative flex h-full flex-col items-center justify-center text-center">
                  <BookOpen className="mb-8 text-amber-200/80" size={48} />
                  <h2 className="font-serif text-3xl font-semibold leading-tight text-amber-50">
                    {activeStory.title}
                  </h2>

                  {activeStory.author && (
                    <p className="mt-3 font-serif text-sm text-amber-100/70">
                      {activeStory.author}
                    </p>
                  )}

                  {activeStory.description && (
                    <p className="mt-5 line-clamp-3 max-w-[260px] text-sm leading-relaxed text-amber-100/55">
                      {activeStory.description}
                    </p>
                  )}

                  {(activeStory.tags || []).length >
                    0 && (
                    <div className="mt-5 flex max-w-[260px] flex-wrap justify-center gap-1.5">
                      {activeStory.tags
                        .slice(0, 4)
                        .map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-amber-200/15 bg-black/10 px-2 py-1 text-[10px] text-amber-100/55"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  )}

                  <p className="mt-5 text-xs uppercase tracking-[0.3em] text-amber-200/60">
                    Open book
                  </p>
                </div>
              </motion.button>
            </div>
          ) : (
            <div
              ref={readerRef}
              onTouchStart={handleReaderTouchStart}
              onTouchMove={handleReaderTouchMove}
              onTouchEnd={handleReaderTouchEnd}
              onTouchCancel={cancelReaderTouch}
              className="mx-auto flex min-h-full w-full max-w-6xl touch-pan-y items-center justify-center py-8"
            >
              <div className="relative grid min-w-0 grid-cols-1 items-start gap-1 md:grid-cols-2"
                style={{
                  width: isMobileLayout
                    ? `${readerPageSize.width}px`
                    : `${
                        readerPageSize.width * 2 + 4
                      }px`,
                  maxWidth: "100%",
                  perspective: "2200px",
                  transformStyle: "preserve-3d",
                }}
              >
                <motion.div
                  key={`left-${displayedPage}`}
                  initial={false}
                  animate={{
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0,
                  }}
                  className="min-w-0"
                >
                  <BookPage
                    pageNumber={displayedPage}
                    page={pages[displayedPage - 2]}
                    pageWidth={readerPageSize.width}
                    pageHeight={readerPageSize.height}
                    selectedPosition={selectedPosition}
                    readingPosition={
                      activeStory?.readingPosition || null
                    }
                    narrationPosition={narrationPosition}
                    narrationWordPosition={
                      narrationWordHighlightEnabled
                        ? narrationWordPosition
                        : null
                    }
                    onSelectSentence={selectSentence}
                    onPreviousPage={navigateBackward}
                    onNextPage={navigateForward}
                    {...data.settings}
                  />
                </motion.div>
                <motion.div
                  key={`right-${displayedPage + 1}`}
                  initial={false}
                  animate={{
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0,
                  }}
                  className="hidden min-w-0 md:block"
                >
                  <BookPage
                    pageNumber={displayedPage + 1}
                    page={pages[displayedPage - 1]}
                    pageWidth={readerPageSize.width}
                    pageHeight={readerPageSize.height}
                    selectedPosition={selectedPosition}
                    readingPosition={
                      activeStory?.readingPosition || null
                    }
                    narrationPosition={narrationPosition}
                    narrationWordPosition={
                      narrationWordHighlightEnabled
                        ? narrationWordPosition
                        : null
                    }
           
                    onSelectSentence={selectSentence}
                    onPreviousPage={navigateBackward}
                    onNextPage={navigateForward}
                    {...data.settings}
                  />
                </motion.div>
                <AnimatePresence>
                  {pageTurn?.page && (
                    <React.Fragment key={pageTurn.key}>
                      <div
                        className="absolute inset-0 z-20"
                        aria-hidden="true"
                      />

                      <PageTurnOverlay
                        direction={pageTurn.direction}
                        page={pageTurn.page}
                        pageNumber={pageTurn.pageNumber}
                        pageWidth={readerPageSize.width}
                        pageHeight={readerPageSize.height}
                        settings={data.settings}
                        selectedPosition={selectedPosition}
                        readingPosition={
                          activeStory?.readingPosition ||
                          null
                        }
                        narrationPosition={narrationPosition}
                        narrationWordPosition={
                          narrationWordHighlightEnabled
                            ? narrationWordPosition
                            : null
                        }
                        isMobileLayout={isMobileLayout}
                        onComplete={() =>
                          setPageTurn(null)
                        }
                      />
                    </React.Fragment>
                  )}
                </AnimatePresence>

              </div>
            </div>
          )}
        </section>

        {activeStory && bookOpen && (
          <footer className="relative z-20 flex shrink-0 flex-wrap items-center justify-center gap-1.5 border-t border-white/10 bg-black/25 px-2 py-3 backdrop-blur sm:gap-3 sm:px-4">
            <button
              type="button"
              onClick={returnToReadingPosition}
              disabled={!activeStory?.readingPosition}
              className="absolute left-4 hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 lg:flex"
            >
              <MapPin size={16} />
              Return to reading position
            </button>
            <button
              type="button"
              onClick={() => {
                setTableOfContentsOpen(false);
                setStatisticsPanelOpen(false);
                setDialogueReviewOpen(false);
                setCharacterManagerOpen(false);

                setBookmarkPanelOpen(
                  (current) => !current,
                );
              }}
              className="absolute right-4 hidden items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-stone-300 hover:bg-white/10 lg:flex"
            >
              <List size={16} />
              Bookmarks

              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">
                {(activeStory?.bookmarks || []).length}
              </span>
            </button>
            <button
                type="button"
                onClick={() =>
                  setModal({
                    type: "narration-settings",
                  })
                }
                className="rounded-xl border border-white/10 p-2.5 text-stone-300 hover:bg-white/10 hover:text-white"
                aria-label="Narration settings"
                title="Narration settings"
              >
                <Settings2 size={18} />
              </button>
            <div className="flex items-center rounded-xl border border-white/10 bg-black/20">
              <button
                type="button"
                onClick={narratePreviousSentence}
                disabled={
                  !activeStory?.text ||
                  typeof window === "undefined" ||
                  !("speechSynthesis" in window)
                }
                className="p-2.5 text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous sentence"
                title="Previous sentence"
              >
                <SkipBack size={16} />
              </button>

              <button
                type="button"
                onClick={toggleNarration}
                disabled={
                  !activeStory?.text ||
                  typeof window === "undefined" ||
                  !("speechSynthesis" in window)
                }
                className="border-l border-white/10 p-2.5 text-stone-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={
                  narrationStatus === "playing"
                    ? "Pause narration"
                    : narrationStatus === "paused"
                      ? "Resume narration"
                      : "Start narration"
                }
                title={
                  narrationStatus === "playing"
                    ? "Pause narration"
                    : narrationStatus === "paused"
                      ? "Resume narration"
                      : "Start narration"
                }
              >
                {narrationStatus === "playing" ? (
                  <Pause size={18} />
                ) : (
                  <Play size={18} />
                )}
              </button>

              <button
                type="button"
                onClick={narrateNextSentence}
                disabled={
                  !activeStory?.text ||
                  typeof window === "undefined" ||
                  !("speechSynthesis" in window)
                }
                className="border-l border-white/10 p-2.5 text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next sentence"
                title="Next sentence"
              >
                <SkipForward size={16} />
              </button>

              <button
                type="button"
                onClick={stopNarration}
                disabled={
                  narrationStatus === "idle"
                }
                className="border-l border-white/10 p-2.5 text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Stop narration"
                title="Stop narration"
              >
                <Square size={15} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setBookmarkPanelOpen(false);
                setStatisticsPanelOpen(false);
                setDialogueReviewOpen(false);
                setCharacterManagerOpen(false);
                setTableOfContentsOpen(true);
              }}
              disabled={
                chapters.length === 0
              }
              className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 lg:hidden"
              aria-label="Open table of contents"
              title={
                chapters.length > 0
                  ? "Table of contents"
                  : "No chapters detected"
              }
            >
              <ListTree size={20} />
            </button>

            <button
              type="button"
              onClick={() => {
                setTableOfContentsOpen(false);
                setStatisticsPanelOpen(false);
                setDialogueReviewOpen(false);
                setCharacterManagerOpen(false);
                setBookmarkPanelOpen(true);
              }}
              className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10 lg:hidden"
              aria-label="Open bookmarks"
            >
              <Bookmark size={20} />
            </button>
            <button
              type="button"
              disabled={Boolean(pageTurn)}
              onClick={navigateBackward}
              className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={
                isMobileLayout
                  ? "Previous page"
                  : "Previous spread"
              }
            >
              <ChevronLeft size={20} />
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                goToEnteredPage();
              }}
              className="hidden min-w-0 items-center justify-center gap-1.5 text-sm text-stone-400 min-[430px\]:flex sm:min-w-[180px] sm:gap-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={pageInput}
                onChange={(event) =>
                  setPageInput(
                    event.target.value.replace(
                      /\D/g,
                      "",
                    ),
                  )
                }
                placeholder={
                  isMobileLayout
                    ? String(displayedPage)
                    : `${displayedPage}-${Math.min(
                        displayedPage + 1,
                        pages.length + 1,
                      )}`
                }
                aria-label="Page number"
                title="Enter a page number and press Enter"
                className="w-[54px] rounded-lg border border-white/10 bg-black/20 px-1.5 py-1.5 text-center text-sm text-white outline-none placeholder:text-stone-400 focus:border-amber-300/40 sm:w-[72px] sm:px-2"
              />

              <span className="hidden sm:inline">
                of {pages.length + 1}
              </span>
              <button
                type="submit"
                disabled={!pageInput}
                className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-stone-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:px-2.5"
              >
                Go
              </button>
            </form>
            <button
              type="button"
              disabled={
                Boolean(pageTurn) ||
                (
                  isMobileLayout
                    ? displayedPage >= pages.length + 1
                    : displayedPage + 1 >= pages.length + 1
                )
              }
              onClick={navigateForward}
              className="rounded-xl border border-white/10 p-2.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={
                isMobileLayout
                  ? "Next page"
                  : "Next spread"
              }
            >
              <ChevronRight size={20} />
            </button>
          </footer>
        )}
            </main>
            <AnimatePresence>
              {characterManagerOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close character manager"
                    onClick={() => {
                      setCharacterManagerOpen(
                        false,
                      );

                      closeCharacterEditor();
                    }}
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                  />

                  <motion.aside
                    initial={{
                      opacity: 0,
                      x: 24,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    exit={{
                      opacity: 0,
                      x: 24,
                    }}
                    className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(94vw,540px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900 text-stone-100 shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <UserRoundCog
                            size={18}
                            className="shrink-0 text-amber-200"
                          />

                          <h2 className="truncate font-serif text-lg font-semibold">
                            Character manager
                          </h2>
                        </div>

                        <p className="mt-1 truncate text-xs text-stone-500">
                          {activeStory?.title}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCharacterManagerOpen(
                            false,
                          );

                          closeCharacterEditor();
                        }}
                        className="shrink-0 rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                        aria-label="Close character manager"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {dialogueAnalysisError && (
                      <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2">
                        <p className="text-xs leading-relaxed text-red-200">
                          {dialogueAnalysisError}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueAnalysisError("")
                          }
                          className="shrink-0 rounded-lg p-1 text-red-300 hover:bg-red-400/10"
                          aria-label="Dismiss character error"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      {dialogueCharacters.length >
                      0 ? (
                        <div className="space-y-3">
                          {dialogueCharacters.map(
                            (character) => {
                              const assignedCount =
                                dialogueSegments.filter(
                                  (segment) =>
                                    segment.speakerId ===
                                    character.id,
                                ).length;

                              const editing =
                                characterEditingId ===
                                character.id;

                              return (
                                <div
                                  key={character.id}
                                  className={`rounded-2xl border p-4 ${
                                    character.locked
                                      ? "border-amber-300/25 bg-amber-200/[0.04]"
                                      : "border-white/10 bg-white/[0.03]"
                                  }`}
                                >
                                  {editing ? (
                                    <div className="space-y-4">
                                      <div>
                                        <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                          Name
                                        </label>

                                        <input
                                          autoFocus
                                          type="text"
                                          value={
                                            characterDraftName
                                          }
                                          onChange={(
                                            event,
                                          ) =>
                                            setCharacterDraftName(
                                              event
                                                .target
                                                .value,
                                            )
                                          }
                                          maxLength={80}
                                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                                        />
                                      </div>

                                      <div>
                                        <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                          Aliases
                                        </label>

                                        <input
                                          type="text"
                                          value={
                                            characterDraftAliases
                                          }
                                          onChange={(
                                            event,
                                          ) =>
                                            setCharacterDraftAliases(
                                              event
                                                .target
                                                .value,
                                            )
                                          }
                                          placeholder="Captain Mara, Engineer"
                                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-stone-600 focus:border-amber-300/40"
                                        />

                                        <p className="mt-1 text-[10px] text-stone-600">
                                          Separate aliases with commas.
                                        </p>
                                      </div>

                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                            Role
                                          </label>

                                          <select
                                            value={
                                              characterDraftRole
                                            }
                                            onChange={(event) =>
                                              setCharacterDraftRole(
                                                event.target.value,
                                              )
                                            }
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-stone-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                                          >
                                            <option value="major">
                                              Major
                                            </option>

                                            <option value="minor">
                                              Minor
                                            </option>

                                            <option value="background">
                                              Background
                                            </option>
                                          </select>
                                        </div>

                                        <div>
                                          <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                            Voice category
                                          </label>

                                          <select
                                            value={
                                              characterDraftVoiceCategory
                                            }
                                            onChange={(event) =>
                                              setCharacterDraftVoiceCategory(
                                                event.target.value,
                                              )
                                            }
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-stone-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                                          >
                                            <option value="adult-neutral">
                                              Adult neutral
                                            </option>

                                            <option value="adult-light">
                                              Adult light
                                            </option>

                                            <option value="adult-deep">
                                              Adult deep
                                            </option>

                                            <option value="young-neutral">
                                              Young neutral
                                            </option>

                                            <option value="elder-neutral">
                                              Elder neutral
                                            </option>

                                            <option value="creature">
                                              Creature
                                            </option>

                                            <option value="synthetic">
                                              Synthetic
                                            </option>
                                          </select>
                                        </div>

                                        <div className="col-span-2">
                                          <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                            Browser voice
                                          </label>

                                          <select
                                            value={
                                              characterDraftVoiceId
                                            }
                                            onChange={(event) =>
                                              setCharacterDraftVoiceId(
                                                event.target.value,
                                              )
                                            }
                                            className="mt-2 w-full rounded-xl border border-white/10 bg-stone-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                                          >
                                            <option value="">
                                              Use narrator fallback
                                            </option>

                                            {voices.map((voice) => (
                                              <option
                                                key={voice.voiceURI}
                                                value={voice.voiceURI}
                                              >
                                                {voice.name} ({voice.lang})
                                              </option>
                                            ))}
                                          </select>

                                          <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
                                            This voice will be used for dialogue
                                            assigned to this character. If the
                                            voice is unavailable, BP will use the
                                            narrator voice.
                                          </p>

                                          <button
                                            type="button"
                                            onClick={
                                              previewCharacterVoice
                                            }
                                            disabled={
                                              voices.length === 0
                                            }
                                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                          >
                                            <Volume2 size={14} />
                                            Preview voice
                                          </button>
                                        </div>
                                      </div>                            
                                      <div className="grid grid-cols-2 gap-2">
                                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
                                          <span>
                                            <span className="block text-xs font-medium text-stone-200">
                                              Locked profile
                                            </span>

                                            <span className="mt-1 block text-[10px] text-stone-600">
                                              Protect this identity
                                            </span>
                                          </span>

                                          <input
                                            type="checkbox"
                                            checked={
                                              characterDraftLocked
                                            }
                                            onChange={(
                                              event,
                                            ) =>
                                              setCharacterDraftLocked(
                                                event
                                                  .target
                                                  .checked,
                                              )
                                            }
                                            className="h-4 w-4 shrink-0 accent-amber-500"
                                          />
                                        </label>

                                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
                                          <span>
                                            <span className="block text-xs font-medium text-stone-200">
                                              Temporary
                                            </span>

                                            <span className="mt-1 block text-[10px] text-stone-600">
                                              Minor provisional identity
                                            </span>
                                          </span>

                                          <input
                                            type="checkbox"
                                            checked={
                                              characterDraftTemporary
                                            }
                                            onChange={(
                                              event,
                                            ) =>
                                              setCharacterDraftTemporary(
                                                event
                                                  .target
                                                  .checked,
                                              )
                                            }
                                            className="h-4 w-4 shrink-0 accent-amber-500"
                                          />
                                        </label>
                                      </div>

                                      <div>
                                        <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                          Notes
                                        </label>

                                        <textarea
                                          value={
                                            characterDraftNotes
                                          }
                                          onChange={(
                                            event,
                                          ) =>
                                            setCharacterDraftNotes(
                                              event
                                                .target
                                                .value,
                                            )
                                          }
                                          rows={3}
                                          maxLength={500}
                                          placeholder="Performance or identity notes"
                                          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-stone-600 focus:border-amber-300/40"
                                        />
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        <button
                                          type="button"
                                          onClick={
                                            closeCharacterEditor
                                          }
                                          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-stone-400 hover:bg-white/5 hover:text-white"
                                        >
                                          Cancel
                                        </button>

                                        <button
                                          type="button"
                                          onClick={
                                            saveCharacterProfile
                                          }
                                          disabled={
                                            !characterDraftName.trim()
                                          }
                                          className="rounded-xl bg-amber-200 px-3 py-2 text-sm font-medium text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                          Save profile
                                        </button>
                                      </div>

                                      <div className="border-t border-white/10 pt-4">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                                          Merge character
                                        </p>

                                        {characterDraftLocked ? (
                                          <p className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] p-3 text-xs text-stone-500">
                                            Unlock and save this profile
                                            before merging it into another
                                            character.
                                          </p>
                                        ) : dialogueCharacters.length >
                                          1 ? (
                                          <>
                                            <select
                                              value={
                                                characterMergeTargetId
                                              }
                                              onChange={(event) => {
                                                setCharacterMergeTargetId(
                                                  event.target.value,
                                                );

                                                setCharacterMergeConfirmation(
                                                  false,
                                                );
                                              }}
                                              className="mt-2 w-full rounded-xl border border-white/10 bg-stone-800 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                                            >
                                              <option value="">
                                                Select destination character
                                              </option>

                                              {dialogueCharacters
                                                .filter(
                                                  (candidate) =>
                                                    candidate.id !==
                                                    character.id,
                                                )
                                                .map((candidate) => (
                                                  <option
                                                    key={candidate.id}
                                                    value={candidate.id}
                                                  >
                                                    {candidate.name}
                                                  </option>
                                                ))}
                                            </select>

                                            {characterMergeTargetId &&
                                              !characterMergeConfirmation && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setCharacterMergeConfirmation(
                                                    true,
                                                  )
                                                }
                                                className="mt-2 flex w-full items-center justify-center rounded-xl border border-violet-300/20 bg-violet-400/[0.04] px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-400/10"
                                              >
                                                Prepare merge
                                              </button>
                                            )}

                                            {characterMergeTargetId &&
                                              characterMergeConfirmation && (
                                              <div className="mt-2 rounded-xl border border-violet-300/20 bg-violet-400/[0.05] p-3">
                                                <p className="text-xs font-medium text-violet-200">
                                                  Merge {character.name} into{" "}
                                                  {
                                                    dialogueCharacters.find(
                                                      (candidate) =>
                                                        candidate.id ===
                                                        characterMergeTargetId,
                                                    )?.name
                                                  }
                                                  ?
                                                </p>

                                                <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                                                  Dialogue assignments, aliases,
                                                  notes, role, lock status, and
                                                  voice preferences will be
                                                  transferred. The source profile
                                                  will then be removed.
                                                </p>

                                                <div className="mt-3 grid grid-cols-2 gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setCharacterMergeConfirmation(
                                                        false,
                                                      )
                                                    }
                                                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-400 hover:bg-white/5 hover:text-white"
                                                  >
                                                    Cancel merge
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      mergeCharacterProfiles(
                                                        character.id,
                                                        characterMergeTargetId,
                                                      )
                                                    }
                                                    className="rounded-xl bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/25"
                                                  >
                                                    Merge permanently
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <p className="mt-2 text-xs text-stone-600">
                                            Another character is required
                                            before this profile can be merged.
                                          </p>
                                        )}
                                      </div>

                                      <div className="border-t border-white/10 pt-4">
                                        {characterDraftLocked ? (
                                          <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] p-3">
                                            <p className="text-xs font-medium text-emerald-300">
                                              Locked profile
                                            </p>

                                            <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                                              Unlock and save this profile before
                                              deleting it.
                                            </p>
                                          </div>
                                        ) : characterDeleteCandidateId ===
                                          character.id ? (
                                          <div className="rounded-xl border border-red-400/20 bg-red-400/[0.05] p-3">
                                            <p className="text-xs font-medium text-red-300">
                                              Delete {character.name}?
                                            </p>

                                            <p className="mt-1 text-[10px] leading-relaxed text-stone-500">
                                              {assignedCount > 0
                                                ? `${assignedCount} ${
                                                    assignedCount === 1
                                                      ? "dialogue passage will"
                                                      : "dialogue passages will"
                                                  } become unresolved.`
                                                : "This profile has no assigned dialogue passages."}
                                            </p>

                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setCharacterDeleteCandidateId(
                                                    null,
                                                  )
                                                }
                                                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-stone-400 hover:bg-white/5 hover:text-white"
                                              >
                                                Keep profile
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  deleteCharacterProfile(
                                                    character.id,
                                                  )
                                                }
                                                className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25"
                                              >
                                                Delete permanently
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setCharacterDeleteCandidateId(
                                                character.id,
                                              )
                                            }
                                            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                                          >
                                            <Trash2 size={14} />
                                            Delete character
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate font-serif text-base text-stone-100">
                                              {character.name}
                                            </p>

                                            <span
                                              className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                                                character.role ===
                                                "major"
                                                  ? "bg-amber-200/10 text-amber-200"
                                                  : character.role ===
                                                      "background"
                                                    ? "bg-stone-700 text-stone-400"
                                                    : "bg-sky-300/10 text-sky-200"
                                              }`}
                                            >
                                              {character.role ||
                                                "minor"}
                                            </span>

                                            {character.locked && (
                                              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
                                                Locked
                                              </span>
                                            )}

                                            {character.temporary && (
                                              <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-300">
                                                Temporary
                                              </span>
                                            )}
                                          </div>

                                          <p className="mt-1 text-xs text-stone-500">
                                            {assignedCount}{" "}
                                            {assignedCount === 1
                                              ? "dialogue passage"
                                              : "dialogue passages"}
                                          </p>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            openCharacterEditor(
                                              character,
                                            )
                                          }
                                          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-stone-400 hover:bg-white/10 hover:text-white"
                                        >
                                          Edit
                                        </button>
                                      </div>

                                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-xl bg-black/20 p-3">
                                          <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                            Voice category
                                          </p>

                                          <p className="mt-1 truncate text-stone-300">
                                            {character.voiceCategory ||
                                              "adult-neutral"}
                                          </p>
                                        </div>

                                        <div className="rounded-xl bg-black/20 p-3">
                                          <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                            Browser voice
                                          </p>

                                          <p
                                            className="mt-1 truncate text-stone-300"
                                            title={
                                              voices.find(
                                                (voice) =>
                                                  voice.voiceURI ===
                                                  character.preferredVoiceId,
                                              )?.name ||
                                              "Narrator fallback"
                                            }
                                          >
                                            {voices.find(
                                              (voice) =>
                                                voice.voiceURI ===
                                                character.preferredVoiceId,
                                            )?.name ||
                                              "Narrator fallback"}
                                          </p>
                                        </div>

                                        <div className="col-span-2 rounded-xl bg-black/20 p-3">
                                          <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                            Aliases
                                          </p>

                                          <p className="mt-1 truncate text-stone-300">
                                            {Array.isArray(
                                              character.aliases,
                                            ) &&
                                            character.aliases.length > 0
                                              ? character.aliases.join(
                                                  ", ",
                                                )
                                              : "None"}
                                          </p>
                                        </div>
                                      </div>
                                      {character.notes && (
                                        <p className="mt-3 rounded-xl bg-black/10 px-3 py-2 text-xs leading-relaxed text-stone-400">
                                          {character.notes}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                          <div>
                            <UserRoundCog
                              size={32}
                              className="mx-auto text-stone-700"
                            />

                            <p className="mt-3 text-sm text-stone-400">
                              No characters available
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-stone-600">
                              Analyse dialogue or create a
                              character from Dialogue Review.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-white/10 px-4 py-3">
                      <p className="text-xs leading-relaxed text-stone-600">
                        Locked profiles are protected during
                        later automatic character matching.
                      </p>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {dialogueReviewOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close dialogue review"
                    onClick={() =>
                      setDialogueReviewOpen(
                        false,
                      )
                    }
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                  />

                  <motion.aside
                    initial={{
                      opacity: 0,
                      x: 24,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    exit={{
                      opacity: 0,
                      x: 24,
                    }}
                    className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(94vw,520px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900 text-stone-100 shadow-2xl"
                  >
                    <div className="border-b border-white/10 px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <MessageSquareText
                              size={18}
                              className="shrink-0 text-amber-200"
                            />

                            <h2 className="truncate font-serif text-lg font-semibold">
                              Dialogue review
                            </h2>
                          </div>

                          <p className="mt-1 truncate text-xs text-stone-500">
                            {activeStory?.title}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueReviewOpen(
                              false,
                            )
                          }
                          className="shrink-0 rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                          aria-label="Close dialogue review"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-black/20 p-1">
                        <button
                          type="button"
                          onClick={() =>
                            setDialogueReviewFilter(
                              "all",
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] ${
                            dialogueReviewFilter ===
                            "all"
                              ? "bg-white/10 text-white"
                              : "text-stone-500 hover:text-stone-300"
                          }`}
                        >
                          All
                          <span className="ml-1 text-[9px] opacity-70">
                            {dialogueSegments.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueReviewFilter(
                              "unresolved",
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] ${
                            dialogueReviewFilter ===
                            "unresolved"
                              ? "bg-amber-200/15 text-amber-200"
                              : "text-stone-500 hover:text-stone-300"
                          }`}
                        >
                          Unresolved
                          <span className="ml-1 text-[9px] opacity-70">
                            {
                              unresolvedDialogueCount
                            }
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueReviewFilter(
                              "low-confidence",
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] ${
                            dialogueReviewFilter ===
                            "low-confidence"
                              ? "bg-red-400/10 text-red-300"
                              : "text-stone-500 hover:text-stone-300"
                          }`}
                        >
                          Low
                          <span className="ml-1 text-[9px] opacity-70">
                            {
                              lowConfidenceDialogueCount
                            }
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueReviewFilter(
                              "resolved",
                            )
                          }
                          className={`rounded-lg px-2 py-2 text-[11px] ${
                            dialogueReviewFilter ===
                            "resolved"
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "text-stone-500 hover:text-stone-300"
                          }`}
                        >
                          Resolved
                          <span className="ml-1 text-[9px] opacity-70">
                            {dialogueSegments.length -
                              unresolvedDialogueCount}
                          </span>
                        </button>
                      </div>
                    {dialogueAnalysisError && (
                      <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2">
                        <p className="text-xs leading-relaxed text-red-200">
                          {dialogueAnalysisError}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setDialogueAnalysisError("")
                          }
                          className="shrink-0 rounded-lg p-1 text-red-300 hover:bg-red-400/10"
                          aria-label="Dismiss dialogue error"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                      {filteredDialogueSegments.length >
                      0 ? (
                        <div className="space-y-3">
                          {filteredDialogueSegments.map(
                            (
                              segment,
                              segmentIndex,
                            ) => {
                              const confidence =
                                Math.max(
                                  0,
                                  Math.min(
                                    1,
                                    Number(
                                      segment.confidence,
                                    ) || 0,
                                  ),
                                );

                              const confidencePercent =
                                Math.round(
                                  confidence * 100,
                                );

                              const unresolved =
                                !segment.speakerId &&
                                segment.correctionType !==
                                  "confirmed-unknown";

                              const confirmedUnknown =
                                segment.correctionType ===
                                "confirmed-unknown";

                              const lowConfidence =
                                !segment.manuallyCorrected &&
                                confidence < 0.7;

                              return (
                                <div
                                  key={segment.id}
                                  className={`rounded-2xl border p-4 ${
                                    unresolved
                                      ? "border-amber-300/25 bg-amber-200/[0.04]"
                                      : lowConfidence
                                        ? "border-red-300/20 bg-red-400/[0.03]"
                                        : "border-white/10 bg-white/[0.03]"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                                          Dialogue{" "}
                                          {segmentIndex +
                                            1}
                                        </span>

                                        {unresolved && (
                                          <span className="flex items-center gap-1 rounded-full bg-amber-200/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-200">
                                            <ShieldAlert
                                              size={10}
                                            />
                                            Unresolved
                                          </span>
                                        )}

                                        {!unresolved &&
                                          lowConfidence && (
                                          <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-red-300">
                                            Low confidence
                                          </span>
                                        )}
                                        {confirmedUnknown && (
                                          <span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-200">
                                            Confirmed unknown
                                          </span>
                                        )}
                                      </div>

                                      <p className="mt-2 font-serif text-base leading-relaxed text-stone-100">
                                        {segment.text}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        goToDialogueSegment(
                                          segment,
                                        )
                                      }
                                      className="shrink-0 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-stone-400 hover:bg-white/10 hover:text-white"
                                    >
                                      Go to
                                    </button>
                                  </div>

                                  <div className="mt-4 grid grid-cols-2 gap-2">
                                    <div className="rounded-xl bg-black/20 p-3">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                        Speaker
                                      </p>

                                      <p
                                        className={`mt-1 truncate text-sm ${
                                          unresolved
                                            ? "text-amber-200"
                                            : confirmedUnknown
                                              ? "text-sky-200"
                                              : "text-stone-200"
                                        }`}
                                      >
                                        {segment.speakerName ||
                                          "Unknown speaker"}
                                      </p>
                                    </div>

                                    <div className="rounded-xl bg-black/20 p-3">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                        Confidence
                                      </p>

                                      <div className="mt-1 flex items-center gap-2">
                                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/5">
                                          <div
                                            className={`h-full rounded-full ${
                                              confidence >=
                                              0.85
                                                ? "bg-emerald-400"
                                                : confidence >=
                                                    0.7
                                                  ? "bg-amber-300"
                                                  : "bg-red-400"
                                            }`}
                                            style={{
                                              width: `${confidencePercent}%`,
                                            }}
                                          />
                                        </div>

                                        <span className="shrink-0 text-xs text-stone-400">
                                          {
                                            confidencePercent
                                          }
                                          %
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {segment.attributionText && (
                                    <div className="mt-2 rounded-xl bg-black/10 px-3 py-2">
                                      <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-600">
                                        Attribution evidence
                                      </p>

                                      <p className="mt-1 text-xs text-stone-400">
                                        {
                                          segment.attributionText
                                        }
                                      </p>
                                    </div>
                                  )}

                                  {segment.manuallyCorrected && (
                                    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] px-3 py-2">
                                      <p className="text-[10px] font-medium text-emerald-300">
                                        Manually confirmed
                                      </p>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          revertDialogueCorrection(
                                            segment.id,
                                          )
                                        }
                                        className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-stone-400 hover:bg-white/10 hover:text-white"
                                      >
                                        Revert correction
                                      </button>
                                    </div>
                                  )}

                                  <div className="mt-3 border-t border-white/10 pt-3">
                                    {dialogueEditingSegmentId ===
                                    segment.id ? (
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                                          Assign speaker
                                        </p>

                                        {dialogueCharacters.length >
                                        0 ? (
                                          <div className="grid grid-cols-2 gap-2">
                                            {dialogueCharacters.map(
                                              (character) => (
                                                <button
                                                  key={character.id}
                                                  type="button"
                                                  onClick={() =>
                                                    correctDialogueSegment(
                                                      segment.id,
                                                      {
                                                        type:
                                                          "speaker",
                                                        speakerId:
                                                          character.id,
                                                      },
                                                    )
                                                  }
                                                  className="truncate rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-stone-300 hover:bg-white/10 hover:text-white"
                                                  title={
                                                    character.name
                                                  }
                                                >
                                                  {character.name}
                                                </button>
                                              ),
                                            )}
                                          </div>
                                        ) : (
                                          <p className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-stone-500">
                                            No characters have been detected yet.
                                          </p>
                                        )}

                                        <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">
                                            Create character
                                          </p>

                                          <div className="mt-2 flex gap-2">
                                            <input
                                              type="text"
                                              value={
                                                dialogueNewCharacterName
                                              }
                                              onChange={(event) =>
                                                setDialogueNewCharacterName(
                                                  event.target.value,
                                                )
                                              }
                                              onKeyDown={(event) => {
                                                if (
                                                  event.key === "Enter"
                                                ) {
                                                  event.preventDefault();

                                                  createDialogueCharacter(
                                                    segment.id,
                                                  );
                                                }
                                              }}
                                              placeholder="Character name"
                                              maxLength={80}
                                              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none placeholder:text-stone-600 focus:border-amber-300/40"
                                            />

                                            <button
                                              type="button"
                                              onClick={() =>
                                                createDialogueCharacter(
                                                  segment.id,
                                                )
                                              }
                                              disabled={
                                                !dialogueNewCharacterName
                                                  .trim()
                                              }
                                              className="shrink-0 rounded-xl bg-amber-200 px-3 py-2 text-xs font-medium text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                              Create
                                            </button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              correctDialogueSegment(
                                                segment.id,
                                                {
                                                  type: "unknown",
                                                },
                                              )
                                            }
                                            className="rounded-xl border border-amber-300/20 bg-amber-200/[0.04] px-3 py-2 text-xs text-amber-200 hover:bg-amber-200/10"
                                          >
                                            Confirm unknown
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              correctDialogueSegment(
                                                segment.id,
                                                {
                                                  type: "narration",
                                                },
                                              )
                                            }
                                            className="rounded-xl border border-sky-300/20 bg-sky-300/[0.04] px-3 py-2 text-xs text-sky-200 hover:bg-sky-300/10"
                                          >
                                            Mark narration
                                          </button>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDialogueEditingSegmentId(
                                              null,
                                            );

                                            setDialogueNewCharacterName("");
                                            setDialogueAnalysisError("");
                                          }}
                                          className="w-full rounded-xl px-3 py-2 text-xs text-stone-500 hover:bg-white/5 hover:text-stone-300"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDialogueNewCharacterName("");
                                          setDialogueAnalysisError("");

                                          setDialogueEditingSegmentId(
                                            segment.id,
                                          );
                                        }}
                                        className="flex w-full items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-stone-300 hover:bg-white/10 hover:text-white"
                                      >
                                        Correct speaker
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <div className="grid min-h-60 place-items-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                          <div>
                            <MessageSquareText
                              size={32}
                              className="mx-auto text-stone-700"
                            />

                            <p className="mt-3 text-sm text-stone-400">
                              No matching dialogue
                            </p>

                            <p className="mt-1 text-xs leading-relaxed text-stone-600">
                              Try another filter or
                              analyse the story again.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-white/10 px-4 py-3">
                      <p className="text-xs leading-relaxed text-stone-600">
                        Create characters, assign speakers,
                        confirm unknown passages, or revert
                        manual corrections.
                      </p>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {statisticsPanelOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close library statistics"
                    onClick={() =>
                      setStatisticsPanelOpen(false)
                    }
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
                  />

                  <motion.aside
                    initial={{
                      opacity: 0,
                      x: 24,
                    }}
                    animate={{
                      opacity: 1,
                      x: 0,
                    }}
                    exit={{
                      opacity: 0,
                      x: 24,
                    }}
                    className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(92vw,400px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900 text-stone-100 shadow-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <BarChart3
                            size={18}
                            className="text-amber-200"
                          />

                          <h2 className="font-serif text-lg font-semibold">
                            Library statistics
                          </h2>
                        </div>

                        <p className="mt-1 text-xs text-stone-500">
                          Your local reading activity
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setStatisticsPanelOpen(false)
                        }
                        className="rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                        aria-label="Close library statistics"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-2xl font-semibold text-amber-100">
                            {
                              libraryStatistics.totalStories
                            }
                          </p>

                          <p className="mt-1 text-xs text-stone-500">
                            Stories
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-2xl font-semibold text-amber-100">
                            {
                              libraryStatistics.totalSessions
                            }
                          </p>

                          <p className="mt-1 text-xs text-stone-500">
                            Reading sessions
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-2xl font-semibold text-amber-100">
                            {formatReadingTime(
                              libraryStatistics
                                .totalReadingTime,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-stone-500">
                            Approximate reading time
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-2xl font-semibold text-amber-100">
                            {
                              libraryStatistics.totalBookmarks
                            }
                          </p>

                          <p className="mt-1 text-xs text-stone-500">
                            Bookmarks
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          Reading status
                        </h3>

                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-stone-300">
                              <span className="h-2.5 w-2.5 rounded-full bg-stone-600" />
                              Unread
                            </span>

                            <span className="text-sm font-medium text-stone-100">
                              {
                                libraryStatistics.unreadStories
                              }
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-stone-300">
                              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                              Reading
                            </span>

                            <span className="text-sm font-medium text-stone-100">
                              {
                                libraryStatistics.readingStories
                              }
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-stone-300">
                              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                              Finished
                            </span>

                            <span className="text-sm font-medium text-stone-100">
                              {
                                libraryStatistics.finishedStories
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      {libraryStatistics
                        .mostReadStory &&
                        libraryStatistics
                          .mostReadStory
                          .readingTimeSeconds >
                          0 && (
                        <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4">
                          <div className="flex items-start gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-200/10 text-amber-200">
                              <Clock3 size={18} />
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                                Most read
                              </p>

                              <p className="mt-1 truncate font-serif text-base text-stone-100">
                                {
                                  libraryStatistics
                                    .mostReadStory
                                    .title
                                }
                              </p>

                              <p className="mt-1 text-xs text-stone-500">
                                {formatReadingTime(
                                  libraryStatistics
                                    .mostReadStory
                                    .readingTimeSeconds,
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="mt-4 text-xs leading-relaxed text-stone-600">
                        Reading time is counted in
                        30-second intervals while a book
                        is open and the browser tab is
                        visible.
                      </p>
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
      <AnimatePresence>
        {tableOfContentsOpen && (
          <>
            <button
              type="button"
              aria-label="Close table of contents"
              onClick={() =>
                setTableOfContentsOpen(false)
              }
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{
                opacity: 0,
                x: 24,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
                x: 24,
              }}
              className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900 text-stone-100 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <ListTree
                      size={18}
                      className="text-amber-200"
                    />

                    <h2 className="font-serif text-lg font-semibold">
                      Contents
                    </h2>
                  </div>

                  <p className="mt-1 max-w-[270px] truncate text-xs text-stone-500">
                    {activeStory?.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setTableOfContentsOpen(false)
                  }
                  className="rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                  aria-label="Close table of contents"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {chapters.length > 0 ? (
                  <div className="space-y-1.5">
                    {chapters.map(
                      (chapter, index) => {
                        const chapterActive =
                          activeChapter?.id ===
                          chapter.id;

                        return (
                          <button
                            key={chapter.id}
                            type="button"
                            onClick={() =>
                              goToChapter(
                                chapter,
                              )
                            }
                            className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                              chapterActive
                                ? "border-amber-300/60 bg-amber-200/15 shadow-sm shadow-amber-950/20"
                                : "border-transparent hover:bg-white/5"
                            }`}
                          >
                            <span
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-semibold ${
                                chapterActive
                                  ? "bg-amber-200 text-stone-900"
                                  : "bg-white/5 text-stone-500"
                              }`}
                            >
                              {index + 1}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-stone-100">
                                {chapter.title}
                              </span>

                              <span className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                                <span>
                                  Page{" "}
                                  {chapter.pageNumber}
                                </span>

                                {chapterActive && (
                                  <span className="rounded-full bg-amber-200/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
                                    Current
                                  </span>
                                )}
                              </span>
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                    <div>
                      <ListTree
                        size={30}
                        className="mx-auto text-stone-600"
                      />

                      <p className="mt-3 text-sm text-stone-400">
                        No chapters detected
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-stone-600">
                        Use headings such as Chapter One,
                        Chapter 1, Part Two, Prologue, or
                        Epilogue.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {bookmarkPanelOpen && (
          <>
            <button
              type="button"
              aria-label="Close bookmarks"
              onClick={() =>
                setBookmarkPanelOpen(false)
              }
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            />

            <motion.aside
              initial={{
                opacity: 0,
                x: 24,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              exit={{
                opacity: 0,
                x: 24,
              }}
              className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-stone-900 text-stone-100 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h2 className="font-serif text-lg font-semibold">
                    Bookmarks
                  </h2>

                  <p className="text-xs text-stone-500">
                    {activeStory?.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setBookmarkPanelOpen(false)
                  }
                  className="rounded-full p-2 text-stone-400 hover:bg-white/10 hover:text-white"
                  aria-label="Close bookmarks"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {(activeStory?.bookmarks || [])
                  .length > 0 ? (
                  <div className="space-y-2">
                    {(activeStory.bookmarks || [])
                      .slice()
                      .sort(
                        (first, second) =>
                          first.createdAt -
                          second.createdAt,
                      )
                      .map((bookmark) => (
                        <div
                          key={bookmark.id}
                          className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                        >
                          {bookmarkBeingRenamed ===
                          bookmark.id ? (
                            <>
                              <input
                                autoFocus
                                value={bookmarkName}
                                onChange={(event) =>
                                  setBookmarkName(
                                    event.target.value,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (
                                    event.key ===
                                    "Enter"
                                  ) {
                                    saveBookmarkName();
                                  }

                                  if (
                                    event.key ===
                                    "Escape"
                                  ) {
                                    setBookmarkBeingRenamed(
                                      null,
                                    );

                                    setBookmarkName("");
                                  }
                                }}
                                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/40"
                              />

                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={
                                    saveBookmarkName
                                  }
                                  className="flex-1 rounded-xl bg-amber-200 px-3 py-2 text-sm font-medium text-stone-900"
                                >
                                  Save
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setBookmarkBeingRenamed(
                                      null,
                                    );

                                    setBookmarkName("");
                                  }}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  goToBookmark(
                                    bookmark,
                                  )
                                }
                                className="w-full text-left"
                              >
                                <p className="line-clamp-3 text-sm leading-relaxed text-stone-200">
                                  {bookmark.label}
                                </p>

                                <p className="mt-2 text-xs text-stone-500">
                                  Saved from page{" "}
                                  {bookmark.pageNumber}
                                </p>
                              </button>

                              <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    beginRenamingBookmark(
                                      bookmark,
                                    )
                                  }
                                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:bg-white/10 hover:text-white"
                                >
                                  <Pencil size={13} />
                                  Rename
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteBookmark(
                                      bookmark.id,
                                    )
                                  }
                                  className="ml-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                                >
                                  <Trash2 size={13} />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                    <div>
                      <Bookmark
                        size={30}
                        className="mx-auto text-stone-600"
                      />

                      <p className="mt-3 text-sm text-stone-400">
                        No bookmarks yet
                      </p>

                      <p className="mt-1 text-xs leading-relaxed text-stone-600">
                        Select a sentence and choose
                        Add bookmark.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectionMenu && selectedPosition && (
        <>
          <button
            type="button"
            aria-label="Close sentence menu"
            onClick={() =>
              setSelectionMenu(null)
            }
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />

          <motion.div
            initial={{
              opacity: 0,
              y: -4,
              scale: 0.97,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: -4,
              scale: 0.97,
            }}
            className="fixed z-50 min-w-[210px] rounded-2xl border border-white/10 bg-stone-900 p-2 text-stone-100 shadow-2xl"
            style={{
              left: Math.min(
                selectionMenu.x,
                window.innerWidth - 230,
              ),
              top: Math.min(
                selectionMenu.y,
                window.innerHeight - 170,
              ),
              transform: "translateX(-50%)",
            }}
          >
            <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              Selected sentence
            </p>

            <button
              type="button"
              onClick={narrateFromSelection}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <Play size={16} />
              Narrate from here
            </button>

            <button
              type="button"
              onClick={
                setSelectedAsReadingPosition
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <MapPin size={16} />
              Set reading position
            </button>
            <button
              type="button"
              onClick={addBookmarkFromSelection}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <BookmarkPlus size={16} />
              Add bookmark
            </button>
            <button
              type="button"
              onClick={
                returnToSelectedSentence
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10"
            >
              <Bookmark size={16} />
              Return to sentence
            </button>

            <button
              type="button"
              onClick={clearSentenceSelection}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-stone-400 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
              Clear selection
            </button>
          </motion.div>
        </>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {modal?.type ===
        "narration-settings" && (
        <Modal
          title="Narration settings"
          onClose={() =>
            setModal(null)
          }
        >
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Voice
              </label>

              <select
                value={selectedVoiceId}
                onChange={(event) => {
                  if (
                    narrationStatus !==
                    "idle"
                  ) {
                    stopNarration();
                  }

                  setSelectedVoiceId(
                    event.target.value,
                  );
                }}
                className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-amber-700"
              >
                {voices.length > 0 ? (
                  voices.map((voice) => (
                    <option
                      key={voice.voiceURI}
                      value={voice.voiceURI}
                    >
                      {voice.name} (
                      {voice.lang})
                    </option>
                  ))
                ) : (
                  <option value="">
                    No voices available
                  </option>
                )}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Speed
                </label>

                <span className="text-sm font-medium text-stone-700">
                  {narrationRate}x
                </span>
              </div>

              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={narrationRate}
                onChange={(event) => {
                  const nextRate = Number(
                    event.target.value,
                  );

                  if (
                    narrationStatus !==
                    "idle"
                  ) {
                    stopNarration();
                  }

                  setNarrationRate(
                    nextRate,
                  );
                }}
                className="mt-3 w-full accent-amber-700"
                aria-label="Narration speed"
              />

              <div className="mt-1 flex justify-between text-xs text-stone-400">
                <span>0.5x</span>
                <span>1x</span>
                <span>1.5x</span>
                <span>2x</span>
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4">
              <div>
                <p className="text-sm font-medium text-stone-900">
                  Word highlighting
                </p>

                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                  Highlight the current spoken
                  word when the browser voice
                  provides word boundaries.
                </p>
              </div>

              <input
                type="checkbox"
                checked={
                  narrationWordHighlightEnabled
                }
                onChange={(event) =>
                  setNarrationWordHighlightEnabled(
                    event.target.checked,
                  )
                }
                className="h-5 w-5 shrink-0 accent-amber-700"
              />
            </label>

            <div className="rounded-2xl bg-stone-100 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Status
                </span>

                <span className="text-sm font-medium text-stone-800">
                  {narrationStatusLabel}
                </span>
              </div>

              {narrationSpeaker && (
                <div className="mt-3 space-y-3 border-t border-stone-200 pt-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Speaker
                    </span>

                    <span className="text-sm font-medium text-stone-800">
                      {
                        narrationSpeaker.speakerName
                      }
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Passage type
                    </span>

                    <span className="text-sm font-medium capitalize text-stone-800">
                      {
                        narrationSpeaker.type
                      }
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Voice source
                    </span>

                    <span className="text-right text-sm font-medium text-stone-800">
                      {narrationSpeaker
                        .preferredVoiceId
                        ? "Character voice"
                        : narrationSpeaker
                              .speakerId
                          ? "Category fallback"
                          : "Narrator voice"}
                    </span>
                  </div>
                </div>
              )}

              {narrationPreview && (
                <p className="mt-3 line-clamp-4 font-serif text-sm leading-relaxed text-stone-700">
                  {narrationPreview}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  returnToNarrationPosition();
                  setModal(null);
                }}
                disabled={
                  !activeStory
                    ?.narrationPosition &&
                  !narrationPosition
                }
                className="flex items-center justify-center gap-2 rounded-2xl border border-stone-300 px-3 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MapPin size={16} />
                Return
              </button>

              <button
                type="button"
                onClick={() => {
                  restartNarration();
                  setModal(null);
                }}
                disabled={
                  !activeStory?.text
                }
                className="flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-3 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={16} />
                Restart
              </button>
            </div>
          </div>
        </Modal>
      )}
        {modal?.type === "new-folder" && (
          <Modal title="Create folder" onClose={() => setModal(null)}>
            <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createFolder()} placeholder="Folder name" className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700" />
            <button onClick={createFolder} className="mt-4 w-full rounded-2xl bg-stone-900 px-4 py-3 font-medium text-white">Create folder</button>
          </Modal>
        )}

        {modal?.type === "folder-actions" && (
          <Modal title="Folder options" onClose={() => setModal(null)}>
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">Folder name</label>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700" />
            <button onClick={renameFolder} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 font-medium text-white"><Pencil size={16} /> Save name</button>
            <button onClick={() => { deleteFolder(modal.id); setModal(null); }} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-medium text-red-700 hover:bg-red-50"><Trash2 size={16} /> Delete folder</button>
            <p className="mt-2 text-center text-xs text-stone-500">Stories in a deleted folder are moved to Unfiled.</p>
          </Modal>
        )}

        {modal?.type ===
          "story-actions" && (
          <Modal
            title="Story details"
            onClose={() =>
              setModal(null)
            }
          >
            <div className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Title
                </label>

                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) =>
                    setDraftName(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      saveStoryDetails();
                    }
                  }}
                  placeholder="Story title"
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Author
                </label>

                <input
                  value={draftAuthor}
                  onChange={(event) =>
                    setDraftAuthor(
                      event.target.value,
                    )
                  }
                  placeholder="Author name"
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Description
                </label>

                <textarea
                  value={draftDescription}
                  onChange={(event) =>
                    setDraftDescription(
                      event.target.value,
                    )
                  }
                  placeholder="Short description or personal notes"
                  rows={4}
                  maxLength={1000}
                  className="mt-2 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm leading-relaxed text-stone-900 outline-none focus:border-amber-700"
                />

                <p className="mt-1 text-right text-xs text-stone-400">
                  {draftDescription.length}
                  /1000
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Tags
                </label>

                <input
                  value={draftTags}
                  onChange={(event) =>
                    setDraftTags(
                      event.target.value,
                    )
                  }
                  placeholder="fantasy, short story, favourite"
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
                />

                <p className="mt-1 text-xs leading-relaxed text-stone-400">
                  Separate tags with commas. A
                  maximum of 20 tags will be saved.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Reading status
                </label>

                <select
                  value={
                    draftReadingStatus
                  }
                  onChange={(event) =>
                    setDraftReadingStatus(
                      event.target.value,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-amber-700"
                >
                  <option value="unread">
                    Unread
                  </option>

                  <option value="reading">
                    Reading
                  </option>

                  <option value="finished">
                    Finished
                  </option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Move to folder
                </label>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  {data.folders
                    .filter(
                      (folder) =>
                        folder.id !==
                        "all-stories",
                    )
                    .map((folder) => {
                      const selected =
                        draftFolderId ===
                        folder.id;

                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() =>
                            setDraftFolderId(
                              folder.id,
                            )
                          }
                          className={`truncate rounded-xl border px-3 py-2 text-sm ${
                            selected
                              ? "border-amber-700 bg-amber-50 text-amber-900"
                              : "border-stone-300 text-stone-700 hover:bg-stone-100"
                          }`}
                        >
                          {folder.name}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="border-t border-stone-200 pt-4">
                {modal?.id === activeStory?.id && (
                  <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900">
                          Dialogue analysis
                        </p>

                        <p className="mt-1 text-xs text-stone-500">
                          {activeStory
                            ?.dialogueAnalysis
                            ?.analysedAt
                            ? "Analysis available"
                            : "Not analysed"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={
                          analyseActiveStoryDialogue
                        }
                        disabled={
                          dialogueAnalysisRunning
                        }
                        className="shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50"
                      >
                        {dialogueAnalysisRunning
                          ? "Analysing..."
                          : activeStory
                                ?.dialogueAnalysis
                                ?.analysedAt
                            ? "Analyse again"
                            : "Analyse"}
                      </button>
                    </div>

                    {activeStory
                      ?.dialogueAnalysis
                      ?.analysedAt && (
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white p-2">
                          <p className="text-base font-semibold text-stone-900">
                            {activeStory
                              .dialogueAnalysis
                              .statistics
                              ?.dialogueSegments ??
                              0}
                          </p>

                          <p className="text-[10px] uppercase tracking-wide text-stone-400">
                            Dialogue
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-2">
                          <p className="text-base font-semibold text-stone-900">
                            {activeStory
                              .dialogueAnalysis
                              .characters
                              ?.length ?? 0}
                          </p>

                          <p className="text-[10px] uppercase tracking-wide text-stone-400">
                            Speakers
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-2">
                          <p className="text-base font-semibold text-amber-700">
                            {activeStory
                              .dialogueAnalysis
                              .statistics
                              ?.unresolvedDialogue ??
                              0}
                          </p>

                          <p className="text-[10px] uppercase tracking-wide text-stone-400">
                            Unresolved
                          </p>
                        </div>
                      </div>
                    )}
                    {activeStory
                      ?.dialogueAnalysis
                      ?.analysedAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setDialogueReviewFilter(
                            unresolvedDialogueCount > 0
                              ? "unresolved"
                              : "all",
                          );

                          setModal(null);
                          setBookmarkPanelOpen(false);
                          setTableOfContentsOpen(false);
                          setStatisticsPanelOpen(false);
                          setCharacterManagerOpen(false);
                          setDialogueReviewOpen(true);
                        }}
                        disabled={
                          dialogueSegments.length === 0
                        }
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <MessageSquareText
                          size={16}
                        />

                        Review dialogue

                        {unresolvedDialogueCount >
                          0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                            {
                              unresolvedDialogueCount
                            }
                          </span>
                        )}
                      </button>
                    )}

                    {dialogueAnalysisError && (
                      <p className="mt-3 text-xs leading-relaxed text-red-700">
                        {dialogueAnalysisError}
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={
                    saveStoryDetails
                  }
                  disabled={
                    !draftName.trim()
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Pencil size={16} />
                  Save details
                </button>

                <button
                  type="button"
                  onClick={() =>
                    deleteStory(
                      modal.id,
                    )
                  }
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Delete story
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
