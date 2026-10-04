const DEFAULT_TIMEOUT_MS =
  15000;


export class SpeechApiError
  extends Error {
  constructor({
    code,
    message,
    status,
    requestId,
    details,
  }) {
    super(
      message
      || "The local speech service request failed.",
    );

    this.name =
      "SpeechApiError";

    this.code =
      code
      || "SPEECH_API_ERROR";

    this.status =
      status
      ?? null;

    this.requestId =
      requestId
      ?? null;

    this.details =
      details
      ?? null;
  }
}


async function parseResponseBody(
  response,
) {
  const contentType =
    response.headers.get(
      "content-type",
    )
    || "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return response.json();
  }

  const text =
    await response.text();

  return text
    ? {
        message:
          text,
      }
    : null;
}


async function requestJson(
  path,
  options = {},
) {
  const {
    timeoutMs =
      DEFAULT_TIMEOUT_MS,

    signal:
      externalSignal,

    headers:
      customHeaders,

    ...fetchOptions
  } = options;

  const controller =
    new AbortController();

  const timeout =
    window.setTimeout(
      () => {
        controller.abort(
          "timeout",
        );
      },
      timeoutMs,
    );

  function abortFromExternalSignal() {
    controller.abort(
      externalSignal?.reason
      || "cancelled",
    );
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternalSignal();

    } else {
      externalSignal.addEventListener(
        "abort",
        abortFromExternalSignal,
        {
          once: true,
        },
      );
    }
  }

  try {
    const response =
      await fetch(
        path,
        {
          ...fetchOptions,

          headers: {
            Accept:
              "application/json",

            ...customHeaders,
          },

          signal:
            controller.signal,
        },
      );

    const body =
      await parseResponseBody(
        response,
      );

    if (!response.ok) {
      const remoteError =
        body?.error
        || body
        || {};

      throw new SpeechApiError({
        code:
          remoteError.code
          || `HTTP_${response.status}`,

        message:
          remoteError.message
          || `The local speech service returned HTTP ${response.status}.`,

        status:
          response.status,

        requestId:
          remoteError.requestId,

        details:
          remoteError.details,
      });
    }

    return body;

  } catch (error) {
    if (
      error instanceof
      SpeechApiError
    ) {
      throw error;
    }

    if (
      error?.name ===
      "AbortError"
    ) {
      const timedOut =
        controller.signal.reason ===
        "timeout";

      throw new SpeechApiError({
        code:
          timedOut
            ? "LOCAL_SERVICE_TIMEOUT"
            : "LOCAL_REQUEST_CANCELLED",

        message:
          timedOut
            ? "The local speech service did not respond in time."
            : "The local speech request was cancelled.",

        status:
          null,
      });
    }

    throw new SpeechApiError({
      code:
        "LOCAL_SERVICE_UNAVAILABLE",

      message:
        "The local speech service could not be reached.",

      status:
        null,

      details:
        error instanceof Error
          ? error.message
          : null,
    });

  } finally {
    window.clearTimeout(
      timeout,
    );

    externalSignal
      ?.removeEventListener(
        "abort",
        abortFromExternalSignal,
      );
  }
}


function postJson(
  path,
  body,
  options = {},
) {
  return requestJson(
    path,
    {
      ...options,

      method:
        "POST",

      headers: {
        "Content-Type":
          "application/json",

        ...options.headers,
      },

      body:
        JSON.stringify(
          body,
        ),
    },
  );
}


function patchJson(
  path,
  body,
  options = {},
) {
  return requestJson(
    path,
    {
      ...options,

      method:
        "PATCH",

      headers: {
        "Content-Type":
          "application/json",

        ...options.headers,
      },

      body:
        JSON.stringify(
          body,
        ),
    },
  );
}


export function getLocalServiceHealth(
  options,
) {
  return requestJson(
    "/api/health",
    options,
  );
}


export function getKokoroStatus(
  options,
) {
  return requestJson(
    "/api/tts/kokoro/status",
    options,
  );
}


export function getKokoroVoices(
  options,
) {
  return requestJson(
    "/api/tts/kokoro/voices",
    options,
  );
}


export function getQwenStatus(
  options,
) {
  return requestJson(
    "/api/tts/qwen/status",
    options,
  );
}


export function getQwenSpeakers(
  options,
) {
  return requestJson(
    "/api/tts/qwen/speakers",
    options,
  );
}


export function getSynthesisQueue(
  options,
) {
  return requestJson(
    "/api/synthesis/queue",
    options,
  );
}


export function getSynthesisJobs(
  options,
) {
  return requestJson(
    "/api/synthesis/jobs",
    options,
  );
}


export function getSynthesisJob(
  jobId,
  options,
) {
  return requestJson(
    `/api/synthesis/jobs/${encodeURIComponent(jobId)}`,
    options,
  );
}


export function cancelSynthesisJob(
  jobId,
  options,
) {
  return requestJson(
    `/api/synthesis/jobs/${encodeURIComponent(jobId)}`,
    {
      ...options,

      method:
        "DELETE",
    },
  );
}


