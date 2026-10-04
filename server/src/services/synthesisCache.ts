import {
  createHash,
} from "node:crypto";

import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import {
  environment,
} from "../config/environment.js";

import {
  createEstimatedTimeline,
  readSynthesisTimeline,
  writeSynthesisTimeline,
} from "./synthesisTimeline.js";

import type {
  SynthesisTimeline,
} from "./synthesisTimeline.js";


export type SynthesisEngine =
  | "kokoro"
  | "qwen3-tts";


export type CanonicalSynthesisRequest = {
  engine: SynthesisEngine;
  model: string;
  displayText: string;
  synthesisText: string;
  storyId: string | null;
  pronunciationRevision: string;
  voice: string;
  language: string;
  speed: number;
  instruction: string;
  format: "wav";
};


export type SynthesisCacheMetadata = {
  version: 1;
  cacheKey: string;
  request:
    CanonicalSynthesisRequest;
  audioFilename: string;
  audioPath: string;
  createdAt: string;
  lastAccessedAt: string;
  fileSizeBytes: number;
  durationSeconds:
    | number
    | null;
  sampleRate:
    | number
    | null;
};


export type SynthesisCacheHit = {
  cacheKey: string;

  metadata:
    SynthesisCacheMetadata;

  audioPath: string;

  timelinePath: string;

  timeline:
    SynthesisTimeline | null;
};


export type CacheWriteInput = {
  cacheKey: string;
  request:
    CanonicalSynthesisRequest;
  sourceAudioPath: string;
  durationSeconds?:
    number;
  sampleRate?:
    number;
};


function normalizeWhitespace(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /\s+/g,
      " ",
    );
}


function normalizeSpeed(
  speed: number,
): number {
  return Number(
    speed.toFixed(3),
  );
}


export function canonicalizeSynthesisRequest(
  request:
    CanonicalSynthesisRequest,
): CanonicalSynthesisRequest {
  return {
    engine:
      request.engine,

    model:
      normalizeWhitespace(
        request.model,
      ),

    displayText:
      normalizeWhitespace(
        request.displayText,
      ),

    synthesisText:
      normalizeWhitespace(
        request.synthesisText,
      ),

    storyId:
      request.storyId
        ?.trim()
      || null,

    pronunciationRevision:
      request
        .pronunciationRevision
        .trim()
        .toLowerCase(),

    voice:
      normalizeWhitespace(
        request.voice,
      ),

    language:
      normalizeWhitespace(
        request.language,
      ),

    speed:
      normalizeSpeed(
        request.speed,
      ),

    instruction:
      normalizeWhitespace(
        request.instruction,
      ),

    format:
      "wav",
  };
}

export function createSynthesisCacheKey(
  request:
    CanonicalSynthesisRequest,
): string {
  const canonicalRequest =
    canonicalizeSynthesisRequest(
      request,
    );

  const serializedRequest =
    JSON.stringify(
      canonicalRequest,
    );

  return createHash(
    "sha256",
  )
    .update(
      serializedRequest,
      "utf8",
    )
    .digest(
      "hex",
    );
}


function getCacheEntryDirectory(
  cacheKey: string,
): string {
  return path.join(
    environment
      .directories
      .synthesisCache,

    cacheKey.slice(
      0,
      2,
    ),

    cacheKey,
  );
}


function getCachePaths(
  cacheKey: string,
) {
  const entryDirectory =
    getCacheEntryDirectory(
      cacheKey,
    );

  return {
    entryDirectory,

    audioPath: path.join(
      entryDirectory,
      "audio.wav",
    ),

    metadataPath: path.join(
      entryDirectory,
      "metadata.json",
    ),

    timelinePath: path.join(
      entryDirectory,
      "timeline.json",
    ),
  };
}


async function pathExists(
  filePath: string,
): Promise<boolean> {
  try {
    await access(
      filePath,
    );

    return true;

  } catch {
    return false;
  }
}


async function writeJsonAtomically(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath =
    `${filePath}.temporary`;

  const serializedValue =
    JSON.stringify(
      value,
      null,
      2,
    );

  await writeFile(
    temporaryPath,
    serializedValue,
    "utf8",
  );

  await rename(
    temporaryPath,
    filePath,
  );
}


export async function initializeSynthesisCache():
Promise<void> {
  await mkdir(
    environment
      .directories
      .synthesisCache,

    {
      recursive: true,
    },
  );
}


