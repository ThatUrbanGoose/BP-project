import {
  createReadStream,
} from "node:fs";

import {
  stat,
} from "node:fs/promises";

import path from "node:path";

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  z,
} from "zod";

import {
  environment,
} from "../config/environment.js";

import {
  generateKokoroPreview,
  getKokoroStatus,
  getKokoroVoices,
  WorkerRequestError,
} from "../services/workerClient.js";

const previewRequestSchema =
  z.object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(5000),

    voiceId: z
      .string()
      .trim()
      .min(1)
      .default(
        "af_heart",
      ),

    speed: z.coerce
      .number()
      .min(0.5)
      .max(2)
      .default(1),
  });

const audioFilenameSchema =
  z.string().regex(
    /^[A-Za-z0-9._-]+[.]wav$/,
    "The audio filename is invalid.",
  );

function sendWorkerError(
  error: WorkerRequestError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const statusCode =
    error.statusCode &&
    error.statusCode >= 400 &&
    error.statusCode < 600
      ? error.statusCode
      : 503;

  return reply
    .status(statusCode)
    .send({
      error: {
        code: error.code,
        message: error.message,
        requestId:
          request.id,
      },
    });
}

export async function registerKokoroRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/tts/kokoro/status",
    async (
      request,
      reply,
    ) => {
      try {
        return await getKokoroStatus();
      } catch (error) {
        if (
          error instanceof
          WorkerRequestError
        ) {
          return sendWorkerError(
            error,
            request,
            reply,
          );
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/tts/kokoro/voices",
    async (
      request,
      reply,
    ) => {
      try {
        return await getKokoroVoices();
      } catch (error) {
        if (
          error instanceof
          WorkerRequestError
        ) {
          return sendWorkerError(
            error,
            request,
            reply,
          );
        }

        throw error;
      }
    },
  );

  app.post(
    "/api/tts/kokoro/preview",
    async (
      request,
      reply,
    ) => {
      const validation =
        previewRequestSchema
          .safeParse(
            request.body,
          );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_KOKORO_REQUEST",

              message:
                "The Kokoro preview request is invalid.",

              requestId:
                request.id,

              details:
                validation.error
                  .issues,
            },
          });
      }

      try {
        const result =
          await generateKokoroPreview(
            {
              text:
                validation
                  .data.text,

              voice_id:
                validation
                  .data.voiceId,

              speed:
                validation
                  .data.speed,
            },
          );

        return {
          ok: result.ok,
          engine_id:
            result.engine_id,
          generation_id:
            result.generation_id,
          voice_id:
            result.voice_id,
          language_code:
            result.language_code,
          sample_rate:
            result.sample_rate,
          duration_seconds:
            result.duration_seconds,
          generation_seconds:
            result.generation_seconds,
          real_time_factor:
            result.real_time_factor,
          file_size_bytes:
            result.file_size_bytes,
          device:
            result.device,
          output_file:
            result.output_file,
          cached:
            result.cached,

          audioUrl:
            `/api/tts/kokoro/audio/${result.output_file}`,
        };
      } catch (error) {
        if (
          error instanceof
          WorkerRequestError
        ) {
          return sendWorkerError(
            error,
            request,
            reply,
          );
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/tts/kokoro/audio/:filename",
    async (
      request,
      reply,
    ) => {
      const parameters =
        request.params as {
          filename?: string;
        };

      const validation =
        audioFilenameSchema
          .safeParse(
            parameters.filename,
          );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_AUDIO_FILE",

              message:
                "The requested audio filename is invalid.",

              requestId:
                request.id,
            },
          });
      }

      const audioDirectory =
        path.resolve(
          environment
            .directories
            .audioCache,
          "kokoro",
        );

      const audioPath =
        path.resolve(
          audioDirectory,
          validation.data,
        );

      const expectedPrefix =
        `${audioDirectory}${path.sep}`;

      if (
        !audioPath.startsWith(
          expectedPrefix,
        )
      ) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_AUDIO_FILE",

              message:
                "The requested audio path is invalid.",

              requestId:
                request.id,
            },
          });
      }

      try {
        const fileInformation =
          await stat(
            audioPath,
          );

        if (
          !fileInformation
            .isFile()
        ) {
          throw new Error(
            "Not a file.",
          );
        }
      } catch {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "AUDIO_NOT_FOUND",

              message:
                "The requested Kokoro audio file was not found.",

              requestId:
                request.id,
            },
          });
      }

      reply.header(
        "Content-Type",
        "audio/wav",
      );

      reply.header(
        "Content-Disposition",
        `inline; filename="${validation.data}"`,
      );

      reply.header(
        "Cache-Control",
        "private, max-age=3600",
      );

      return reply.send(
        createReadStream(
          audioPath,
        ),
      );
    },
  );
}