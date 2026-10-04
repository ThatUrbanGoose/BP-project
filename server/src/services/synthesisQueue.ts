import {
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import {
  environment,
} from "../config/environment.js";

import type {
  CanonicalSynthesisRequest,
} from "./synthesisCache.js";

import type {
  SynthesisTimeline,
} from "./synthesisTimeline.js";

export type SynthesisJobState =
  | "queued"
  | "preparing"
  | "loading-model"
  | "generating"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";


export type SynthesisJobResult = {
  cacheKey: string;
  audioPath: string;
  audioUrl: string;
  timelineUrl: string;
  cached: boolean;
  durationSeconds:
    number | null;
  sampleRate:
    number | null;
  timeline:
    SynthesisTimeline | null;
};


export type SynthesisJobError = {
  code: string;
  message: string;
  retryable: boolean;
};

export class SynthesisExecutionError
  extends Error {
  readonly code:
    string;

  readonly retryable:
    boolean;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
  }) {
    super(options.message);

    this.name =
      "SynthesisExecutionError";

    this.code =
      options.code;

    this.retryable =
      options.retryable;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}


export type SynthesisJob = {
  version: 1;
  id: string;
  cacheKey: string;
  request:
    CanonicalSynthesisRequest;
  state:
    SynthesisJobState;
  progress: number;
  progressMessage: string;
  queuePosition:
    number | null;
  cancellationRequested:
    boolean;
  attempt: number;
  maximumAttempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt:
    string | null;
  completedAt:
    string | null;
  result:
    SynthesisJobResult | null;
  error:
    SynthesisJobError | null;
};


export type QueueProgressUpdate = {
  state:
    | "preparing"
    | "loading-model"
    | "generating"
    | "saving";
  progress: number;
  message: string;
};


export type SynthesisExecutionContext = {
  jobId: string;
  cacheKey: string;
  signal: AbortSignal;
  updateProgress: (
    update:
      QueueProgressUpdate,
  ) => Promise<void>;
};


export type SynthesisJobExecutor = (
  request:
    CanonicalSynthesisRequest,

  context:
    SynthesisExecutionContext,
) => Promise<
  SynthesisJobResult
>;


export type QueueSnapshot = {
  activeJobId:
    string | null;
  queuedJobIds:
    string[];
  totalJobs: number;
  isProcessing: boolean;
};


const jobs =
  new Map<
    string,
    SynthesisJob
  >();


const queuedJobIds:
  string[] = [];


const cancellationControllers =
  new Map<
    string,
    AbortController
  >();


let activeJobId:
  string | null = null;


let processing = false;


let executor:
  SynthesisJobExecutor
  | null = null;


function clampProgress(
  progress: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        progress,
      ),
    ),
  );
}


function getJobPath(
  jobId: string,
): string {
  return path.join(
    environment
      .directories.jobs,

    `${jobId}.json`,
  );
}


async function writeJsonAtomically(
  filePath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath =
    `${filePath}.temporary`;

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


async function persistJob(
  job: SynthesisJob,
): Promise<void> {
  await mkdir(
    environment
      .directories.jobs,

    {
      recursive: true,
    },
  );

  await writeJsonAtomically(
    getJobPath(
      job.id,
    ),

    job,
  );
}


function updateQueuePositions():
void {
  queuedJobIds.forEach(
    (
      jobId,
      index,
    ) => {
      const job =
        jobs.get(
          jobId,
        );

      if (!job) {
        return;
      }

      job.queuePosition =
        index + 1;
    },
  );
}



async function persistQueuedJobs():
Promise<void> {
  await Promise.all(
    queuedJobIds.map(
      async (
        jobId,
      ) => {
        const job =
          jobs.get(
            jobId,
          );

        if (job) {
          await persistJob(
            job,
          );
        }
      },
    ),
  );
}


function isTerminalState(
  state:
    SynthesisJobState,
): boolean {
  return (
    state === "completed"
    || state === "failed"
    || state === "cancelled"
  );
}


function isCancellationError(
  error: unknown,
): boolean {
  if (
    error instanceof Error
  ) {
    return (
      error.name ===
        "AbortError"
      || error.message ===
        "SYNTHESIS_CANCELLED"
    );
  }

  return false;
}

function getExecutionErrorDetails(
  error: unknown,
): SynthesisJobError {
  if (
    error instanceof
    SynthesisExecutionError
  ) {
    return {
      code:
        error.code,

      message:
        error.message,

      retryable:
        error.retryable,
    };
  }

  if (
    error instanceof Error
  ) {
    return {
      code:
        "SYNTHESIS_FAILED",

      message:
        error.message,

      retryable:
        false,
    };
  }

  return {
    code:
      "SYNTHESIS_FAILED",

    message:
      "The synthesis job failed.",

    retryable:
      false,
  };
}


function getRetryDelayMilliseconds(
  completedAttempt:
    number,
): number {
  return (
    1000
    * Math.pow(
      2,
      completedAttempt - 1,
    )
  );
}


function waitForRetry(
  milliseconds:
    number,

  signal:
    AbortSignal,
): Promise<void> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      if (signal.aborted) {
        reject(
          createCancellationError(),
        );

        return;
      }

      const timeout =
        setTimeout(
          () => {
            signal.removeEventListener(
              "abort",
              handleAbort,
            );

            resolve();
          },
          milliseconds,
        );

      function handleAbort():
      void {
        clearTimeout(
          timeout,
        );

        signal.removeEventListener(
          "abort",
          handleAbort,
        );

        reject(
          createCancellationError(),
        );
      }

      signal.addEventListener(
        "abort",
        handleAbort,
        {
          once: true,
        },
      );
    },
  );
}

