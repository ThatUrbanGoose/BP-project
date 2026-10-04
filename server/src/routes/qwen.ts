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
  generateQwenPreview,
  getQwenSpeakers,
  getQwenStatus,
  QwenWorkerRequestError,
  unloadQwenModel,
} from "../services/qwenWorkerClient.js";


const previewRequestSchema =
  z.object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(1000),

    speaker: z
      .string()
      .trim()
      .min(1)
      .default(
        "Aiden",
      ),

    language: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .default(
        "English",
      ),

    instruction: z
      .string()
      .trim()
      .max(500)
      .default(
        "Speak calmly and clearly, "
        + "with controlled warmth and "
        + "a measured pace.",
      ),
  });


const audioFilenameSchema =
  z.string().regex(
    /^[A-Za-z0-9._-]+[.]wav$/,
    "The audio filename is invalid.",
  );


function sendQwenWorkerError(
  error:
    QwenWorkerRequestError,

  request:
    FastifyRequest,

  reply:
    FastifyReply,
) {
  const workerStatusCode =
    error.statusCode;

  const statusCode =
    workerStatusCode !== undefined
    && workerStatusCode >= 400
    && workerStatusCode < 600
      ? workerStatusCode
      : 503;

  return reply
    .status(statusCode)
    .send({
      error: {
        code:
          error.code,

        message:
          error.message,

        requestId:
          request.id,
      },
    });
}


export async function registerQwenRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/tts/qwen/status",

    async (
      request,
      reply,
    ) => {
      try {
        return await getQwenStatus();

      } catch (error) {
        if (
          error instanceof
          QwenWorkerRequestError
        ) {
          return sendQwenWorkerError(
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
    "/api/tts/qwen/speakers",

    async (
      request,
      reply,
    ) => {
      try {
        return await getQwenSpeakers();

      } catch (error) {
        if (
          error instanceof
          QwenWorkerRequestError
        ) {
          return sendQwenWorkerError(
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
    "/api/tts/qwen/preview",

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
                "INVALID_QWEN_REQUEST",

              message:
                "The Qwen preview request is invalid.",

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
          await generateQwenPreview(
            {
              text:
                validation
                  .data.text,

              speaker:
                validation
                  .data.speaker,

              language:
                validation
                  .data.language,

              instruction:
                validation
                  .data.instruction,
            },
          );

        return {
          ok:
            result.ok,

          engine_id:
            result.engine_id,

          generation_id:
            result.generation_id,

          speaker:
            result.speaker,

          language:
            result.language,

          instruction:
            result.instruction,

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
            "/api/tts/qwen/audio/"
            + result.output_file,
        };

      } catch (error) {
        if (
          error instanceof
          QwenWorkerRequestError
        ) {
          return sendQwenWorkerError(
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
        "/api/tts/qwen/unload",

        async (
        request,
        reply,
        ) => {
        try {
            const unloadResult =
            await unloadQwenModel();

            return reply
            .status(200)
            .send({
                ok:
                unloadResult.ok,

                loaded:
                unloadResult.loaded,

                status:
                unloadResult.status,
            });

        } catch (error) {
            if (
            error instanceof
            QwenWorkerRequestError
            ) {
            return sendQwenWorkerError(
                error,
                request,
                reply,
            );
            }

            request.log.error(
            {
                error,
                requestId:
                request.id,
            },
            "Qwen unload proxy failed.",
            );

            return reply
            .status(500)
            .send({
                error: {
                code:
                    "QWEN_UNLOAD_FAILED",

                message:
                    "The Node service could not unload Qwen3-TTS.",

                requestId:
                    request.id,
                },
            });
        }
        },
    );


  app.get(
    "/api/tts/qwen/audio/:filename",

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

          "qwen3-tts",
        );

      const audioPath =
        path.resolve(
          audioDirectory,
          validation.data,
        );

      const expectedPrefix =
        audioDirectory
        + path.sep;

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
            "The path is not a file.",
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
                "The requested Qwen audio file was not found.",

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
        "inline; filename=\""
        + validation.data
        + "\"",
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