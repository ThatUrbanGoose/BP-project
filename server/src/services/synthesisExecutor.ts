import path from "node:path";

import {
  environment,
} from "../config/environment.js";

import {
  generateKokoroPreview,
  WorkerRequestError,
} from "./workerClient.js";

import {
  generateQwenPreview,
  QwenWorkerRequestError,
} from "./qwenWorkerClient.js";

import {
  getSynthesisCacheEntry,
  writeSynthesisCacheEntry,
} from "./synthesisCache.js";

import type {
  CanonicalSynthesisRequest,
} from "./synthesisCache.js";

import {
  setSynthesisJobExecutor,
  SynthesisExecutionError,
  throwIfCancelled,
} from "./synthesisQueue.js";

import type {
  SynthesisExecutionContext,
  SynthesisJobResult,
} from "./synthesisQueue.js";

import {
  ensureSynthesisStorageCapacity,
} from "./synthesisStorage.js";


function getCachedAudioUrl(
  cacheKey: string,
): string {
  return (
    "/api/synthesis/cache/"
    + cacheKey
    + "/audio"
  );
}

function getCachedTimelineUrl(
  cacheKey: string,
): string {
  return (
    "/api/synthesis/cache/"
    + cacheKey
    + "/timeline"
  );
}

function getKokoroSourcePath(
  outputFilename: string,
): string {
  return path.resolve(
    environment
      .directories
      .audioCache,

    "kokoro",

    outputFilename,
  );
}


function getQwenSourcePath(
  outputFilename: string,
): string {
  return path.resolve(
    environment
      .directories
      .audioCache,

    "qwen3-tts",

    outputFilename,
  );
}

function classifySynthesisError(
  error: unknown,
): SynthesisExecutionError {
  if (
    error instanceof
    WorkerRequestError
  ) {
    const statusCode =
      error.statusCode;

    const retryable =
      error.code ===
        "WORKER_UNAVAILABLE"
      || error.code ===
        "WORKER_TIMEOUT"
      || statusCode === 409
      || (
        statusCode !== undefined
        && statusCode >= 500
      );

    return new SynthesisExecutionError({
      code:
        error.code,

      message:
        error.message,

      retryable,
    });
  }

  if (
    error instanceof
    QwenWorkerRequestError
  ) {
    const statusCode =
      error.statusCode;

    const retryable =
      error.code ===
        "QWEN_WORKER_UNAVAILABLE"
      || error.code ===
        "QWEN_WORKER_TIMEOUT"
      || statusCode === 409
      || (
        statusCode !== undefined
        && statusCode >= 500
      );

    return new SynthesisExecutionError({
      code:
        error.code,

      message:
        error.message,

      retryable,
    });
  }

  if (
    error instanceof
    SynthesisExecutionError
  ) {
    return error;
  }

  if (
    error instanceof Error
  ) {
    return new SynthesisExecutionError({
      code:
        "SYNTHESIS_FAILED",

      message:
        error.message,

      retryable:
        false,
    });
  }

  return new SynthesisExecutionError({
    code:
      "SYNTHESIS_FAILED",

    message:
      "The synthesis job failed.",

    retryable:
      false,
  });
}

async function executeKokoroRequest(
  request:
    CanonicalSynthesisRequest,

  context:
    SynthesisExecutionContext,
): Promise<SynthesisJobResult> {
  await context.updateProgress({
    state:
      "loading-model",

    progress:
      25,

    message:
      "Preparing Kokoro.",
  });

  throwIfCancelled(
    context.signal,
  );

  await context.updateProgress({
    state:
      "generating",

    progress:
      45,

    message:
      "Generating Kokoro audio.",
  });

  const generated =
    await generateKokoroPreview({
      text:
        request.synthesisText,

      voice_id:
        request.voice,

      speed:
        request.speed,
    });

  throwIfCancelled(
    context.signal,
  );

  await context.updateProgress({
    state:
      "saving",

    progress:
      85,

    message:
      "Saving Kokoro audio to the cache.",
  });

  const sourceAudioPath =
    getKokoroSourcePath(
      generated.output_file,
    );

  const cacheEntry =
    await writeSynthesisCacheEntry({
      cacheKey:
        context.cacheKey,

      request,

      sourceAudioPath,

      durationSeconds:
        generated.duration_seconds,

      sampleRate:
        generated.sample_rate,
    });

  return {
    cacheKey:
      context.cacheKey,

    audioPath:
      cacheEntry.audioPath,

    audioUrl:
      getCachedAudioUrl(
        context.cacheKey,
      ),

    timelineUrl:
      getCachedTimelineUrl(
        context.cacheKey,
      ),

    cached:
      false,

    timeline:
      cacheEntry.timeline,

    durationSeconds:
      generated.duration_seconds,

    sampleRate:
      generated.sample_rate,
  };
}