function createCancellationError():
Error {
  const error =
    new Error(
      "SYNTHESIS_CANCELLED",
    );

  error.name =
    "AbortError";

  return error;
}


export function throwIfCancelled(
  signal: AbortSignal,
): void {
  if (signal.aborted) {
    throw createCancellationError();
  }
}


export function setSynthesisJobExecutor(
  jobExecutor:
    SynthesisJobExecutor,
): void {
  executor =
    jobExecutor;
}


export async function initializeSynthesisQueue():
Promise<void> {
  await mkdir(
    environment
      .directories.jobs,

    {
      recursive: true,
    },
  );

  const filenames =
    await readdir(
      environment
        .directories.jobs,
    );

  for (
    const filename
    of filenames
  ) {
    if (
      !filename.endsWith(
        ".json",
      )
    ) {
      continue;
    }

    const filePath =
      path.join(
        environment
          .directories.jobs,

        filename,
      );

    try {
      const jobText =
        await readFile(
          filePath,
          "utf8",
        );

      const job =
        JSON.parse(
          jobText,
        ) as SynthesisJob;

      if (
        job.version !== 1
        || !job.id
      ) {
        continue;
      }

      if (
        !isTerminalState(
          job.state,
        )
      ) {
        const timestamp =
          new Date()
            .toISOString();

        job.state =
          "failed";

        job.progressMessage =
          "The application stopped before the job completed.";

        job.queuePosition =
          null;

        job.updatedAt =
          timestamp;

        job.completedAt =
          timestamp;

        job.error = {
          code:
            "JOB_INTERRUPTED",

          message:
            "The application stopped before the synthesis job completed.",

          retryable:
            true,
        };

        await persistJob(
          job,
        );
      }

      jobs.set(
        job.id,
        job,
      );

    } catch {
      continue;
    }
  }
}


export async function enqueueSynthesisJob(
  request:
    CanonicalSynthesisRequest,

  cacheKey: string,
): Promise<SynthesisJob> {
  const timestamp =
    new Date()
      .toISOString();

  const job:
    SynthesisJob = {
      version: 1,

      id:
        randomUUID(),

      cacheKey,

      request,

      state:
        "queued",

      progress: 0,

      progressMessage:
        "Waiting in the synthesis queue.",

      queuePosition:
        queuedJobIds.length + 1,

      cancellationRequested:
        false,

      attempt: 0,

      maximumAttempts: 3,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,

      startedAt:
        null,

      completedAt:
        null,

      result:
        null,

      error:
        null,
  };

  jobs.set(
    job.id,
    job,
  );

  queuedJobIds.push(
    job.id,
  );

  updateQueuePositions();

  await persistJob(
    job,
  );

  void processQueue();

  return job;
}

export function findPendingJobByCacheKey(
  cacheKey: string,
): SynthesisJob | null {
  for (
    const job
    of jobs.values()
  ) {
    if (
      job.cacheKey
      !== cacheKey
    ) {
      continue;
    }

    if (
      job.state === "queued"
      || job.state === "preparing"
      || job.state === "loading-model"
      || job.state === "generating"
      || job.state === "saving"
    ) {
      return job;
    }
  }

  return null;
}

