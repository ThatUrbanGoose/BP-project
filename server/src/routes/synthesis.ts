import {
  createReadStream,
} from "node:fs";

import {
  stat,
} from "node:fs/promises";

import type {
  FastifyInstance,
  FastifyReply,
} from "fastify";

import {
  z,
} from "zod";

import {
  getSynthesisCacheEntry,
} from "../services/synthesisCache.js";

import {
  submitSynthesisRequest,
} from "../services/synthesisCoordinator.js";

import {
  cancelSynthesisJob,
  getQueueSnapshot,
  getSynthesisJob,
  listSynthesisJobs,
} from "../services/synthesisQueue.js";

import {
  transformPronunciationText,
} from "../services/pronunciationTransformer.js";

const synthesisRequestSchema =
  z.discriminatedUnion(
    "engine",

    [
      z.object({
        engine:
          z.literal(
            "kokoro",
          ),

        text:
          z.string()
            .trim()
            .min(1)
            .max(5000),
        
        storyId:
          z.string()
            .trim()
            .regex(
              /^[A-Za-z0-9._-]{1,100}$/,
              "The story ID is invalid.",
            )
            .nullable()
            .optional()
            .default(null),

        voice:
          z.string()
            .trim()
            .min(1)
            .default(
              "af_heart",
            ),

        language:
          z.string()
            .trim()
            .min(1)
            .default(
              "English",
            ),

        speed:
          z.coerce
            .number()
            .min(0.5)
            .max(2)
            .default(1),

        instruction:
          z.string()
            .trim()
            .max(500)
            .default(""),
      }),

      z.object({
        engine:
          z.literal(
            "qwen3-tts",
          ),

        text:
          z.string()
            .trim()
            .min(1)
            .max(1000),
        
        storyId:
          z.string()
            .trim()
            .regex(
              /^[A-Za-z0-9._-]{1,100}$/,
              "The story ID is invalid.",
            )
            .nullable()
            .optional()
            .default(null),

        voice:
          z.string()
            .trim()
            .min(1)
            .default(
              "Aiden",
            ),

        language:
          z.string()
            .trim()
            .min(1)
            .max(50)
            .default(
              "English",
            ),

        speed:
          z.coerce
            .number()
            .default(1),

        instruction:
          z.string()
            .trim()
            .max(500)
            .default(
              "Speak calmly and clearly, "
              + "with controlled warmth and "
              + "a measured pace.",
            ),
      }),
    ],
  );


const jobIdSchema =
  z.string()
    .uuid();


const cacheKeySchema =
  z.string()
    .regex(
      /^[a-f0-9]{64}$/,
      "The cache key is invalid.",
    );


function getModelName(
  engine:
    "kokoro"
    | "qwen3-tts",
): string {
  if (
    engine === "kokoro"
  ) {
    return "Kokoro-82M";
  }

  return (
    "Qwen3-TTS "
    + "12Hz 0.6B CustomVoice"
  );
}


