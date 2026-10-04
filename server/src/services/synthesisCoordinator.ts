import {
  canonicalizeSynthesisRequest,
  createSynthesisCacheKey,
  getSynthesisCacheEntry,
} from "./synthesisCache.js";

import type {
  CanonicalSynthesisRequest,
  SynthesisCacheHit,
} from "./synthesisCache.js";

import {
  enqueueSynthesisJob,
  findPendingJobByCacheKey,
} from "./synthesisQueue.js";

import type {
  SynthesisJob,
} from "./synthesisQueue.js";


export type SynthesisSubmission =
  | {
      type:
        "cache-hit";

      cacheKey:
        string;

      cache:
        SynthesisCacheHit;

      audioUrl:
        string;
    }

  | {
      type:
        "existing-job";

      cacheKey:
        string;

      job:
        SynthesisJob;
    }

  | {
      type:
        "new-job";

      cacheKey:
        string;

      job:
        SynthesisJob;
    };


function getCacheAudioUrl(
  cacheKey: string,
): string {
  return (
    "/api/synthesis/cache/"
    + cacheKey
    + "/audio"
  );
}


export async function submitSynthesisRequest(
  input:
    CanonicalSynthesisRequest,
): Promise<SynthesisSubmission> {
  const request =
    canonicalizeSynthesisRequest(
      input,
    );

  const cacheKey =
    createSynthesisCacheKey(
      request,
    );

  const cacheEntry =
    await getSynthesisCacheEntry(
      cacheKey,
    );

  if (cacheEntry) {
    return {
      type:
        "cache-hit",

      cacheKey,

      cache:
        cacheEntry,

      audioUrl:
        getCacheAudioUrl(
          cacheKey,
        ),
    };
  }

  const existingJob =
    findPendingJobByCacheKey(
      cacheKey,
    );

  if (existingJob) {
    return {
      type:
        "existing-job",

      cacheKey,

      job:
        existingJob,
    };
  }

  const job =
    await enqueueSynthesisJob(
      request,
      cacheKey,
    );

  return {
    type:
      "new-job",

    cacheKey,

    job,
  };
}