async function executeQwenRequest(
  request:
    CanonicalSynthesisRequest,

  context:
    SynthesisExecutionContext,
): Promise<SynthesisJobResult> {
  await context.updateProgress({
    state:
      "loading-model",

    progress:
      20,

    message:
      "Loading Qwen3-TTS.",
  });

  throwIfCancelled(
    context.signal,
  );

  await context.updateProgress({
    state:
      "generating",

    progress:
      40,

    message:
      "Generating expressive Qwen audio.",
  });

  const generated =
    await generateQwenPreview({
      text:
        request.synthesisText,

      speaker:
        request.voice,

      language:
        request.language,

      instruction:
        request.instruction,
    });

  throwIfCancelled(
    context.signal,
  );

  await context.updateProgress({
    state:
      "saving",

    progress:
      85,

    message:
      "Saving Qwen audio to the cache.",
  });

  const sourceAudioPath =
    getQwenSourcePath(
      generated.output_file,
    );

  const cacheEntry =
    await writeSynthesisCacheEntry({
      cacheKey:
        context.cacheKey,

      request,

      sourceAudioPath,

      durationSeconds:
        generated.duration_seconds,

      sampleRate:
        generated.sample_rate,
    });

  return {
    cacheKey:
      context.cacheKey,

    audioPath:
      cacheEntry.audioPath,

    audioUrl:
      getCachedAudioUrl(
        context.cacheKey,
      ),

    timelineUrl:
      getCachedTimelineUrl(
        context.cacheKey,
      ),

    cached:
      false,

    timeline:
      cacheEntry.timeline,

    durationSeconds:
      generated.duration_seconds,

    sampleRate:
      generated.sample_rate,
  };
}


async function executeRealSynthesis(
  request:
    CanonicalSynthesisRequest,

  context:
    SynthesisExecutionContext,
): Promise<SynthesisJobResult> {
  throwIfCancelled(
    context.signal,
  );

  await context.updateProgress({
    state:
      "preparing",

    progress:
      10,

    message:
      "Checking the synthesis cache.",
  });

  const existingCacheEntry =
    await getSynthesisCacheEntry(
      context.cacheKey,
    );

  if (existingCacheEntry) {
    return {
      cacheKey:
        context.cacheKey,

      audioPath:
        existingCacheEntry
          .audioPath,

      audioUrl:
        getCachedAudioUrl(
          context.cacheKey,
        ),

      timelineUrl:
        getCachedTimelineUrl(
          context.cacheKey,
        ),

      cached:
        true,

      timeline:
        existingCacheEntry
          .timeline,

      durationSeconds:
        existingCacheEntry
          .metadata
          .durationSeconds,

      sampleRate:
        existingCacheEntry
          .metadata
          .sampleRate,
    };
  }

  await context.updateProgress({
    state:
        "preparing",

    progress:
        15,

    message:
        "Checking synthesis storage capacity.",
    });

    await ensureSynthesisStorageCapacity();

  throwIfCancelled(
    context.signal,
  );

  if (
    request.engine ===
    "kokoro"
  ) {
    return executeKokoroRequest(
      request,
      context,
    );
  }

  if (
    request.engine ===
    "qwen3-tts"
  ) {
    return executeQwenRequest(
      request,
      context,
    );
  }

  throw new Error(
    "The requested synthesis engine "
    + "is not supported.",
  );
}


export function registerRealSynthesisExecutor():
void {
  setSynthesisJobExecutor(
    async (
      request,
      context,
    ) => {
      try {
        return await executeRealSynthesis(
          request,
          context,
        );

      } catch (error) {
        throw classifySynthesisError(
          error,
        );
      }
    },
  );
}