function sendAudioFile(
  reply:
    FastifyReply,

  audioPath:
    string,
) {
  reply.header(
    "Content-Type",
    "audio/wav",
  );

  reply.header(
    "Content-Disposition",
    "inline",
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
}


export async function registerSynthesisRoutes(
  app:
    FastifyInstance,
): Promise<void> {
  app.post(
    "/api/synthesis/jobs",

    async (
      request,
      reply,
    ) => {
      const validation =
        synthesisRequestSchema
          .safeParse(
            request.body,
          );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_SYNTHESIS_REQUEST",

              message:
                "The synthesis request is invalid.",

              requestId:
                request.id,

              details:
                validation.error
                  .issues,
            },
          });
      }

      const input =
        validation.data;

      const pronunciation =
        await transformPronunciationText(
          input.text,
          input.storyId,
        );

      const submission =
        await submitSynthesisRequest({
          engine:
            input.engine,

          model:
            getModelName(
              input.engine,
            ),

          displayText:
            pronunciation
              .displayText,

          synthesisText:
            pronunciation
              .synthesisText,

          storyId:
            input.storyId,

          pronunciationRevision:
            pronunciation
              .combinedRevision,

          voice:
            input.voice,

          language:
            input.language,

          speed:
            input.speed,

          instruction:
            input.instruction,

          format:
            "wav",
        });

      if (
        submission.type ===
        "cache-hit"
      ) {
        return reply
          .status(200)
          .send({
            type:
              "cache-hit",

            cacheKey:
              submission.cacheKey,

            audioUrl:
              submission.audioUrl,

            timelineUrl:
              "/api/synthesis/cache/"
              + submission.cacheKey
              + "/timeline",

            timeline:
              submission
                .cache
                .timeline,

            cached:
              true,

            metadata:
              submission
                .cache
                .metadata,
              
            displayText:
              pronunciation
                .displayText,

            synthesisText:
              pronunciation
                .synthesisText,

            pronunciationChanged:
              pronunciation
                .changed,

            pronunciationRevision:
              pronunciation
                .combinedRevision,

            appliedPronunciationRules:
              pronunciation
                .appliedRules,
          });
      }

      if (
        submission.type ===
        "existing-job"
      ) {
        return reply
          .status(200)
          .send({
            type:
              "existing-job",

            cacheKey:
              submission.cacheKey,

            job:
              submission.job,

            jobUrl:
              "/api/synthesis/jobs/"
              + submission.job.id,
            
            displayText:
              pronunciation
                .displayText,

            synthesisText:
              pronunciation
                .synthesisText,

            pronunciationChanged:
              pronunciation
                .changed,

            pronunciationRevision:
              pronunciation
                .combinedRevision,

            appliedPronunciationRules:
              pronunciation
                .appliedRules,
          });
      }

      return reply
        .status(202)
        .send({
          type:
            "new-job",

          cacheKey:
            submission.cacheKey,

          job:
            submission.job,

          jobUrl:
            "/api/synthesis/jobs/"
            + submission.job.id,

          displayText:
            pronunciation
              .displayText,

          synthesisText:
            pronunciation
              .synthesisText,

          pronunciationChanged:
            pronunciation
              .changed,

          pronunciationRevision:
            pronunciation
              .combinedRevision,

          appliedPronunciationRules:
            pronunciation
              .appliedRules,
        });
    },
  );


  app.get(
    "/api/synthesis/jobs",

    async () => {
      return {
        jobs:
          listSynthesisJobs(),

        queue:
          getQueueSnapshot(),
      };
    },
  );


  app.get(
    "/api/synthesis/jobs/:jobId",

    async (
      request,
      reply,
    ) => {
      const parameters =
        request.params as {
          jobId?: string;
        };

      const validation =
        jobIdSchema.safeParse(
          parameters.jobId,
        );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_JOB_ID",

              message:
                "The synthesis job ID is invalid.",

              requestId:
                request.id,
            },
          });
      }

      const job =
        getSynthesisJob(
          validation.data,
        );

      if (!job) {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "JOB_NOT_FOUND",

              message:
                "The synthesis job was not found.",

              requestId:
                request.id,
            },
          });
      }

      return {
        job,
      };
    },
  );


  app.delete(
    "/api/synthesis/jobs/:jobId",

    async (
      request,
      reply,
    ) => {
      const parameters =
        request.params as {
          jobId?: string;
        };

      const validation =
        jobIdSchema.safeParse(
          parameters.jobId,
        );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_JOB_ID",

              message:
                "The synthesis job ID is invalid.",

              requestId:
                request.id,
            },
          });
      }

      const job =
        await cancelSynthesisJob(
          validation.data,
        );

      if (!job) {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "JOB_NOT_FOUND",

              message:
                "The synthesis job was not found.",

              requestId:
                request.id,
            },
          });
      }

      return {
        job,
      };
    },
  );


  app.get(
    "/api/synthesis/queue",

    async () => {
      return getQueueSnapshot();
    },
  );

  app.get(
    "/api/synthesis/cache/:cacheKey/timeline",

    async (
      request,
      reply,
    ) => {
      const parameters =
        request.params as {
          cacheKey?: string;
        };

      const validation =
        cacheKeySchema.safeParse(
          parameters.cacheKey,
        );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_CACHE_KEY",

              message:
                "The cache key is invalid.",

              requestId:
                request.id,
            },
          });
      }

      const cacheEntry =
        await getSynthesisCacheEntry(
          validation.data,
        );

      if (!cacheEntry) {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "CACHE_ENTRY_NOT_FOUND",

              message:
                "The requested cached audio was not found.",

              requestId:
                request.id,
            },
          });
      }

      if (!cacheEntry.timeline) {
        return reply
          .status(409)
          .send({
            error: {
              code:
                "TIMELINE_UNAVAILABLE",

              message:
                "The cached audio does not have usable duration metadata.",

              requestId:
                request.id,
            },
          });
      }

      reply.header(
        "Cache-Control",
        "private, max-age=3600",
      );

      return {
        timeline:
          cacheEntry.timeline,
      };
    },
  );

  app.get(
    "/api/synthesis/cache/:cacheKey/audio",

    async (
      request,
      reply,
    ) => {
      const parameters =
        request.params as {
          cacheKey?: string;
        };

      const validation =
        cacheKeySchema.safeParse(
          parameters.cacheKey,
        );

      if (!validation.success) {
        return reply
          .status(400)
          .send({
            error: {
              code:
                "INVALID_CACHE_KEY",

              message:
                "The synthesis cache key is invalid.",

              requestId:
                request.id,
            },
          });
      }

      const cacheEntry =
        await getSynthesisCacheEntry(
          validation.data,
        );

      if (!cacheEntry) {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "CACHE_ENTRY_NOT_FOUND",

              message:
                "The requested cached audio was not found.",

              requestId:
                request.id,
            },
          });
      }

      try {
        const fileInformation =
          await stat(
            cacheEntry.audioPath,
          );

        if (
          !fileInformation
            .isFile()
          || fileInformation.size
            <= 0
        ) {
          throw new Error(
            "The cached audio file "
            + "is invalid.",
          );
        }

      } catch {
        return reply
          .status(404)
          .send({
            error: {
              code:
                "CACHE_AUDIO_NOT_FOUND",

              message:
                "The cached audio file was not found.",

              requestId:
                request.id,
            },
          });
      }

      return sendAudioFile(
        reply,
        cacheEntry.audioPath,
      );
    },
  );
}