export function getSynthesisJob(
  jobId: string,
): SynthesisJob | null {
  return (
    jobs.get(
      jobId,
    )
    || null
  );
}


export function listSynthesisJobs():
SynthesisJob[] {
  return Array.from(
    jobs.values(),
  ).sort(
    (
      first,
      second,
    ) => (
      second.createdAt
        .localeCompare(
          first.createdAt,
        )
    ),
  );
}

export function getProtectedCacheKeys():
Set<string> {
  const protectedKeys =
    new Set<string>();

  if (activeJobId) {
    const activeJob =
      jobs.get(
        activeJobId,
      );

    if (activeJob) {
      protectedKeys.add(
        activeJob.cacheKey,
      );
    }
  }

  for (
    const jobId
    of queuedJobIds
  ) {
    const queuedJob =
      jobs.get(
        jobId,
      );

    if (queuedJob) {
      protectedKeys.add(
        queuedJob.cacheKey,
      );
    }
  }

  return protectedKeys;
}

export function getQueueSnapshot():
QueueSnapshot {
  return {
    activeJobId,

    queuedJobIds: [
      ...queuedJobIds,
    ],

    totalJobs:
      jobs.size,

    isProcessing:
      processing,
  };
}


export async function cancelSynthesisJob(
  jobId: string,
): Promise<
  SynthesisJob
  | null
> {
  const job =
    jobs.get(
      jobId,
    );

  if (!job) {
    return null;
  }

  if (
    isTerminalState(
      job.state,
    )
  ) {
    return job;
  }

  const timestamp =
    new Date()
      .toISOString();

  job.cancellationRequested =
    true;

  job.updatedAt =
    timestamp;

  if (
    job.state === "queued"
  ) {
    const queueIndex =
      queuedJobIds.indexOf(
        job.id,
      );

    if (queueIndex >= 0) {
      queuedJobIds.splice(
        queueIndex,
        1,
      );
    }

    job.state =
      "cancelled";

    job.progressMessage =
      "The queued synthesis job was cancelled.";

    job.queuePosition =
      null;

    job.completedAt =
      timestamp;

    job.error = {
      code:
        "JOB_CANCELLED",

      message:
        "The synthesis job was cancelled before it started.",

      retryable:
        false,
    };

    updateQueuePositions();

    await persistJob(
      job,
    );

    await persistQueuedJobs();

    return job;
  }

  const controller =
    cancellationControllers.get(
      job.id,
    );

  if (controller) {
    controller.abort();
  }

  job.progressMessage =
    "Cancellation requested. Waiting for a safe stopping point.";

  await persistJob(
    job,
  );

  return job;
}


async function updateJobProgress(
  jobId: string,
  update:
    QueueProgressUpdate,
): Promise<void> {
  const job =
    jobs.get(
      jobId,
    );

  if (!job) {
    return;
  }

  if (
    isTerminalState(
      job.state,
    )
  ) {
    return;
  }

  job.state =
    update.state;

  job.progress =
    clampProgress(
      update.progress,
    );

  job.progressMessage =
    update.message;

  job.updatedAt =
    new Date()
      .toISOString();

  job.queuePosition =
    null;

  await persistJob(
    job,
  );
}


async function markJobCompleted(
  job:
    SynthesisJob,

  result:
    SynthesisJobResult,
): Promise<void> {
  const timestamp =
    new Date()
      .toISOString();

  job.state =
    "completed";

  job.progress =
    100;

  job.progressMessage =
    "Synthesis completed.";

  job.updatedAt =
    timestamp;

  job.completedAt =
    timestamp;

  job.queuePosition =
    null;

  job.result =
    result;

  job.error =
    null;

  await persistJob(
    job,
  );
}


async function markJobCancelled(
  job:
    SynthesisJob,
): Promise<void> {
  const timestamp =
    new Date()
      .toISOString();

  job.state =
    "cancelled";

  job.progressMessage =
    "The synthesis job was cancelled.";

  job.updatedAt =
    timestamp;

  job.completedAt =
    timestamp;

  job.queuePosition =
    null;

  job.error = {
    code:
      "JOB_CANCELLED",

    message:
      "The synthesis job was cancelled.",

    retryable:
      false,
  };

  await persistJob(
    job,
  );
}

