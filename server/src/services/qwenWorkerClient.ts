import {
  environment,
} from "../config/environment.js";

export type QwenWorkerHealth = {
  ok: boolean;
  service: string;
  version: string;
  mode: string;
  uptime_seconds: number;
  timestamp: string;
};

export type QwenStatus = {
  ok: boolean;
  engine_id: string;
  display_name: string;
  model_id: string;
  installed: boolean;
  available: boolean;
  loaded: boolean;
  busy: boolean;
  status: string;
  device: string;
  gpu:
    | string
    | null;
  dtype: string;
  attention: string;
  load_seconds:
    | number
    | null;
  free_ram_gb: number;
  free_vram_gb: number;
  total_vram_gb: number;
  minimum_ram_gb: number;
  minimum_vram_gb: number;
  idle_timeout_seconds: number;
  seconds_until_unload:
    | number
    | null;
  default_speaker: string;
  default_language: string;
  maximum_text_length: number;
  audio_directory: string;
};

export type QwenSpeaker = {
  id: string;
  name: string;
  description: string;
  native_language: string;
};

export type QwenPreviewRequest = {
  text: string;
  speaker: string;
  language: string;
  instruction: string;
};

export type QwenPreviewResult = {
  ok: boolean;
  engine_id: string;
  generation_id: string;
  speaker: string;
  language: string;
  instruction: string;
  sample_rate: number;
  duration_seconds: number;
  generation_seconds: number;
  real_time_factor: number;
  file_size_bytes: number;
  device: string;
  output_file: string;
  audio_url: string;
  cached: boolean;
};

export type QwenUnloadResult = {
  ok: boolean;
  loaded: boolean;
  status: string;
};

export type QwenWorkerErrorCode =
  | "QWEN_WORKER_UNAVAILABLE"
  | "QWEN_WORKER_TIMEOUT"
  | "QWEN_WORKER_INVALID_RESPONSE"
  | "QWEN_WORKER_REQUEST_FAILED";

export class QwenWorkerRequestError
  extends Error {
  readonly code:
    QwenWorkerErrorCode;

  readonly statusCode:
    number | undefined;

  readonly responseBody:
    unknown;

  constructor(options: {
    code:
      QwenWorkerErrorCode;
    message: string;
    statusCode?: number;
    responseBody?: unknown;
  }) {
    super(options.message);

    this.name =
      "QwenWorkerRequestError";

    this.code =
      options.code;

    this.statusCode =
      options.statusCode;

    this.responseBody =
      options.responseBody;

    Object.setPrototypeOf(
      this,
      new.target.prototype,
    );
  }
}

type QwenRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function extractQwenErrorMessage(
  responseBody: unknown,
): string | null {
  if (
    responseBody === null ||
    typeof responseBody !==
      "object"
  ) {
    return null;
  }

  const responseRecord =
    responseBody as Record<
      string,
      unknown
    >;

  const errorValue =
    responseRecord.error;

  if (
    errorValue === null ||
    typeof errorValue !==
      "object"
  ) {
    return null;
  }

  const errorRecord =
    errorValue as Record<
      string,
      unknown
    >;

  const messageValue =
    errorRecord.message;

  if (
    typeof messageValue ===
    "string"
  ) {
    return messageValue;
  }

  return null;
}

async function requestQwenJson<
  ResponseType,
>(
  pathname: string,
  options:
    QwenRequestOptions = {},
): Promise<ResponseType> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      environment
        .qwenWorkerRequestTimeoutMs,
    );

  timeout.unref();

  const headers =
    new Headers();

  headers.set(
    "Accept",
    "application/json",
  );

  const requestOptions:
    RequestInit = {
      method:
        options.method || "GET",

      headers,

      signal:
        controller.signal,
    };

  if (
    options.body !== undefined
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );

    requestOptions.body =
      JSON.stringify(
        options.body,
      );
  }

  try {
    const requestUrl =
      `${environment.qwenWorkerBaseUrl}${pathname}`;

    const response =
      await fetch(
        requestUrl,
        requestOptions,
      );

    let responseBody:
      unknown;

    try {
      responseBody =
        await response.json();
    } catch {
      throw new QwenWorkerRequestError({
        code:
          "QWEN_WORKER_INVALID_RESPONSE",

        message:
          "The Qwen worker returned invalid JSON.",

        statusCode:
          response.status,
      });
    }

    if (!response.ok) {
      const workerMessage =
        extractQwenErrorMessage(
          responseBody,
        );

      throw new QwenWorkerRequestError({
        code:
          "QWEN_WORKER_REQUEST_FAILED",

        message:
          workerMessage ||
          `The Qwen worker returned HTTP ${response.status}.`,

        statusCode:
          response.status,

        responseBody,
      });
    }

    return responseBody as
      ResponseType;

  } catch (error) {
    if (
      error instanceof
      QwenWorkerRequestError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new QwenWorkerRequestError({
        code:
          "QWEN_WORKER_TIMEOUT",

        message:
          "The Qwen worker did not respond before the timeout.",
      });
    }

    throw new QwenWorkerRequestError({
      code:
        "QWEN_WORKER_UNAVAILABLE",

      message:
        "The Qwen worker is not currently reachable.",
    });

  } finally {
    clearTimeout(timeout);
  }
}

export async function getQwenHealth():
Promise<QwenWorkerHealth> {
  return requestQwenJson<
    QwenWorkerHealth
  >(
    "/api/health",
  );
}

export async function getQwenStatus():
Promise<QwenStatus> {
  return requestQwenJson<
    QwenStatus
  >(
    "/api/engines/qwen/status",
  );
}

export async function getQwenSpeakers():
Promise<QwenSpeaker[]> {
  return requestQwenJson<
    QwenSpeaker[]
  >(
    "/api/engines/qwen/speakers",
  );
}

export async function generateQwenPreview(
  request:
    QwenPreviewRequest,
): Promise<QwenPreviewResult> {
  const options:
    QwenRequestOptions = {
      method: "POST",
      body: request,
    };

  return requestQwenJson<
    QwenPreviewResult
  >(
    "/api/engines/qwen/preview",
    options,
  );
}

export async function unloadQwenModel():
Promise<QwenUnloadResult> {
  const options:
    QwenRequestOptions = {
      method: "POST",
    };

  return requestQwenJson<
    QwenUnloadResult
  >(
    "/api/engines/qwen/unload",
    options,
  );
}