export function submitSynthesisJob({
  engine,
  text,
  storyId = null,
  voice,
  language = "English",
  speed = 1,
  instruction = "",
}, options) {
  return postJson(
    "/api/synthesis/jobs",
    {
      engine,
      text,
      storyId,
      voice,
      language,
      speed,
      instruction,
    },
    options,
  );
}


export function previewPronunciation({
  text,
  storyId = null,
}, options) {
  return postJson(
    "/api/pronunciations/preview",
    {
      text,
      storyId,
    },
    options,
  );
}


export function getGlobalPronunciations(
  options,
) {
  return requestJson(
    "/api/pronunciations/global",
    options,
  );
}


export function getStoryPronunciations(
  storyId,
  options,
) {
  return requestJson(
    `/api/pronunciations/stories/${encodeURIComponent(storyId)}`,
    options,
  );
}


export function createGlobalPronunciationRule(
  rule,
  options,
) {
  return postJson(
    "/api/pronunciations/global/rules",
    rule,
    options,
  );
}


export function updateGlobalPronunciationRule(
  ruleId,
  changes,
  options,
) {
  return patchJson(
    `/api/pronunciations/global/rules/${encodeURIComponent(ruleId)}`,
    changes,
    options,
  );
}


export function deleteGlobalPronunciationRule(
  ruleId,
  options,
) {
  return requestJson(
    `/api/pronunciations/global/rules/${encodeURIComponent(ruleId)}`,
    {
      ...options,

      method:
        "DELETE",
    },
  );
}


export function createStoryPronunciationRule(
  storyId,
  rule,
  options,
) {
  return postJson(
    `/api/pronunciations/stories/${encodeURIComponent(storyId)}/rules`,
    rule,
    options,
  );
}


export function updateStoryPronunciationRule(
  storyId,
  ruleId,
  changes,
  options,
) {
  return patchJson(
    `/api/pronunciations/stories/${encodeURIComponent(storyId)}/rules/${encodeURIComponent(ruleId)}`,
    changes,
    options,
  );
}


export function deleteStoryPronunciationRule(
  storyId,
  ruleId,
  options,
) {
  return requestJson(
    `/api/pronunciations/stories/${encodeURIComponent(storyId)}/rules/${encodeURIComponent(ruleId)}`,
    {
      ...options,

      method:
        "DELETE",
    },
  );
}


export function getSynthesisStorage(
  options,
) {
  return requestJson(
    "/api/synthesis/storage",
    options,
  );
}


export function getSynthesisStorageEntries(
  options,
) {
  return requestJson(
    "/api/synthesis/storage/entries",
    options,
  );
}


export function cleanSynthesisStorage(
  options,
) {
  return postJson(
    "/api/synthesis/storage/cleanup",
    {},
    options,
  );
}

export function getSynthesisTimeline(
  cacheKey,
  options,
) {
  return requestJson(
    (
      "/api/synthesis/cache/"
      + encodeURIComponent(
        cacheKey,
      )
      + "/timeline"
    ),
    options,
  );
}

export function getCachedAudioUrl(
  cacheKey,
) {
  return (
    "/api/synthesis/cache/"
    + encodeURIComponent(
      cacheKey,
    )
    + "/audio"
  );
}


export function getSubmissionAudioUrl(
  submission,
) {
  if (
    typeof submission?.audioUrl ===
    "string"
  ) {
    return submission.audioUrl;
  }

  if (
    typeof submission
      ?.job
      ?.result
      ?.audioUrl ===
    "string"
  ) {
    return submission
      .job
      .result
      .audioUrl;
  }

  if (
    typeof submission?.cacheKey ===
    "string"
  ) {
    return getCachedAudioUrl(
      submission.cacheKey,
    );
  }

  return "";
}


export function isTerminalJobState(
  state,
) {
  return (
    state === "completed"
    || state === "failed"
    || state === "cancelled"
  );
}


export async function waitForSynthesisJob(
  jobId,
  {
    intervalMs = 1000,
    signal,
    onUpdate,
  } = {},
) {
  while (true) {
    if (signal?.aborted) {
      throw new SpeechApiError({
        code:
          "LOCAL_REQUEST_CANCELLED",

        message:
          "Synthesis polling was cancelled.",

        status:
          null,
      });
    }

    const response =
      await getSynthesisJob(
        jobId,
        {
          signal,
        },
      );

    const job =
      response?.job;

    if (!job) {
      throw new SpeechApiError({
        code:
          "INVALID_JOB_RESPONSE",

        message:
          "The local speech service returned an invalid job response.",

        status:
          null,
      });
    }

    onUpdate?.(
      job,
    );

    if (
      isTerminalJobState(
        job.state,
      )
    ) {
      return job;
    }

    await new Promise(
      (
        resolve,
        reject,
      ) => {
        const timeout =
          window.setTimeout(
            resolve,
            intervalMs,
          );

        function handleAbort() {
          window.clearTimeout(
            timeout,
          );

          reject(
            new SpeechApiError({
              code:
                "LOCAL_REQUEST_CANCELLED",

              message:
                "Synthesis polling was cancelled.",

              status:
                null,
            }),
          );
        }

        signal?.addEventListener(
          "abort",
          handleAbort,
          {
            once: true,
          },
        );
      },
    );
  }
}