async function markJobFailed(
  job:
    SynthesisJob,

  error:
    SynthesisJobError,
): Promise<void> {
  const timestamp =
    new Date()
      .toISOString();

  job.state =
    "failed";

  job.progressMessage =
    "Synthesis failed after "
    + job.attempt
    + (
      job.attempt === 1
        ? " attempt."
        : " attempts."
    );

  job.updatedAt =
    timestamp;

  job.completedAt =
    timestamp;

  job.queuePosition =
    null;

  job.error = {
    code:
      error.code,

    message:
      error.message,

    retryable:
      error.retryable,
  };

  await persistJob(
    job,
  );
}

async function executeJob(
  job:
    SynthesisJob,
): Promise<void> {
  if (!executor) {
    throw new Error(
      "No synthesis job executor "
      + "has been registered.",
    );
  }

  const currentExecutor =
    executor;

  const controller =
    new AbortController();

  cancellationControllers.set(
    job.id,
    controller,
  );

  activeJobId =
    job.id;

  const startedTimestamp =
    new Date()
      .toISOString();

  job.startedAt =
    startedTimestamp;

  job.updatedAt =
    startedTimestamp;

  job.queuePosition =
    null;

  job.error =
    null;

  await persistJob(
    job,
  );

  try {
    while (
      job.attempt
      < job.maximumAttempts
    ) {
      throwIfCancelled(
        controller.signal,
      );

      job.attempt += 1;

      job.state =
        "preparing";

      job.progress =
        5;

      job.progressMessage =
        "Preparing synthesis attempt "
        + job.attempt
        + " of "
        + job.maximumAttempts
        + ".";

      job.updatedAt =
        new Date()
          .toISOString();

      job.error =
        null;

      await persistJob(
        job,
      );

      try {
        const result =
          await currentExecutor(
            job.request,

            {
              jobId:
                job.id,

              cacheKey:
                job.cacheKey,

              signal:
                controller.signal,

              updateProgress:
                async (
                  update,
                ) => {
                  throwIfCancelled(
                    controller.signal,
                  );

                  await updateJobProgress(
                    job.id,
                    update,
                  );
                },
            },
          );

        throwIfCancelled(
          controller.signal,
        );

        await markJobCompleted(
          job,
          result,
        );

        return;

      } catch (error) {
        if (
          isCancellationError(
            error,
          )
          || controller
            .signal.aborted
        ) {
          await markJobCancelled(
            job,
          );

          return;
        }

        const errorDetails =
          getExecutionErrorDetails(
            error,
          );

        const attemptsRemain =
          job.attempt
          < job.maximumAttempts;

        if (
          !errorDetails.retryable
          || !attemptsRemain
        ) {
          await markJobFailed(
            job,
            errorDetails,
          );

          return;
        }

        const retryDelay =
          getRetryDelayMilliseconds(
            job.attempt,
          );

        job.state =
          "preparing";

        job.progress =
          5;

        job.progressMessage =
          "Temporary synthesis failure. "
          + "Retrying in "
          + Math.round(
            retryDelay / 1000,
          )
          + " second"
          + (
            retryDelay === 1000
              ? "."
              : "s."
          );

        job.updatedAt =
          new Date()
            .toISOString();

        job.error = {
          code:
            errorDetails.code,

          message:
            errorDetails.message,

          retryable:
            true,
        };

        await persistJob(
          job,
        );

        await waitForRetry(
          retryDelay,
          controller.signal,
        );
      }
    }

  } catch (error) {
    if (
      isCancellationError(
        error,
      )
      || controller
        .signal.aborted
    ) {
      await markJobCancelled(
        job,
      );

      return;
    }

    await markJobFailed(
      job,
      getExecutionErrorDetails(
        error,
      ),
    );

  } finally {
    cancellationControllers.delete(
      job.id,
    );

    activeJobId =
      null;
  }
}

async function processQueue():
Promise<void> {
  if (processing) {
    return;
  }

  processing =
    true;

  try {
    while (
      queuedJobIds.length > 0
    ) {
      const nextJobId =
        queuedJobIds.shift();

      updateQueuePositions();

      await persistQueuedJobs();

      if (!nextJobId) {
        continue;
      }

      const job =
        jobs.get(
          nextJobId,
        );

      if (
        !job
        || job.state !==
          "queued"
      ) {
        continue;
      }

      await executeJob(
        job,
      );
    }

  } finally {
    processing =
      false;
  }
}