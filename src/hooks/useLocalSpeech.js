import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  splitChapterForSpeech,
} from "../lib/chapterAudio.js";

import {
  SpeechApiError,
  cancelSynthesisJob,
  cleanSynthesisStorage,
  getKokoroStatus,
  getKokoroVoices,
  getLocalServiceHealth,
  getQwenSpeakers,
  getQwenStatus,
  getSynthesisStorage,
  getSynthesisTimeline,
  submitSynthesisJob,
  waitForSynthesisJob,
} from "../services/speechApi.js";


const SETTINGS_KEY =
  "bp-local-speech-settings-v1";


const DEFAULT_SETTINGS = {
  mode:
    "fast",

  kokoroVoice:
    "af_heart",

  qwenSpeaker:
    "Aiden",

  language:
    "English",

  speed:
    1,

  instruction:
    "Speak clearly with a measured pace.",

  browserFallback:
    true,

  autoContinueChapter:
    true,
};


function loadSettings() {
  try {
    const storedValue =
      window.localStorage.getItem(
        SETTINGS_KEY,
      );

    if (!storedValue) {
      return {
        ...DEFAULT_SETTINGS,
      };
    }

    const parsedValue =
      JSON.parse(
        storedValue,
      );

    if (
      !parsedValue
      || typeof parsedValue !==
        "object"
    ) {
      return {
        ...DEFAULT_SETTINGS,
      };
    }

    return {
      ...DEFAULT_SETTINGS,
      ...parsedValue,

      mode:
        parsedValue.mode ===
        "expressive"
          ? "expressive"
          : "fast",

      speed:
        Math.min(
          2,
          Math.max(
            0.5,
            Number(
              parsedValue.speed,
            )
            || 1,
          ),
        ),

      browserFallback:
        parsedValue
          .browserFallback
        !== false,

      autoContinueChapter:
        parsedValue
          .autoContinueChapter
        !== false,
    };

  } catch {
    return {
      ...DEFAULT_SETTINGS,
    };
  }
}


function getErrorMessage(
  error,
) {
  if (
    error instanceof
    SpeechApiError
  ) {
    return error.message;
  }

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return (
    "The local speech operation failed."
  );
}


function normalizeCatalogue(
  response,
  possibleKeys,
) {
  if (
    Array.isArray(
      response,
    )
  ) {
    return response;
  }

  for (
    const key
    of possibleKeys
  ) {
    if (
      Array.isArray(
        response?.[key],
      )
    ) {
      return response[key];
    }
  }

  return [];
}


function normalizeVoiceOption(
  item,
  index,
) {
  if (
    typeof item ===
    "string"
  ) {
    return {
      id:
        item,

      name:
        item,

      language:
        null,
    };
  }

  const id =
    item?.id
    || item?.voice_id
    || item?.voiceId
    || item?.speaker
    || item?.name
    || `voice-${index}`;

  const name =
    item?.display_name
    || item?.displayName
    || item?.label
    || item?.name
    || item?.speaker
    || item?.voice_id
    || id;

  return {
    ...item,

    id:
      String(
        id,
      ),

    name:
      String(
        name,
      ),

    language:
      item?.language
      || item?.lang
      || null,
  };
}


function statusIsAvailable(
  status,
) {
  if (!status) {
    return false;
  }

  if (
    status.ok ===
    false
  ) {
    return false;
  }

  if (
    status.available ===
    false
  ) {
    return false;
  }

  if (
    status.status ===
      "unavailable"
    || status.status ===
      "offline"
    || status.status ===
      "error"
  ) {
    return false;
  }

  return true;
}


