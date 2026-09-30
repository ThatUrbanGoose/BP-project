import {
  environment,
} from "../config/environment.js";

export type WorkerHealth = {
  ok: boolean;
  service: string;
  version: string;
  mode: string;
  uptime_seconds: number;
  timestamp: string;
};

export type WorkerEngineStatus = {
  engine_id: string;
  display_name: string;
  available: boolean;
  installed: boolean;
  status: string;
};

export type WorkerCapabilities = {
  ok: boolean;
  service: string;
  python_version: string;
  operating_system: string;
  architecture: string;
  logical_cpu_count: number;
  physical_cpu_count: number;
  total_memory_gb: number;
  available_memory_gb: number;
  data_directory: string;
  model_directory: string;
  audio_cache_directory: string;
  engines: WorkerEngineStatus[];
};

export type KokoroStatus = {
  ok: boolean;
  engine_id: string;
  display_name: string;
  installed: boolean;
  available: boolean;
  loaded: boolean;
  status: string;
  device: string;
  load_seconds:
    | number
    | null;
  default_voice: string;
  default_language: string;
  sample_rate: number;
  output_directory: string;
};

export type KokoroVoice = {
  id: string;
  name: string;
  language: string;
  language_code: string;
};

export type KokoroPreviewRequest = {
  text: string;
  voice_id: string;
  speed: number;
};

export type KokoroPreviewResult = {
  ok: boolean;
  engine_id: string;
  generation_id: string;
  voice_id: string;
  language_code: string;
  sample_rate: number;
  duration_seconds: number;
  generation_seconds: number;
  real_time_factor: number;
  file_size_bytes: number;
  device: string;
  output_file: string;
  cached: boolean;
};

export type WorkerErrorCode =
  | "WORKER_UNAVAILABLE"
  | "WORKER_TIMEOUT"
  | "WORKER_INVALID_RESPONSE"
  | "WORKER_REQUEST_FAILED";

export class WorkerRequestError
  extends Error {
  readonly code:
    WorkerErrorCode;

  readonly statusCode:
    number | undefined;

  readonly responseBody:
    unknown;

  constructor(options: {
    code: WorkerErrorCode;
    message: string;
    statusCode?: number;
    responseBody?: unknown;
  }) {
    super(options.message);

    this.name =
      "WorkerRequestError";

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

type WorkerRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

function extractWorkerMessage(
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

async function requestWorkerJson<
  ResponseType,
>(
  pathname: string,
  options:
    WorkerRequestOptions = {},
): Promise<ResponseType> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      environment
        .workerRequestTimeoutMs,
    );

  timeout.unref();

  const method =
    options.method || "GET";

  const headers =
    new Headers();

  headers.set(
    "Accept",
    "application/json",
  );

  const requestOptions:
    RequestInit = {
      method,
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
    const workerUrl =
      `${environment.workerBaseUrl}${pathname}`;

    const response =
      await fetch(
        workerUrl,
        requestOptions,
      );

    let responseBody:
      unknown;

    try {
      responseBody =
        await response.json();
    } catch {
      throw new WorkerRequestError({
        code:
          "WORKER_INVALID_RESPONSE",

        message:
          "The BP worker returned invalid JSON.",

        statusCode:
          response.status,
      });
    }

    if (!response.ok) {
      const workerMessage =
        extractWorkerMessage(
          responseBody,
        );

      const fallbackMessage =
        `The BP worker returned HTTP ${response.status}.`;

      throw new WorkerRequestError({
        code:
          "WORKER_REQUEST_FAILED",

        message:
          workerMessage ||
          fallbackMessage,

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
      WorkerRequestError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new WorkerRequestError({
        code:
          "WORKER_TIMEOUT",

        message:
          "The BP worker did not respond before the timeout.",
      });
    }

    throw new WorkerRequestError({
      code:
        "WORKER_UNAVAILABLE",

      message:
        "The BP worker is not currently reachable.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getWorkerHealth():
Promise<WorkerHealth> {
  return requestWorkerJson<
    WorkerHealth
  >(
    "/api/health",
  );
}

export async function getWorkerCapabilities():
Promise<WorkerCapabilities> {
  return requestWorkerJson<
    WorkerCapabilities
  >(
    "/api/capabilities",
  );
}

export async function getKokoroStatus():
Promise<KokoroStatus> {
  return requestWorkerJson<
    KokoroStatus
  >(
    "/api/engines/kokoro/status",
  );
}

export async function getKokoroVoices():
Promise<KokoroVoice[]> {
  return requestWorkerJson<
    KokoroVoice[]
  >(
    "/api/engines/kokoro/voices",
  );
}

export async function generateKokoroPreview(
  request:
    KokoroPreviewRequest,
): Promise<KokoroPreviewResult> {
  const options:
    WorkerRequestOptions = {
      method: "POST",
      body: request,
    };

  return requestWorkerJson<
    KokoroPreviewResult
  >(
    "/api/engines/kokoro/preview",
    options,
  );
}