export async function getSynthesisCacheEntry(
  cacheKey: string,
): Promise<
  SynthesisCacheHit
  | null
> {
  const paths =
    getCachePaths(
      cacheKey,
    );

  const audioExists =
    await pathExists(
      paths.audioPath,
    );

  const metadataExists =
    await pathExists(
      paths.metadataPath,
    );

  if (
    !audioExists
    || !metadataExists
  ) {
    return null;
  }

  try {
    const metadataText =
      await readFile(
        paths.metadataPath,
        "utf8",
      );

    const metadata =
      JSON.parse(
        metadataText,
      ) as
        SynthesisCacheMetadata;

    if (
      metadata.cacheKey
      !== cacheKey
    ) {
      return null;
    }

    const audioInformation =
      await stat(
        paths.audioPath,
      );

    if (
      !audioInformation
        .isFile()
      || audioInformation.size
        <= 0
    ) {
      return null;
    }

    const updatedMetadata:
      SynthesisCacheMetadata = {
        ...metadata,

        lastAccessedAt:
          new Date()
            .toISOString(),

        fileSizeBytes:
          audioInformation.size,
      };

    await writeJsonAtomically(
      paths.metadataPath,
      updatedMetadata,
    );

    let timeline =
      await readSynthesisTimeline(
        paths.timelinePath,
      );

    if (
      !timeline
      && updatedMetadata
        .durationSeconds
      && updatedMetadata
        .durationSeconds > 0
    ) {
      timeline =
        createEstimatedTimeline({
          cacheKey,

          displayText:
            updatedMetadata
              .request
              .displayText,

          synthesisText:
            updatedMetadata
              .request
              .synthesisText,

          durationSeconds:
            updatedMetadata
              .durationSeconds,
        });

      await writeSynthesisTimeline(
        paths.timelinePath,
        timeline,
      );
    }

    return {
      cacheKey,

      metadata:
        updatedMetadata,

      audioPath:
        paths.audioPath,

      timelinePath:
        paths.timelinePath,

      timeline,
    };

  } catch {
    return null;
  }
}


export async function writeSynthesisCacheEntry(
  input:
    CacheWriteInput,
): Promise<
  SynthesisCacheHit
> {
  const paths =
    getCachePaths(
      input.cacheKey,
    );

  await mkdir(
    paths.entryDirectory,

    {
      recursive: true,
    },
  );

  const temporaryAudioPath =
    `${paths.audioPath}.temporary`;

  await copyFile(
    input.sourceAudioPath,
    temporaryAudioPath,
  );

  const copiedAudioInformation =
    await stat(
      temporaryAudioPath,
    );

  if (
    !copiedAudioInformation
      .isFile()
    || copiedAudioInformation
      .size <= 0
  ) {
    await unlink(
      temporaryAudioPath,
    ).catch(
      () => undefined,
    );

    throw new Error(
      "The generated audio file "
      + "is empty or invalid.",
    );
  }

  await rename(
    temporaryAudioPath,
    paths.audioPath,
  );

  const currentTime =
    new Date()
      .toISOString();

  const metadata:
    SynthesisCacheMetadata = {
      version: 1,

      cacheKey:
        input.cacheKey,

      request:
        canonicalizeSynthesisRequest(
          input.request,
        ),

      audioFilename:
        "audio.wav",

      audioPath:
        paths.audioPath,

      createdAt:
        currentTime,

      lastAccessedAt:
        currentTime,

      fileSizeBytes:
        copiedAudioInformation
          .size,

      durationSeconds:
        input.durationSeconds
        ?? null,

      sampleRate:
        input.sampleRate
        ?? null,
  };

  await writeJsonAtomically(
    paths.metadataPath,
    metadata,
  );

  const timeline =
    metadata.durationSeconds
    && metadata.durationSeconds > 0
      ? createEstimatedTimeline({
          cacheKey:
            input.cacheKey,

          displayText:
            metadata
              .request
              .displayText,

          synthesisText:
            metadata
              .request
              .synthesisText,

          durationSeconds:
            metadata
              .durationSeconds,
        })
      : null;

  if (timeline) {
    await writeSynthesisTimeline(
      paths.timelinePath,
      timeline,
    );
  }

  return {
    cacheKey:
      input.cacheKey,

    metadata,

    audioPath:
      paths.audioPath,

    timelinePath:
      paths.timelinePath,

    timeline,
  };
}