export function useLocalSpeech() {
  const [
    settings,
    setSettings,
  ] = useState(
    loadSettings,
  );

  const [
    serviceHealth,
    setServiceHealth,
  ] = useState(
    null,
  );

  const [
    kokoroStatus,
    setKokoroStatus,
  ] = useState(
    null,
  );

  const [
    qwenStatus,
    setQwenStatus,
  ] = useState(
    null,
  );

  const [
    kokoroVoices,
    setKokoroVoices,
  ] = useState(
    [],
  );

  const [
    qwenSpeakers,
    setQwenSpeakers,
  ] = useState(
    [],
  );

  const [
    statusLoading,
    setStatusLoading,
  ] = useState(
    true,
  );

  const [
    statusCheckedAt,
    setStatusCheckedAt,
  ] = useState(
    null,
  );

  const [
    activeJob,
    setActiveJob,
  ] = useState(
    null,
  );

  const [
    submission,
    setSubmission,
  ] = useState(
    null,
  );

  const [
    generationError,
    setGenerationError,
  ] = useState(
    "",
  );

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(
    false,
  );

  const [
    audioUrl,
    setAudioUrl,
  ] = useState(
    "",
  );

  const [
    audioState,
    setAudioState,
  ] = useState(
    "idle",
  );

  const [
    timeline,
    setTimeline,
  ] = useState(
    null,
  );


  const [
    timelineLoading,
    setTimelineLoading,
  ] = useState(
    false,
  );


  const [
    timelineError,
    setTimelineError,
  ] = useState(
    "",
  );


  const [
    currentTimeSeconds,
    setCurrentTimeSeconds,
  ] = useState(
    0,
  );


  const [
    audioDurationSeconds,
    setAudioDurationSeconds,
  ] = useState(
    0,
  );


  const [
    activeTimelineSegmentIndex,
    setActiveTimelineSegmentIndex,
  ] = useState(
    -1,
  );

  const [
    storageStatus,
    setStorageStatus,
  ] = useState(
    null,
  );

  const [
    storageLoading,
    setStorageLoading,
  ] = useState(
    false,
  );

  const [
    storageError,
    setStorageError,
  ] = useState(
    "",
  );

  const [
    lastCleanup,
    setLastCleanup,
  ] = useState(
    null,
  );

  const [
    chapterItems,
    setChapterItems,
  ] = useState(
    [],
  );

  const [
    chapterState,
    setChapterState,
  ] = useState(
    "idle",
  );

  const [
    chapterError,
    setChapterError,
  ] = useState(
    "",
  );

  const [
    chapterCompletedCount,
    setChapterCompletedCount,
  ] = useState(
    0,
  );

  const [
    currentChapterIndex,
    setCurrentChapterIndex,
  ] = useState(
    0,
  );

  const [
    isGeneratingChapter,
    setIsGeneratingChapter,
  ] = useState(
    false,
  );

  const audioRef =
    useRef(
      null,
    );

  const pollingControllerRef =
    useRef(
      null,
    );

  const operationIdRef =
    useRef(
      0,
    );
  
  const chapterControllerRef =
    useRef(
      null,
    );

  const chapterOperationIdRef =
    useRef(
      0,
    );

  const chapterActiveJobIdRef =
    useRef(
      null,
    );

  const chapterItemsRef =
    useRef(
      [],
    );

  const currentChapterIndexRef =
    useRef(
      0,
  );

  const playbackContextRef =
    useRef({
      type:
        "none",

      chapterIndex:
        null,
    });

  const timelineRef =
    useRef(
      null,
  );


  const activeTimelineSegmentIndexRef =
    useRef(
      -1,
  );


  const playbackClockFrameRef =
    useRef(
      null,
  );


  const timelineRequestControllerRef =
    useRef(
      null,
  );

  const autoContinueChapterRef =
    useRef(
      settings.autoContinueChapter,
    );


  useEffect(
    () => {
      try {
        window.localStorage
          .setItem(
            SETTINGS_KEY,
            JSON.stringify(
              settings,
            ),
          );
      } catch {
        return;
      }
    },
    [
      settings,
    ],
  );

  useEffect(
    () => {
      chapterItemsRef.current =
        chapterItems;
    },
    [
      chapterItems,
    ],
  );

  useEffect(
    () => {
      timelineRef.current =
        timeline;
    },
    [
      timeline,
    ],
  );


  useEffect(
    () => {
      activeTimelineSegmentIndexRef.current =
        activeTimelineSegmentIndex;
    },
    [
      activeTimelineSegmentIndex,
    ],
  );

  useEffect(
    () => {
      currentChapterIndexRef.current =
        currentChapterIndex;
    },
    [
      currentChapterIndex,
    ],
  );


  useEffect(
    () => {
      autoContinueChapterRef.current =
        settings.autoContinueChapter;
    },
    [
      settings.autoContinueChapter,
    ],
  );

  useEffect(
    () => {
      return () => {
        pollingControllerRef
          .current
          ?.abort();

        chapterControllerRef
          .current
          ?.abort();
        
        timelineRequestControllerRef
          .current
          ?.abort();


        if (
          playbackClockFrameRef.current
          !== null
        ) {
          window.cancelAnimationFrame(
            playbackClockFrameRef.current,
          );

          playbackClockFrameRef.current =
            null;
        }

        playbackContextRef.current = {
          type:
            "none",

          chapterIndex:
            null,
        };

        if (
          audioRef.current
        ) {
          audioRef.current
            .pause();

          audioRef.current
            .src = "";
        }
      };
    },
    [],
  );

  const updateChapterItem =
    useCallback(
      (
        itemIndex,
        changes,
      ) => {
        setChapterItems(
          (
            currentItems,
          ) => {
            const nextItems =
              currentItems.map(
                (
                  item,
                  index,
                ) => (
                  index === itemIndex
                    ? {
                        ...item,
                        ...changes,
                      }
                    : item
                ),
              );

            chapterItemsRef.current =
              nextItems;

            return nextItems;
          },
        );
      },
      [],
    );

  const updateSettings =
    useCallback(
      (
        changes,
      ) => {
        setSettings(
          (
            current,
          ) => ({
            ...current,
            ...changes,
          }),
        );
      },
      [],
    );


  const refreshStatus =
    useCallback(
      async () => {
        setStatusLoading(
          true,
        );

        const results =
          await Promise
            .allSettled([
              getLocalServiceHealth(),
              getKokoroStatus(),
              getQwenStatus(),
              getKokoroVoices(),
              getQwenSpeakers(),
            ]);

        const [
          serviceResult,
          kokoroResult,
          qwenResult,
          voicesResult,
          speakersResult,
        ] = results;

        setServiceHealth(
          serviceResult.status ===
          "fulfilled"
            ? serviceResult.value
            : null,
        );

        setKokoroStatus(
          kokoroResult.status ===
          "fulfilled"
            ? kokoroResult.value
            : null,
        );

        setQwenStatus(
          qwenResult.status ===
          "fulfilled"
            ? qwenResult.value
            : null,
        );

        if (
          voicesResult.status ===
          "fulfilled"
        ) {
          const catalogue =
            normalizeCatalogue(
              voicesResult.value,
              [
                "voices",
                "items",
                "data",
              ],
            );

          setKokoroVoices(
            catalogue.map(
              normalizeVoiceOption,
            ),
          );
        } else {
          setKokoroVoices(
            [],
          );
        }

        if (
          speakersResult.status ===
          "fulfilled"
        ) {
          const catalogue =
            normalizeCatalogue(
              speakersResult.value,
              [
                "speakers",
                "voices",
                "items",
                "data",
              ],
            );

          setQwenSpeakers(
            catalogue.map(
              normalizeVoiceOption,
            ),
          );
        } else {
          setQwenSpeakers(
            [],
          );
        }

        setStatusCheckedAt(
          Date.now(),
        );

        setStatusLoading(
          false,
        );

        return results;
      },
      [],
    );


  const refreshStorage =
    useCallback(
      async () => {
        setStorageLoading(
          true,
        );

        setStorageError(
          "",
        );

        try {
          const response =
            await getSynthesisStorage();

          const nextStatus =
            response?.status
            || response;

          setStorageStatus(
            nextStatus,
          );

          return nextStatus;

        } catch (error) {
          setStorageStatus(
            null,
          );

          setStorageError(
            getErrorMessage(
              error,
            ),
          );

          return null;

        } finally {
          setStorageLoading(
            false,
          );
        }
      },
      [],
    );


  const runStorageCleanup =
    useCallback(
      async () => {
        setStorageLoading(
          true,
        );

        setStorageError(
          "",
        );

        try {
          const response =
            await cleanSynthesisStorage();

          const result =
            response?.result
            || response;

          setLastCleanup(
            result,
          );

          if (
            result?.after
          ) {
            setStorageStatus(
              result.after,
            );
          } else {
            await refreshStorage();
          }

          return result;

        } catch (error) {
          setStorageError(
            getErrorMessage(
              error,
            ),
          );

          return null;

        } finally {
          setStorageLoading(
            false,
          );
        }
      },
      [
        refreshStorage,
      ],
    );


  useEffect(
    () => {
        const startupTimer =
        window.setTimeout(
            () => {
            void refreshStatus();
            void refreshStorage();
            },
            0,
        );

        return () => {
        window.clearTimeout(
            startupTimer,
        );
        };
    },
    [
        refreshStatus,
        refreshStorage,
    ],
    );


  const serviceConnected =
    Boolean(
      serviceHealth?.ok,
    );


  const kokoroAvailable =
    serviceConnected
    && statusIsAvailable(
      kokoroStatus,
    );


  const qwenAvailable =
    serviceConnected
    && statusIsAvailable(
      qwenStatus,
    );


  const selectedEngine =
    settings.mode ===
    "expressive"
      ? "qwen3-tts"
      : "kokoro";


  const selectedVoice =
    settings.mode ===
    "expressive"
      ? settings.qwenSpeaker
      : settings.kokoroVoice;


  const selectedEngineAvailable =
    selectedEngine ===
    "qwen3-tts"
      ? qwenAvailable
      : kokoroAvailable;


  const browserSpeechAvailable =
    typeof window !==
      "undefined"
    && "speechSynthesis"
      in window;


  const browserFallbackReady =
    settings.browserFallback
    && browserSpeechAvailable;


  const storageUnsafe =
    Boolean(
      storageStatus
        ?.cleanupRequired,
    );


  const storageWarning =
    storageStatus
      ?.minimumFreeSpaceViolated
      ? (
          "Local generation is blocked because "
          + "the disk has less than "
          + storageStatus.minimumFreeDiskGb
          + " GB free."
        )
      : storageStatus
          ?.cacheLimitExceeded
        ? (
            "Local generation is blocked because "
            + "the audio cache exceeds "
            + storageStatus.maximumCacheGb
            + " GB."
          )
        : "";


  const selectedEngineMessage =
    !serviceConnected
      ? "The local Node service is offline."
      : selectedEngine ===
          "qwen3-tts"
        && !qwenAvailable
        ? "The Expressive Qwen engine is offline."
        : selectedEngine ===
            "kokoro"
          && !kokoroAvailable
          ? "The Fast Kokoro engine is offline."
          : "";


  const canGenerate =
    serviceConnected
    && selectedEngineAvailable
    && !storageUnsafe
    && !isSubmitting
    && !isGeneratingChapter;

  const progress =
    Number(
      activeJob?.progress,
    )
    || 0;

  const chapterProgress =
    useMemo(
      () => {
        if (
          chapterItems.length ===
          0
        ) {
          return 0;
        }

        const accumulatedProgress =
          chapterItems.reduce(
            (
              total,
              item,
            ) => (
              total
              + (
                Number(
                  item.progress,
                )
                || 0
              )
            ),
            0,
          );

        return Math.round(
          accumulatedProgress
          / chapterItems.length,
        );
      },
      [
        chapterItems,
      ],
    );


  const currentChapterItem =
    chapterItems[
      currentChapterIndex
    ]
    || null;


  const activeTimelineSegment =
    activeTimelineSegmentIndex >= 0
      ? (
          timeline
            ?.segments
            ?.[
              activeTimelineSegmentIndex
            ]
          || null
        )
      : null;


  const currentSpeakerName =
    activeTimelineSegment
      ?.speakerName
    || null;


  const currentSegmentKind =
    activeTimelineSegment
      ?.kind
    || null;


  const speakerTransition =
    Boolean(
      activeTimelineSegment
        ?.speakerTransition,
    );


  const timelineProgress =
    audioDurationSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (
              currentTimeSeconds
              / audioDurationSeconds
            )
            * 100,
          ),
        )
      : 0;


  const queuePosition =
    activeJob?.queuePosition
    ?? null;


  const jobState =
    activeJob?.state
    || "idle";


  const jobMessage =
    activeJob?.progressMessage
    || "";


  function findTimelineSegmentIndex(
    timelineValue,
    currentTime,
  ) {
    const segments =
      timelineValue
        ?.segments;

    if (
      !Array.isArray(
        segments,
      )
      || segments.length === 0
    ) {
      return -1;
    }

    for (
      let index = 0;
      index <
        segments.length;
      index += 1
    ) {
      const segment =
        segments[
          index
        ];

      const isFinalSegment =
        index ===
        segments.length - 1;

      if (
        currentTime >=
          Number(
            segment.startSeconds,
          )
        && (
          currentTime <
            Number(
              segment.endSeconds,
            )
          || (
            isFinalSegment
            && currentTime <=
              Number(
                segment.endSeconds,
              )
          )
        )
      ) {
        return index;
      }
    }

    if (
      currentTime >=
      Number(
        segments[
          segments.length - 1
        ]?.endSeconds,
      )
    ) {
      return segments.length - 1;
    }

    return -1;
  }

  function normalizeTimelineResponse(
    response,
  ) {
    const timelineValue =
      response?.timeline
      || response;

    if (
      !timelineValue
      || !Array.isArray(
        timelineValue.segments,
      )
    ) {
      return null;
    }

    return timelineValue;
  }

  const resetTimelinePlayback =
    useCallback(
      () => {
        timelineRequestControllerRef
          .current
          ?.abort();

        timelineRequestControllerRef.current =
          null;

        if (
          playbackClockFrameRef.current
          !== null
        ) {
          window.cancelAnimationFrame(
            playbackClockFrameRef.current,
          );

          playbackClockFrameRef.current =
            null;
        }

        timelineRef.current =
          null;

        activeTimelineSegmentIndexRef.current =
          -1;

        setTimeline(
          null,
        );

        setTimelineLoading(
          false,
        );

        setTimelineError(
          "",
        );

        setCurrentTimeSeconds(
          0,
        );

        setAudioDurationSeconds(
          0,
        );

        setActiveTimelineSegmentIndex(
          -1,
        );
      },
      [],
    );
  
  const loadTimeline =
    useCallback(
      async ({
        cacheKey,
        inlineTimeline = null,
      }) => {
        timelineRequestControllerRef
          .current
          ?.abort();

        const controller =
          new AbortController();

        timelineRequestControllerRef.current =
          controller;

        setTimelineLoading(
          true,
        );

        setTimelineError(
          "",
        );

        try {
          let timelineValue =
            normalizeTimelineResponse(
              inlineTimeline,
            );

          if (
            !timelineValue
            && cacheKey
          ) {
            const response =
              await getSynthesisTimeline(
                cacheKey,
                {
                  signal:
                    controller.signal,
                },
              );

            timelineValue =
              normalizeTimelineResponse(
                response,
              );
          }

          if (!timelineValue) {
            throw new SpeechApiError({
              code:
                "INVALID_TIMELINE_RESPONSE",

              message:
                "The local speech service returned an invalid timeline.",

              status:
                null,
            });
          }

          timelineRef.current =
            timelineValue;

          activeTimelineSegmentIndexRef.current =
            -1;

          setTimeline(
            timelineValue,
          );

          setAudioDurationSeconds(
            Number(
              timelineValue
                .durationSeconds,
            )
            || 0,
          );

          setActiveTimelineSegmentIndex(
            -1,
          );

          return timelineValue;

        } catch (error) {
          if (
            error instanceof
              SpeechApiError
            && error.code ===
              "LOCAL_REQUEST_CANCELLED"
          ) {
            return null;
          }

          setTimeline(
            null,
          );

          timelineRef.current =
            null;

          setTimelineError(
            getErrorMessage(
              error,
            ),
          );

          return null;

        } finally {
          if (
            timelineRequestControllerRef
              .current ===
            controller
          ) {
            timelineRequestControllerRef.current =
              null;

            setTimelineLoading(
              false,
            );
          }
        }
      },
      [],
    );

  const stopPlaybackClock =
    useCallback(
      () => {
        if (
          playbackClockFrameRef.current
          !== null
        ) {
          window.cancelAnimationFrame(
            playbackClockFrameRef.current,
          );

          playbackClockFrameRef.current =
            null;
        }
      },
      [],
    );

  const updatePlaybackClock =
    useCallback(
      function updateClock() {
        const audio =
          audioRef.current;

        if (!audio) {
          playbackClockFrameRef.current =
            null;

          return;
        }

        const currentTime =
          Number(
            audio.currentTime,
          )
          || 0;

        const duration =
          Number.isFinite(
            audio.duration,
          )
            ? audio.duration
            : (
                Number(
                  timelineRef
                    .current
                    ?.durationSeconds,
                )
                || 0
              );

        setCurrentTimeSeconds(
          currentTime,
        );

        setAudioDurationSeconds(
          duration,
        );

        const nextSegmentIndex =
          findTimelineSegmentIndex(
            timelineRef.current,
            currentTime,
          );

        if (
          nextSegmentIndex !==
          activeTimelineSegmentIndexRef
            .current
        ) {
          activeTimelineSegmentIndexRef.current =
            nextSegmentIndex;

          setActiveTimelineSegmentIndex(
            nextSegmentIndex,
          );
        }

        if (
          !audio.paused
          && !audio.ended
        ) {
          playbackClockFrameRef.current =
            window.requestAnimationFrame(
              updateClock,
            );

          return;
        }

        playbackClockFrameRef.current =
          null;
      },
      [],
    );

  const stopAudio =
    useCallback(
      () => {
        playbackContextRef.current = {
          type:
            "none",

          chapterIndex:
            null,
        };

        stopPlaybackClock();

        if (
          audioRef.current
        ) {
          audioRef.current
            .pause();

          audioRef.current
            .currentTime = 0;
        }

        setCurrentTimeSeconds(
          0,
        );

        const firstSegmentIndex =
          timelineRef.current
            ?.segments
            ?.length > 0
            ? 0
            : -1;

        activeTimelineSegmentIndexRef.current =
          firstSegmentIndex;

        setActiveTimelineSegmentIndex(
          firstSegmentIndex,
        );

        setAudioState(
          "idle",
        );
      },
      [
        stopPlaybackClock,
      ],
    );

  const playAudio =
  useCallback(
    async (
      requestedUrl =
        audioUrl,

      playbackOptions = {},
    ) => {
      if (
        !requestedUrl
      ) {
        return false;
      }

      const playbackType =
        playbackOptions.type
        || "passage";

      const chapterIndex =
        Number.isInteger(
          playbackOptions
            .chapterIndex,
        )
          ? playbackOptions
              .chapterIndex
          : null;

      const cacheKey =
        playbackOptions.cacheKey
        || "";

      const inlineTimeline =
        playbackOptions.timeline
        || null;

      let audio =
        audioRef.current;

      if (!audio) {
        audio =
          new Audio();

        audioRef.current =
          audio;
      }

      playbackContextRef.current = {
        type:
          playbackType,

        chapterIndex,
      };

      if (
        chapterIndex !==
        null
      ) {
        currentChapterIndexRef.current =
          chapterIndex;

        setCurrentChapterIndex(
          chapterIndex,
        );
      }

      const absoluteUrl =
        new URL(
          requestedUrl,
          window.location.href,
        ).href;

      if (
        audio.src !==
        absoluteUrl
      ) {
        audio.src =
          requestedUrl;
      }

      audio.onplay =
        () => {
          setAudioState(
            "playing",
          );

          stopPlaybackClock();

          playbackClockFrameRef.current =
            window.requestAnimationFrame(
              updatePlaybackClock,
            );
        };

      audio.onpause =
        () => {
          stopPlaybackClock();

          setCurrentTimeSeconds(
            Number(
              audio.currentTime,
            )
            || 0,
          );

          if (
            !audio.ended
          ) {
            setAudioState(
              "paused",
            );
          }
        };

      audio.onerror =
        () => {
          stopPlaybackClock();
          playbackContextRef.current = {
            type:
              "none",

            chapterIndex:
              null,
          };

          setAudioState(
            "failed",
          );

          setGenerationError(
            "The cached audio could not be played.",
          );
        };

      audio.onended =
        () => {
          stopPlaybackClock();

          setCurrentTimeSeconds(
            Number(
              audio.duration,
            )
            || Number(
              timelineRef.current
                ?.durationSeconds,
            )
            || 0,
          );
          const playbackContext =
            playbackContextRef
              .current;

          if (
            playbackContext.type !==
              "chapter"
            || !autoContinueChapterRef
              .current
            || playbackContext
              .chapterIndex ===
              null
          ) {
            playbackContextRef.current = {
              type:
                "none",

              chapterIndex:
                null,
            };

            setAudioState(
              "completed",
            );

            return;
          }

          const items =
            chapterItemsRef.current;

          let nextIndex =
            -1;

          for (
            let index =
              playbackContext
                .chapterIndex
              + 1;
            index <
              items.length;
            index += 1
          ) {
            if (
              items[index]
                ?.state ===
                "completed"
              && items[index]
                ?.audioUrl
            ) {
              nextIndex =
                index;

              break;
            }
          }

          if (
            nextIndex < 0
          ) {
            playbackContextRef.current = {
              type:
                "none",

              chapterIndex:
                null,
            };

            setAudioState(
              "completed",
            );

            return;
          }

          const nextItem =
            items[
              nextIndex
            ];

          playbackContextRef.current = {
            type:
              "chapter",

            chapterIndex:
              nextIndex,
          };

          currentChapterIndexRef.current =
            nextIndex;

          setCurrentChapterIndex(
            nextIndex,
          );

          void loadTimeline({
            cacheKey:
              nextItem.cacheKey,
            inlineTimeline:
              nextItem.timeline
              || null,
          });

          audio.src =
            nextItem.audioUrl;

          setAudioState(
            "ready",
          );

          void audio
            .play()
            .catch(
              (
                error,
              ) => {
                playbackContextRef.current = {
                  type:
                    "none",

                  chapterIndex:
                    null,
                };

                setAudioState(
                  "failed",
                );

                setGenerationError(
                  getErrorMessage(
                    error,
                  ),
                );
              },
            );
        };

      try {
        if (
          inlineTimeline
          || cacheKey
        ) {
          await loadTimeline({
            cacheKey,
            inlineTimeline,
          });
        }

        stopPlaybackClock();

        await audio.play();

        return true;

      } catch (error) {
        playbackContextRef.current = {
          type:
            "none",

          chapterIndex:
            null,
        };

        setAudioState(
          "failed",
        );

        setGenerationError(
          getErrorMessage(
            error,
          ),
        );

        return false;
      }
    },
    [
      audioUrl,
      loadTimeline,
      stopPlaybackClock,
      updatePlaybackClock,
    ],
  );


  const pauseAudio =
    useCallback(
      () => {
        audioRef.current
          ?.pause();
      },
      [],
    );

  const generateChapterItem =
    useCallback(
      async ({
        item,
        itemIndex,
        storyId,
        operationId,
        controller,
      }) => {
        updateChapterItem(
          itemIndex,
          {
            state:
              "submitting",

            progress:
              0,

            progressMessage:
              "Submitting chapter passage.",

            error:
              null,
          },
        );

        const response =
          await submitSynthesisJob(
            {
              engine:
                selectedEngine,

              text:
                item.text,

              storyId,

              voice:
                selectedVoice,

              language:
                settings.language,

              speed:
                settings.speed,

              instruction:
                selectedEngine ===
                "qwen3-tts"
                  ? settings
                      .instruction
                  : "",
            },
            {
              signal:
                controller.signal,
            },
          );

        if (
          operationId !==
          chapterOperationIdRef.current
        ) {
          return null;
        }

        if (
          response?.type ===
          "cache-hit"
        ) {
          const cachedUrl =
            response.audioUrl
            || "";

          updateChapterItem(
            itemIndex,
            {
              state:
                "completed",

              progress:
                100,

              progressMessage:
                "Loaded from local cache.",

              submissionType:
                "cache-hit",

              timeline:
                response.timeline
                || null,

              timelineUrl:
                response.timelineUrl
                || (
                  response.cacheKey
                    ? (
                        "/api/synthesis/cache/"
                        + response.cacheKey
                        + "/timeline"
                      )
                    : ""
                ),

              cacheKey:
                response.cacheKey
                || "",

              audioUrl:
                cachedUrl,

              cached:
                true,

              jobId:
                null,

              error:
                null,
            },
          );

          return {
            audioUrl:
              cachedUrl,

            cached:
              true,
          };
        }

        const submittedJob =
          response?.job;

        if (
          !submittedJob?.id
        ) {
          throw new SpeechApiError({
            code:
              "INVALID_CHAPTER_JOB",

            message:
              "The local speech service did not return a chapter synthesis job.",

            status:
              null,
          });
        }

        chapterActiveJobIdRef.current =
          submittedJob.id;

        updateChapterItem(
          itemIndex,
          {
            state:
              submittedJob.state
              || "queued",

            progress:
              Number(
                submittedJob.progress,
              )
              || 0,

            progressMessage:
              submittedJob
                .progressMessage
              || "Waiting in the synthesis queue.",

            submissionType:
              response.type,

            timeline:
              null,

            timelineUrl:
              response.cacheKey
                ? (
                    "/api/synthesis/cache/"
                    + response.cacheKey
                    + "/timeline"
                  )
                : "",

            cacheKey:
              response.cacheKey
              || "",

            jobId:
              submittedJob.id,

            cached:
              false,
          },
        );

        const finalJob =
          await waitForSynthesisJob(
            submittedJob.id,
            {
              signal:
                controller.signal,

              onUpdate:
                (
                  job,
                ) => {
                  if (
                    operationId !==
                    chapterOperationIdRef
                      .current
                  ) {
                    return;
                  }

                  updateChapterItem(
                    itemIndex,
                    {
                      state:
                        job.state,

                      progress:
                        Number(
                          job.progress,
                        )
                        || 0,

                      progressMessage:
                        job.progressMessage
                        || "",

                      jobId:
                        job.id,
                    },
                  );
                },
            },
          );

        chapterActiveJobIdRef.current =
          null;

        if (
          finalJob.state ===
          "failed"
        ) {
          throw new SpeechApiError({
            code:
              finalJob.error
                ?.code
              || "CHAPTER_SYNTHESIS_FAILED",

            message:
              finalJob.error
                ?.message
              || "A chapter passage could not be generated.",

            status:
              null,

            details:
              finalJob.error,
          });
        }

        if (
          finalJob.state ===
          "cancelled"
        ) {
          updateChapterItem(
            itemIndex,
            {
              state:
                "cancelled",

              progressMessage:
                "Chapter passage generation was cancelled.",

              error:
                null,
            },
          );

          return null;
        }

        const completedUrl =
          finalJob.result
            ?.audioUrl
          || "";

        updateChapterItem(
          itemIndex,
          {
            state:
              "completed",

            progress:
              100,

            progressMessage:
              finalJob
                .result
                ?.cached
                ? "Loaded from local cache."
                : "Generated and stored locally.",

            audioUrl:
              completedUrl,

            cacheKey:
              finalJob.result
                ?.cacheKey
              || response.cacheKey
              || "",

            timeline:
              finalJob.result
                ?.timeline
              || null,

            timelineUrl:
              finalJob.result
                ?.timelineUrl
              || (
                (
                  finalJob.result
                    ?.cacheKey
                  || response.cacheKey
                )
                  ? (
                      "/api/synthesis/cache/"
                      + (
                          finalJob.result
                            ?.cacheKey
                          || response.cacheKey
                        )
                      + "/timeline"
                    )
                  : ""
              ),

            cached:
              Boolean(
                finalJob.result
                  ?.cached,
              ),

            jobId:
              finalJob.id,

            error:
              null,
          },
        );

        return {
          audioUrl:
            completedUrl,

          cached:
            Boolean(
              finalJob.result
                ?.cached,
            ),
        };
      },
      [
        selectedEngine,
        selectedVoice,
        settings.instruction,
        settings.language,
        settings.speed,
        updateChapterItem,
      ],
    );

  const generatePassage =
    useCallback(
      async ({
        text,
        storyId = null,
        autoPlay = true,
      }) => {
        const normalizedText =
          String(
            text
            || "",
          ).trim();

        if (!normalizedText) {
          setGenerationError(
            "No passage text was provided.",
          );

          return null;
        }

        pollingControllerRef
          .current
          ?.abort();

        operationIdRef.current +=
          1;

        const operationId =
          operationIdRef.current;

        const controller =
          new AbortController();

        pollingControllerRef.current =
          controller;

        setGenerationError(
          "",
        );

        setSubmission(
          null,
        );

        setActiveJob(
          null,
        );

        setAudioUrl(
          "",
        );

        setAudioState(
          "idle",
        );

        setIsSubmitting(
          true,
        );

        stopAudio();

        resetTimelinePlayback();

        try {
          const response =
            await submitSynthesisJob(
              {
                engine:
                  selectedEngine,

                text:
                  normalizedText,

                storyId,

                voice:
                  selectedVoice,

                language:
                  settings.language,

                speed:
                  settings.speed,

                instruction:
                  selectedEngine ===
                  "qwen3-tts"
                    ? settings
                        .instruction
                    : "",
              },
              {
                signal:
                  controller.signal,
              },
            );

          if (
            operationId !==
            operationIdRef.current
          ) {
            return null;
          }

          setSubmission(
            response,
          );

          if (
            response?.type ===
            "cache-hit"
          ) {
            const cachedUrl =
              response.audioUrl
              || "";

            await loadTimeline({
              cacheKey:
                response.cacheKey,

              inlineTimeline:
                response.timeline
                || null,
            });

            setAudioUrl(
              cachedUrl,
            );

            setAudioState(
              "ready",
            );

            setIsSubmitting(
              false,
            );

            if (
              autoPlay
              && cachedUrl
            ) {
              await playAudio(
                cachedUrl,
                {
                  type:
                    "passage",

                  cacheKey:
                    response.cacheKey,

                  timeline:
                    response.timeline
                    || null,
                },
              );
            }

            return {
              submission:
                response,

              job:
                null,

              audioUrl:
                cachedUrl,
            };
          }

          const submittedJob =
            response?.job;

          if (
            !submittedJob?.id
          ) {
            throw new SpeechApiError({
              code:
                "INVALID_JOB_SUBMISSION",

              message:
                "The local speech service did not return a synthesis job.",

              status:
                null,
            });
          }

          setActiveJob(
            submittedJob,
          );

          const finalJob =
            await waitForSynthesisJob(
              submittedJob.id,
              {
                signal:
                  controller.signal,

                onUpdate:
                  (
                    job,
                  ) => {
                    if (
                      operationId ===
                      operationIdRef
                        .current
                    ) {
                      setActiveJob(
                        job,
                      );
                    }
                  },
              },
            );

          if (
            operationId !==
            operationIdRef.current
          ) {
            return null;
          }

          setActiveJob(
            finalJob,
          );

          if (
            finalJob.state ===
            "failed"
          ) {
            throw new SpeechApiError({
              code:
                finalJob.error
                  ?.code
                || "SYNTHESIS_FAILED",

              message:
                finalJob.error
                  ?.message
                || "Local synthesis failed.",

              status:
                null,

              details:
                finalJob.error,
            });
          }

          if (
            finalJob.state ===
            "cancelled"
          ) {
            setGenerationError(
              "",
            );

            return {
              submission:
                response,

              job:
                finalJob,

              audioUrl:
                "",
            };
          }

          const completedUrl =
            finalJob.result
              ?.audioUrl
            || "";

          await loadTimeline({
            cacheKey:
              finalJob.result
                ?.cacheKey
              || response.cacheKey,

            inlineTimeline:
              finalJob.result
                ?.timeline
              || null,
          });

          setAudioUrl(
            completedUrl,
          );

          setAudioState(
            completedUrl
              ? "ready"
              : "idle",
          );

          if (
            autoPlay
            && completedUrl
          ) {
            await playAudio(
              completedUrl,
              {
                type:
                  "passage",

                cacheKey:
                  finalJob.result
                    ?.cacheKey,

                timeline:
                  finalJob.result
                    ?.timeline
                  || null,
              },
            );
          }

          void refreshStorage();

          return {
            submission:
              response,

            job:
              finalJob,

            audioUrl:
              completedUrl,
          };

        } catch (error) {
          if (
            error instanceof
              SpeechApiError
            && error.code ===
              "LOCAL_REQUEST_CANCELLED"
          ) {
            return null;
          }

          setGenerationError(
            getErrorMessage(
              error,
            ),
          );

          return null;

        } finally {
          if (
            operationId ===
            operationIdRef.current
          ) {
            setIsSubmitting(
              false,
            );
          }
        }
      },
      [
        loadTimeline,
        playAudio,
        refreshStorage,
        resetTimelinePlayback,
        selectedEngine,
        selectedVoice,
        settings.instruction,
        settings.language,
        settings.speed,
        stopAudio,
      ],
    );

  const generateChapter =
    useCallback(
      async ({
        text,
        storyId = null,
        autoPlay = true,
      }) => {
        const normalizedText =
          String(
            text
            || "",
          ).trim();

        if (!normalizedText) {
          setChapterError(
            "No chapter text was provided.",
          );

          return null;
        }

        chapterControllerRef
          .current
          ?.abort();

        chapterOperationIdRef.current +=
          1;

        const operationId =
          chapterOperationIdRef.current;

        const controller =
          new AbortController();

        chapterControllerRef.current =
          controller;

        chapterActiveJobIdRef.current =
          null;

        resetTimelinePlayback();

        const chunks =
          splitChapterForSpeech(
            normalizedText,
            {
              mode:
                settings.mode,
            },
          );

        if (
          chunks.length === 0
        ) {
          setChapterError(
            "The chapter could not be divided into synthesis passages.",
          );

          return null;
        }

        const initialItems =
          chunks.map(
            (
              chunk,
            ) => ({
              ...chunk,

              state:
                "pending",

              progress:
                0,

              progressMessage:
                "Waiting for chapter generation.",

              submissionType:
                null,

              jobId:
                null,

              cacheKey:
                "",

              audioUrl:
                "",

              timeline:
                null,

              timelineUrl:
                "",

              cached:
                false,

              error:
                null,
            }),
          );

        chapterItemsRef.current =
          initialItems;

        setChapterItems(
          initialItems,
        );

        setChapterState(
          "generating",
        );

        setChapterError(
          "",
        );

        setChapterCompletedCount(
          0,
        );

        setCurrentChapterIndex(
          0,
        );

        setIsGeneratingChapter(
          true,
        );

        stopAudio();

        const generatedItems = [
          ...initialItems,
        ];

        try {
          for (
            let itemIndex = 0;
            itemIndex <
              initialItems.length;
            itemIndex += 1
          ) {
            if (
              controller.signal
                .aborted
              || operationId !==
                chapterOperationIdRef
                  .current
            ) {
              break;
            }

            setCurrentChapterIndex(
              itemIndex,
            );

            const item =
              initialItems[
                itemIndex
              ];

            try {
              const result =
                await generateChapterItem({
                  item,
                  itemIndex,
                  storyId,
                  operationId,
                  controller,
                });

              if (
                !result
                && controller.signal
                  .aborted
              ) {
                break;
              }

              generatedItems[
                itemIndex
              ] = {
                ...chapterItemsRef
                  .current[
                    itemIndex
                  ],
              };

              setChapterCompletedCount(
                itemIndex + 1,
              );

            } catch (error) {
              if (
                controller.signal
                  .aborted
                || (
                  error instanceof
                    SpeechApiError
                  && error.code ===
                    "LOCAL_REQUEST_CANCELLED"
                )
              ) {
                break;
              }

              const message =
                getErrorMessage(
                  error,
                );

              updateChapterItem(
                itemIndex,
                {
                  state:
                    "failed",

                  progressMessage:
                    "Chapter passage generation failed.",

                  error:
                    message,
                },
              );

              setChapterError(
                `Passage ${itemIndex + 1} failed: ${message}`,
              );

              setChapterState(
                "failed",
              );

              return null;
            }
          }

          if (
            controller.signal
              .aborted
            || operationId !==
              chapterOperationIdRef
                .current
          ) {
            setChapterState(
              "cancelled",
            );

            return null;
          }

          const finalItems =
            chapterItemsRef.current;

          const completedItems =
            finalItems.filter(
              (
                item,
              ) => (
                item.state ===
                  "completed"
                && item.audioUrl
              ),
            );

          setChapterCompletedCount(
            completedItems.length,
          );

          setChapterState(
            completedItems.length ===
            finalItems.length
              ? "completed"
              : "failed",
          );

          if (
            autoPlay
            && completedItems.length >
              0
          ) {
            const firstPlayableIndex =
              finalItems.findIndex(
                (
                  item,
                ) => (
                  item.state ===
                    "completed"
                  && item.audioUrl
                ),
              );

            if (
              firstPlayableIndex >= 0
            ) {
              setCurrentChapterIndex(
                firstPlayableIndex,
              );

              currentChapterIndexRef.current =
                firstPlayableIndex;

              await playAudio(
                finalItems[
                  firstPlayableIndex
                ].audioUrl,
                {
                  type:
                    "chapter",

                  chapterIndex:
                    firstPlayableIndex,

                  cacheKey:
                    finalItems[
                      firstPlayableIndex
                    ].cacheKey,

                  timeline:
                    finalItems[
                      firstPlayableIndex
                    ].timeline
                    || null,
                },
              );

            }
          }

          void refreshStorage();

          return finalItems;

        } finally {
          chapterActiveJobIdRef.current =
            null;

          if (
            operationId ===
            chapterOperationIdRef.current
          ) {
            setIsGeneratingChapter(
              false,
            );
          }
        }
      },
      [
        generateChapterItem,
        playAudio,
        refreshStorage,
        resetTimelinePlayback,
        settings.mode,
        stopAudio,
        updateChapterItem,
      ],
    );

  const cancelChapterGeneration =
    useCallback(
      async () => {
        chapterOperationIdRef.current +=
          1;

        chapterControllerRef
          .current
          ?.abort();

        const activeJobId =
          chapterActiveJobIdRef.current;

        chapterActiveJobIdRef.current =
          null;

        if (activeJobId) {
          try {
            await cancelSynthesisJob(
              activeJobId,
            );

          } catch (error) {
            setChapterError(
              getErrorMessage(
                error,
              ),
            );
          }
        }

        setChapterItems(
          (
            currentItems,
          ) => {
            const nextItems =
              currentItems.map(
                (
                  item,
                ) => {
                  if (
                    item.state ===
                      "completed"
                    || item.state ===
                      "failed"
                  ) {
                    return item;
                  }

                  return {
                    ...item,

                    state:
                      "cancelled",

                    progressMessage:
                      "Chapter generation was cancelled.",
                  };
                },
              );

            chapterItemsRef.current =
              nextItems;

            return nextItems;
          },
        );

        setChapterState(
          "cancelled",
        );

        setIsGeneratingChapter(
          false,
        );
      },
      [],
    );

  const playChapterItem =
    useCallback(
      async (
        requestedIndex,
      ) => {
        const items =
          chapterItemsRef.current;

        const item =
          items[
            requestedIndex
          ];

        if (
          !item?.audioUrl
          || item.state !==
            "completed"
        ) {
          return false;
        }

        setCurrentChapterIndex(
          requestedIndex,
        );

        currentChapterIndexRef.current =
          requestedIndex;

        return playAudio(
          item.audioUrl,
          {
            type:
              "chapter",

            chapterIndex:
              requestedIndex,

            cacheKey:
              item.cacheKey,

            timeline:
              item.timeline
              || null,
          },
        );
      },
      [
        playAudio,
      ],
    );


  const playChapter =
    useCallback(
      async () => {
        const items =
          chapterItemsRef.current;

        if (
          items.length === 0
        ) {
          return false;
        }

        const currentItem =
          items[
            currentChapterIndex
          ];

        if (
          currentItem?.audioUrl
          && currentItem.state ===
            "completed"
        ) {
          return playChapterItem(
            currentChapterIndex,
          );
        }

        const firstPlayableIndex =
          items.findIndex(
            (
              item,
            ) => (
              item.state ===
                "completed"
              && item.audioUrl
            ),
          );

        if (
          firstPlayableIndex < 0
        ) {
          return false;
        }

        return playChapterItem(
          firstPlayableIndex,
        );
      },
      [
        currentChapterIndex,
        playChapterItem,
      ],
    );


  const nextChapterItem =
    useCallback(
      async () => {
        const items =
          chapterItemsRef.current;

        for (
          let index =
            currentChapterIndexRef.current + 1;
          index <
            items.length;
          index += 1
        ) {
          if (
            items[index]
              ?.state ===
              "completed"
            && items[index]
              ?.audioUrl
          ) {
            return playChapterItem(
              index,
            );
          }
        }

        return false;
      },
      [
        playChapterItem,
      ],
    );


  const previousChapterItem =
    useCallback(
      async () => {
        const items =
          chapterItemsRef.current;

        for (
          let index =
            currentChapterIndexRef.current - 1;
          index >= 0;
          index -= 1
        ) {
          if (
            items[index]
              ?.state ===
              "completed"
            && items[index]
              ?.audioUrl
          ) {
            return playChapterItem(
              index,
            );
          }
        }

        return false;
      },
      [
        playChapterItem,
      ],
    );


  const resetChapter =
    useCallback(
      () => {
        chapterOperationIdRef.current +=
          1;

        chapterControllerRef
          .current
          ?.abort();

        chapterActiveJobIdRef.current =
          null;

        chapterItemsRef.current =
          [];

        currentChapterIndexRef.current = 0;

        playbackContextRef.current = {
          type:
            "none",

          chapterIndex:
            null,
        };

        setChapterItems(
          [],
        );

        setChapterState(
          "idle",
        );

        setChapterError(
          "",
        );

        setChapterCompletedCount(
          0,
        );

        setCurrentChapterIndex(
          0,
        );

        setIsGeneratingChapter(
          false,
        );

        stopAudio();

        resetTimelinePlayback();
      },
      [
        stopAudio,
        resetTimelinePlayback,
      ],
    );

  const cancelGeneration =
    useCallback(
      async () => {
        operationIdRef.current +=
          1;

        pollingControllerRef
          .current
          ?.abort();

        const jobId =
          activeJob?.id;

        if (
          !jobId
        ) {
          setIsSubmitting(
            false,
          );

          return null;
        }

        try {
          const response =
            await cancelSynthesisJob(
              jobId,
            );

          if (
            response?.job
          ) {
            setActiveJob(
              response.job,
            );
          }

          return response;

        } catch (error) {
          setGenerationError(
            getErrorMessage(
              error,
            ),
          );

          return null;

        } finally {
          setIsSubmitting(
            false,
          );
        }
      },
      [
        activeJob?.id,
      ],
    );


  const resetGeneration =
    useCallback(
      () => {
        operationIdRef.current +=
          1;

        pollingControllerRef
          .current
          ?.abort();

        stopAudio();

        resetTimelinePlayback();

        setActiveJob(
          null,
        );

        setSubmission(
          null,
        );

        setGenerationError(
          "",
        );

        setAudioUrl(
          "",
        );

        setAudioState(
          "idle",
        );

        setIsSubmitting(
          false,
        );
      },
      [
        stopAudio,
        resetTimelinePlayback,
      ],
    );


  const connectionSummary =
    useMemo(
      () => ({
        service:
          serviceConnected,

        kokoro:
          kokoroAvailable,

        qwen:
          qwenAvailable,

        selectedEngine:
          selectedEngineAvailable,

        browserFallback:
          browserFallbackReady,
      }),
      [
        browserFallbackReady,
        kokoroAvailable,
        qwenAvailable,
        selectedEngineAvailable,
        serviceConnected,
      ],
    );


  return {
    settings,
    updateSettings,

    serviceHealth,
    kokoroStatus,
    qwenStatus,
    kokoroVoices,
    qwenSpeakers,
    statusLoading,
    statusCheckedAt,
    refreshStatus,

    serviceConnected,
    kokoroAvailable,
    qwenAvailable,
    selectedEngine,
    selectedVoice,
    selectedEngineAvailable,
    browserSpeechAvailable,
    browserFallbackReady,
    connectionSummary,

    selectedEngineMessage,
    storageUnsafe,
    storageWarning,

    activeJob,
    submission,
    isSubmitting,
    generationError,
    setGenerationError,
    canGenerate,
    progress,
    queuePosition,
    jobState,
    jobMessage,

    generatePassage,
    cancelGeneration,
    resetGeneration,

    generateChapter,
    cancelChapterGeneration,
    resetChapter,

    chapterItems,
    chapterState,
    chapterError,
    chapterCompletedCount,
    chapterProgress,
    currentChapterIndex,
    currentChapterItem,
    isGeneratingChapter,

    playChapter,
    playChapterItem,
    nextChapterItem,
    previousChapterItem,

    audioUrl,
    audioState,

    timeline,
    timelineLoading,
    timelineError,
    loadTimeline,
    resetTimelinePlayback,

    currentTimeSeconds,
    audioDurationSeconds,
    timelineProgress,

    activeTimelineSegment,
    activeTimelineSegmentIndex,
    currentSpeakerName,
    currentSegmentKind,
    speakerTransition,

    playAudio,
    pauseAudio,
    stopAudio,

    storageStatus,
    storageLoading,
    storageError,
    lastCleanup,
    refreshStorage,
    runStorageCleanup,
  };
}