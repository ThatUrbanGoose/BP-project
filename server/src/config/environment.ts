import "dotenv/config";

import path from "node:path";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum([
      "development",
      "test",
      "production",
    ])
    .default("development"),

  SERVER_HOST: z
    .string()
    .trim()
    .default("127.0.0.1"),

  SERVER_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3001),

  FRONTEND_ORIGIN: z
    .string()
    .url()
    .default(
      "http://localhost:5173",
    ),

  WORKER_BASE_URL: z
    .string()
    .url()
    .default(
      "http://127.0.0.1:3002",
    ),

  WORKER_REQUEST_TIMEOUT_MS:
    z.coerce
      .number()
      .int()
      .min(500)
      .max(60000)
      .default(5000),

  BP_DATA_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .default(
      "D:\\BP-Local",
    ),

  BP_MODEL_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  BP_AUDIO_CACHE_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  BP_METADATA_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  BP_PRONUNCIATION_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  BP_JOB_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  BP_LOG_DIRECTORY: z
    .string()
    .trim()
    .min(1)
    .optional(),

  MAX_CONCURRENT_JOBS: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(1),

  LOG_LEVEL: z
    .enum([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent",
    ])
    .default("info"),
});

const validationResult =
  environmentSchema.safeParse(
    process.env,
  );

if (!validationResult.success) {
  console.error(
    "BP local service configuration is invalid.",
  );

  validationResult.error.issues.forEach(
    (issue) => {
      const setting =
        issue.path.join(".") ||
        "environment";

      console.error(
        `- ${setting}: ${issue.message}`,
      );
    },
  );

  process.exit(1);
}

const parsed =
  validationResult.data;

const dataDirectory =
  path.resolve(
    parsed.BP_DATA_DIRECTORY,
  );

export const environment = {
  nodeEnvironment:
    parsed.NODE_ENV,

  isDevelopment:
    parsed.NODE_ENV ===
    "development",

  host:
    parsed.SERVER_HOST,

  port:
    parsed.SERVER_PORT,

  frontendOrigin:
    parsed.FRONTEND_ORIGIN,

  workerBaseUrl:
    parsed.WORKER_BASE_URL.replace(
      /\/+$/,
      "",
    ),

  workerRequestTimeoutMs:
    parsed
      .WORKER_REQUEST_TIMEOUT_MS,

  maxConcurrentJobs:
    parsed.MAX_CONCURRENT_JOBS,

  logLevel:
    parsed.LOG_LEVEL,

  directories: {
    data:
      dataDirectory,

    models: path.resolve(
      parsed.BP_MODEL_DIRECTORY ||
        path.join(
          dataDirectory,
          "models",
        ),
    ),

    audioCache: path.resolve(
      parsed.BP_AUDIO_CACHE_DIRECTORY ||
        path.join(
          dataDirectory,
          "audio-cache",
        ),
    ),

    metadata: path.resolve(
      parsed.BP_METADATA_DIRECTORY ||
        path.join(
          dataDirectory,
          "metadata",
        ),
    ),

    pronunciations: path.resolve(
      parsed.BP_PRONUNCIATION_DIRECTORY ||
        path.join(
          dataDirectory,
          "pronunciations",
        ),
    ),

    jobs: path.resolve(
      parsed.BP_JOB_DIRECTORY ||
        path.join(
          dataDirectory,
          "jobs",
        ),
    ),

    logs: path.resolve(
      parsed.BP_LOG_DIRECTORY ||
        path.join(
          dataDirectory,
          "logs",
        ),
    ),
  },
} as const;

export type Environment =
  typeof environment;