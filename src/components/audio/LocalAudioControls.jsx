import {
  Database,
  Gauge,
  HardDrive,
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Volume2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

import {
  useEffect,
} from "react";

import {
  useLocalSpeech,
} from "../../hooks/useLocalSpeech.js";


function formatGigabytes(
  value,
) {
  const numericValue =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return "Unknown";
  }

  if (
    numericValue < 0.01
  ) {
    return `${(
      numericValue
      * 1024
    ).toFixed(1)} MB`;
  }

  return `${numericValue.toFixed(2)} GB`;
}

function formatPlaybackTime(
  value,
) {
  const seconds =
    Math.max(
      0,
      Math.floor(
        Number(
          value,
        )
        || 0,
      ),
    );

  const minutes =
    Math.floor(
      seconds / 60,
    );

  const remainingSeconds =
    seconds % 60;

  return (
    String(
      minutes,
    )
    + ":"
    + String(
      remainingSeconds,
    ).padStart(
      2,
      "0",
    )
  );
}

function StatusIndicator({
  available,
  label,
  secondary,
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stone-800">
          {label}
        </p>

        {secondary && (
          <p className="mt-0.5 truncate text-xs text-stone-500">
            {secondary}
          </p>
        )}
      </div>

      <span
        className={
          available
            ? "flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-700"
            : "flex shrink-0 items-center gap-1.5 text-xs font-medium text-stone-400"
        }
      >
        <span
          className={
            available
              ? "h-2 w-2 rounded-full bg-emerald-500"
              : "h-2 w-2 rounded-full bg-stone-300"
          }
        />

        {available
          ? "Available"
          : "Offline"}
      </span>
    </div>
  );
}


export default function LocalAudioControls({
  passageText = "",
  chapterText = "",
  storyId = null,
  onBrowserFallback,
  onTimelineSegmentChange,
  onLocalPlaybackStateChange,
}) {
  const localSpeech =
    useLocalSpeech();

  const hasPassage =
    Boolean(
      String(
        passageText
        || "",
      ).trim(),
    );

  const hasChapter =
    Boolean(
      String(
        chapterText
        || "",
      ).trim(),
    );

  const selectedCatalogue =
    localSpeech.settings.mode ===
    "expressive"
      ? localSpeech.qwenSpeakers
      : localSpeech.kokoroVoices;

  const selectedCatalogueValue =
    localSpeech.settings.mode ===
    "expressive"
      ? localSpeech
          .settings
          .qwenSpeaker
      : localSpeech
          .settings
          .kokoroVoice;

  function changeVoice(
    value,
  ) {
    if (
      localSpeech.settings.mode ===
      "expressive"
    ) {
      localSpeech.updateSettings({
        qwenSpeaker:
          value,
      });

      return;
    }

    localSpeech.updateSettings({
      kokoroVoice:
        value,
    });
  }

  async function generatePassage() {
    await localSpeech.generatePassage({
      text:
        passageText,

      storyId,

      autoPlay:
        true,
    });
  }

  async function generateChapter() {
    await localSpeech.generateChapter({
      text:
        chapterText,

      storyId,

      autoPlay:
        false,
    });
  }

  function useBrowserFallback() {
    localSpeech.stopAudio();

    onBrowserFallback?.();
  }

  const storage =
    localSpeech.storageStatus;


  useEffect(
    () => {
      onTimelineSegmentChange?.(
        localSpeech.activeTimelineSegment,
        {
          audioState:
            localSpeech.audioState,

          segmentIndex:
            localSpeech
              .activeTimelineSegmentIndex,

          currentTimeSeconds:
            localSpeech.currentTimeSeconds,

          durationSeconds:
            localSpeech.audioDurationSeconds,

          speakerName:
            localSpeech.currentSpeakerName,

          segmentKind:
            localSpeech.currentSegmentKind,

          speakerTransition:
            localSpeech.speakerTransition,
        },
      );
    },
    [
      localSpeech.activeTimelineSegment,
      localSpeech.activeTimelineSegmentIndex,
      localSpeech.audioDurationSeconds,
      localSpeech.audioState,
      localSpeech.currentSegmentKind,
      localSpeech.currentSpeakerName,
      localSpeech.currentTimeSeconds,
      localSpeech.speakerTransition,
      onTimelineSegmentChange,
    ],
  );


  useEffect(
    () => {
      onLocalPlaybackStateChange?.(
        localSpeech.audioState,
      );
    },
    [
      localSpeech.audioState,
      onLocalPlaybackStateChange,
    ],
  );


  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-stone-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {localSpeech.serviceConnected ? (
                <Wifi
                  size={16}
                  className="text-emerald-600"
                />
              ) : (
                <WifiOff
                  size={16}
                  className="text-stone-400"
                />
              )}

              <h3 className="text-sm font-semibold text-stone-900">
                Local speech service
              </h3>
            </div>

            <p className="mt-1 text-xs text-stone-500">
              Node, Kokoro, and Qwen run locally.
            </p>
          </div>

          <button
            type="button"
            onClick={
              localSpeech.refreshStatus
            }
            disabled={
              localSpeech.statusLoading
            }
            className="rounded-xl border border-stone-300 bg-white p-2 text-stone-600 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50"
            aria-label="Refresh local speech status"
            title="Refresh status"
          >
            <RefreshCw
              size={15}
              className={
                localSpeech.statusLoading
                  ? "animate-spin"
                  : ""
              }
            />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <StatusIndicator
            available={
              localSpeech.serviceConnected
            }
            label="Node service"
            secondary="Queue, cache, and audio delivery"
          />

          <StatusIndicator
            available={
              localSpeech.kokoroAvailable
            }
            label="Fast engine"
            secondary="Kokoro local synthesis"
          />

          <StatusIndicator
            available={
              localSpeech.qwenAvailable
            }
            label="Expressive engine"
            secondary="Qwen3-TTS local synthesis"
          />
        </div>
      </section>

      <section>
        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Local generation mode
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              localSpeech.updateSettings({
                mode:
                  "fast",
              });
            }}
            className={
              localSpeech.settings.mode ===
              "fast"
                ? "rounded-2xl border border-amber-700 bg-amber-50 p-3 text-left text-amber-950"
                : "rounded-2xl border border-stone-300 bg-white p-3 text-left text-stone-700 hover:bg-stone-50"
            }
          >
            <div className="flex items-center gap-2">
              <Zap size={16} />

              <span className="text-sm font-semibold">
                Fast
              </span>
            </div>

            <p className="mt-1 text-xs opacity-70">
              Kokoro
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              localSpeech.updateSettings({
                mode:
                  "expressive",
              });
            }}
            className={
              localSpeech.settings.mode ===
              "expressive"
                ? "rounded-2xl border border-violet-700 bg-violet-50 p-3 text-left text-violet-950"
                : "rounded-2xl border border-stone-300 bg-white p-3 text-left text-stone-700 hover:bg-stone-50"
            }
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} />

              <span className="text-sm font-semibold">
                Expressive
              </span>
            </div>

            <p className="mt-1 text-xs opacity-70">
              Qwen3-TTS
            </p>
          </button>
        </div>
      </section>

      {localSpeech.selectedEngineMessage && ( <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"> <p className="text-sm font-medium text-amber-900"> Selected engine unavailable </p> <p className="mt-1 text-xs leading-relaxed text-amber-800"> {localSpeech.selectedEngineMessage} </p> {localSpeech.browserFallbackReady && onBrowserFallback && ( <button type="button" onClick={ useBrowserFallback } className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-800 px-3 py-2 text-xs font-medium text-white" > <Volume2 size={14} /> Use browser voice </button> )} </section> )} {localSpeech.storageWarning && ( <section className="rounded-2xl border border-red-200 bg-red-50 p-4"> <p className="text-sm font-medium text-red-900"> Local storage needs attention </p> <p className="mt-1 text-xs leading-relaxed text-red-800"> {localSpeech.storageWarning} </p> <button type="button" onClick={() => { void localSpeech .runStorageCleanup(); }} disabled={ localSpeech.storageLoading } className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50" > {localSpeech.storageLoading ? ( <LoaderCircle size={14} className="animate-spin" /> ) : ( <RotateCcw size={14} /> )} Run safe cleanup </button> </section> )}

      <section>
        <label
          htmlFor="local-speech-voice"
          className="text-xs font-semibold uppercase tracking-wider text-stone-500"
        >
          {localSpeech.settings.mode ===
          "expressive"
            ? "Speaker"
            : "Voice"}
        </label>

        <select
          id="local-speech-voice"
          value={
            selectedCatalogueValue
          }
          onChange={(event) => {
            changeVoice(
              event.target.value,
            );
          }}
          className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-amber-700"
        >
          {selectedCatalogue.length >
          0 ? (
            selectedCatalogue.map(
              (
                option,
              ) => (
                <option
                  key={
                    option.id
                  }
                  value={
                    option.id
                  }
                >
                  {option.name}
                  {option.language
                    ? ` (${option.language})`
                    : ""}
                </option>
              ),
            )
          ) : (
            <option
              value={
                selectedCatalogueValue
              }
            >
              {selectedCatalogueValue}
            </option>
          )}
        </select>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="local-speech-speed"
            className="text-xs font-semibold uppercase tracking-wider text-stone-500"
          >
            Speed
          </label>

          <span className="text-sm font-medium text-stone-700">
            {localSpeech.settings.speed.toFixed(
              2,
            )}
            x
          </span>
        </div>

        <input
          id="local-speech-speed"
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={
            localSpeech.settings.speed
          }
          onChange={(event) => {
            localSpeech.updateSettings({
              speed:
                Number(
                  event.target.value,
                ),
            });
          }}
          className="mt-3 w-full accent-amber-700"
        />
      </section>

      {localSpeech.settings.mode ===
        "expressive" && (
        <section>
          <label
            htmlFor="local-speech-instruction"
            className="text-xs font-semibold uppercase tracking-wider text-stone-500"
          >
            Performance instruction
          </label>

          <textarea
            id="local-speech-instruction"
            value={
              localSpeech
                .settings
                .instruction
            }
            onChange={(event) => {
              localSpeech.updateSettings({
                instruction:
                  event.target.value,
              });
            }}
            rows={3}
            maxLength={500}
            className="mt-2 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm leading-relaxed text-stone-900 outline-none focus:border-violet-700"
          />
        </section>
      )}

      <section className="space-y-2">
        <button
          type="button"
          onClick={
            generatePassage
          }
          disabled={
            !hasPassage
            || !localSpeech.canGenerate
            || localSpeech.isGeneratingChapter
          }
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {localSpeech.isSubmitting ? (
            <LoaderCircle
              size={17}
              className="animate-spin"
            />
          ) : (
            <Volume2 size={17} />
          )}

          Generate passage
        </button>

        <button
          type="button"
          onClick={
            generateChapter
          }
          disabled={
            !hasChapter
            || !localSpeech.canGenerate
            || localSpeech.isGeneratingChapter
            || localSpeech.isSubmitting
          }
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {localSpeech.isGeneratingChapter ? (
            <LoaderCircle
              size={17}
              className="animate-spin"
            />
          ) : (
            <Database size={17} />
          )}

          {localSpeech.isGeneratingChapter
            ? "Generating chapter"
            : "Generate chapter"}
        </button>
      </section>

      {(localSpeech.isSubmitting
        || localSpeech.activeJob) && (
        <section className="rounded-2xl border border-stone-200 bg-stone-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium capitalize text-stone-900">
                {localSpeech.jobState.replaceAll(
                  "-",
                  " ",
                )}
              </p>

              <p className="mt-1 text-xs text-stone-500">
                {localSpeech.jobMessage ||
                  "Preparing local synthesis."}
              </p>
            </div>

            <span className="shrink-0 text-sm font-semibold text-stone-700">
              {localSpeech.progress}%
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-amber-600 transition-all"
              style={{
                width:
                  `${localSpeech.progress}%`,
              }}
            />
          </div>

          {localSpeech.queuePosition !==
            null && (
            <p className="mt-2 text-xs text-stone-500">
              Queue position:{" "}
              {localSpeech.queuePosition}
            </p>
          )}

          {localSpeech.isSubmitting && (
            <button
              type="button"
              onClick={
                localSpeech.cancelGeneration
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <X size={14} />
              Cancel generation
            </button>
          )}
        </section>
      )}

      {localSpeech.chapterItems.length > 0 && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ListMusic
                  size={16}
                  className="shrink-0 text-violet-700"
                />

                <p className="text-sm font-semibold text-violet-950">
                  Chapter audio
                </p>
              </div>

              <p className="mt-1 text-xs text-violet-700">
                {localSpeech.chapterState ===
                "generating"
                  ? `Generating passage ${
                      localSpeech.currentChapterIndex
                      + 1
                    } of ${
                      localSpeech.chapterItems.length
                    }.`
                  : localSpeech.chapterState ===
                      "completed"
                    ? "Chapter generation complete."
                    : localSpeech.chapterState ===
                        "cancelled"
                      ? "Chapter generation was cancelled."
                      : localSpeech.chapterState ===
                          "failed"
                        ? "Chapter generation stopped after an error."
                        : "Chapter playlist ready."}
              </p>
            </div>

            <span className="shrink-0 text-sm font-semibold text-violet-800">
              {localSpeech.chapterProgress}%
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all"
              style={{
                width:
                  `${localSpeech.chapterProgress}%`,
              }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <span className="text-violet-600">
                Completed
              </span>

              <p className="mt-0.5 font-semibold text-violet-950">
                {localSpeech.chapterCompletedCount}
                {" / "}
                {localSpeech.chapterItems.length}
              </p>
            </div>

            <div className="rounded-xl bg-white/70 px-3 py-2">
              <span className="text-violet-600">
                Current passage
              </span>

              <p className="mt-0.5 font-semibold text-violet-950">
                {Math.min(
                  localSpeech.currentChapterIndex + 1,
                  localSpeech.chapterItems.length,
                )}
                {" / "}
                {localSpeech.chapterItems.length}
              </p>
            </div>
          </div>

          {localSpeech.currentChapterItem && (
            <div className="mt-3 rounded-xl bg-white/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium capitalize text-violet-950">
                  {String(
                    localSpeech
                      .currentChapterItem
                      .state
                    || "pending",
                  ).replaceAll(
                    "-",
                    " ",
                  )}
                </p>

                <span className="text-xs font-semibold text-violet-700">
                  {localSpeech
                    .currentChapterItem
                    .progress
                  || 0}
                  %
                </span>
              </div>

              <p className="mt-1 text-xs leading-relaxed text-violet-700">
                {localSpeech
                  .currentChapterItem
                  .progressMessage
                || "Waiting for generation."}
              </p>

              <p className="mt-2 line-clamp-3 font-serif text-xs leading-relaxed text-stone-600">
                {localSpeech
                  .currentChapterItem
                  .text}
              </p>
            </div>
          )}

          {localSpeech.isGeneratingChapter && (
            <button
              type="button"
              onClick={() => {
                void localSpeech
                  .cancelChapterGeneration();
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              <X size={14} />
              Cancel chapter generation
            </button>
          )}

          {!localSpeech.isGeneratingChapter
            && localSpeech.chapterItems.length >
              0 && (
              <button
                type="button"
                onClick={
                  localSpeech.resetChapter
                }
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-100"
              >
                <RotateCcw size={14} />
                Clear chapter playlist
              </button>
            )}
        </section>
      )}

      {localSpeech.chapterError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Chapter generation failed
          </p>

          <p className="mt-1 text-xs leading-relaxed text-red-700">
            {localSpeech.chapterError}
          </p>

          <p className="mt-2 text-xs leading-relaxed text-red-600">
            Completed passages remain cached and can be reused when generation is started again.
          </p>
        </section>
      )}

      {localSpeech.generationError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Local generation failed
          </p>

          <p className="mt-1 text-xs leading-relaxed text-red-700">
            {localSpeech.generationError}
          </p>

          {localSpeech.browserFallbackReady &&
            onBrowserFallback && (
            <button
              type="button"
              onClick={
                useBrowserFallback
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-3 py-2 text-xs font-medium text-white"
            >
              <Volume2 size={14} />
              Use browser voice
            </button>
          )}
        </section>
      )}

      {localSpeech.audioUrl && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            Local audio ready
          </p>

          <p className="mt-1 text-xs text-emerald-700">
            {localSpeech.submission?.type ===
            "cache-hit"
              ? "Loaded from the local cache."
              : "Generated and stored locally."}
          </p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                void localSpeech.playAudio();
              }}
              className="flex items-center justify-center gap-1 rounded-xl bg-emerald-800 px-2 py-2 text-xs font-medium text-white"
            >
              <Play size={14} />
              Play
            </button>

            <button
              type="button"
              onClick={
                localSpeech.pauseAudio
              }
              className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-2 py-2 text-xs font-medium text-emerald-800"
            >
              <Pause size={14} />
              Pause
            </button>

            <button
              type="button"
              onClick={
                localSpeech.stopAudio
              }
              className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-2 py-2 text-xs font-medium text-emerald-800"
            >
              <Square size={13} />
              Stop
            </button>
          </div>
        </section>
      )}
      {localSpeech.chapterItems.length > 0 && ( <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-sky-200 bg-sky-50 p-4"> <div> <p className="text-sm font-medium text-sky-950"> Continue chapter automatically </p> <p className="mt-1 text-xs leading-relaxed text-sky-700"> Start the next completed passage when the current passage ends. </p> </div> <input type="checkbox" checked={ localSpeech .settings .autoContinueChapter } onChange={(event) => { localSpeech.updateSettings({ autoContinueChapter: event.target.checked, }); }} className="h-5 w-5 shrink-0 accent-sky-700" /> </label> )}
      {localSpeech.chapterItems.some(
        (
          item,
        ) => (
          item.state ===
            "completed"
          && item.audioUrl
        ),
      ) && (
        <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-center gap-2">
            <ListMusic
              size={16}
              className="text-sky-700"
            />

            <div className="min-w-0">
              <p className="text-sm font-medium text-sky-950">
                Chapter playlist
              </p>

              <p className="mt-0.5 text-xs text-sky-700">
                Passage{" "}
                {localSpeech.currentChapterIndex
                  + 1}
                {" of "}
                {localSpeech.chapterItems.length}
              </p>
              <p className="mt-0.5 text-xs capitalize text-sky-600"> Playback:{" "} {localSpeech.audioState} </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => {
                void localSpeech
                  .previousChapterItem();
              }}
              disabled={
                localSpeech.currentChapterIndex <=
                0
              }
              className="flex items-center justify-center rounded-xl border border-sky-200 bg-white px-2 py-2 text-sky-800 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Previous chapter passage"
              title="Previous passage"
            >
              <SkipBack size={15} />
            </button>

            <button
              type="button"
              onClick={() => {
                void localSpeech
                  .playChapter();
              }}
              className="col-span-2 flex items-center justify-center gap-1 rounded-xl bg-sky-800 px-2 py-2 text-xs font-medium text-white"
            >
              <Play size={14} />
              Play
            </button>

            <button
              type="button"
              onClick={
                localSpeech.pauseAudio
              }
              className="flex items-center justify-center rounded-xl border border-sky-200 bg-white px-2 py-2 text-sky-800"
              aria-label="Pause chapter audio"
              title="Pause"
            >
              <Pause size={14} />
            </button>

            <button
              type="button"
              onClick={() => {
                void localSpeech
                  .nextChapterItem();
              }}
              disabled={
                localSpeech.currentChapterIndex >=
                localSpeech.chapterItems.length
                - 1
              }
              className="flex items-center justify-center rounded-xl border border-sky-200 bg-white px-2 py-2 text-sky-800 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Next chapter passage"
              title="Next passage"
            >
              <SkipForward size={15} />
            </button>
          </div>

          <button
            type="button"
            onClick={
              localSpeech.stopAudio
            }
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-800"
          >
            <Square size={13} />
            Stop chapter audio
          </button>
        </section>
      )}

      {localSpeech.timelineLoading && (
        <section className="rounded-2xl border border-stone-200 bg-stone-100 p-4">
          <div className="flex items-center gap-2 text-sm text-stone-700">
            <LoaderCircle
              size={16}
              className="animate-spin"
            />

            Loading audio timeline
          </div>
        </section>
      )}


      {localSpeech.timelineError && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Timeline unavailable
          </p>

          <p className="mt-1 text-xs text-amber-800">
            {localSpeech.timelineError}
          </p>
        </section>
      )}


      {localSpeech.timeline
        && !localSpeech.timelineLoading && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-950">
                Segment timeline
              </p>

              <p className="mt-1 text-xs capitalize text-indigo-700">
                {localSpeech
                  .timeline
                  .timingSource}{" "}
                timing
              </p>
            </div>

            <span className="text-xs font-medium text-indigo-800">
              {formatPlaybackTime(
                localSpeech.currentTimeSeconds,
              )}
              {" / "}
              {formatPlaybackTime(
                localSpeech.audioDurationSeconds,
              )}
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-[width] duration-100"
              style={{
                width:
                  `${localSpeech.timelineProgress}%`,
              }}
            />
          </div>

          {localSpeech.activeTimelineSegment ? (
            <div className="mt-3 rounded-xl bg-white/80 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold capitalize text-indigo-950">
                  {localSpeech.currentSegmentKind}
                </span>

                <span className="text-xs text-indigo-700">
                  Segment{" "}
                  {localSpeech
                    .activeTimelineSegmentIndex
                    + 1}
                  {" of "}
                  {localSpeech
                    .timeline
                    .segmentCount}
                </span>
              </div>

              <p className="mt-2 text-xs font-medium text-indigo-800">
                {localSpeech.currentSpeakerName
                || "Narrator"}
              </p>

              {localSpeech.speakerTransition && (
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-violet-700">
                  Speaker transition
                </p>
              )}

              <p className="mt-2 font-serif text-sm leading-relaxed text-stone-700">
                {localSpeech
                  .activeTimelineSegment
                  .displayText}
              </p>

              <p className="mt-2 text-xs text-stone-500">
                {formatPlaybackTime(
                  localSpeech
                    .activeTimelineSegment
                    .startSeconds,
                )}
                {" to "}
                {formatPlaybackTime(
                  localSpeech
                    .activeTimelineSegment
                    .endSeconds,
                )}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-indigo-700">
              Start playback to activate synchronized segments.
            </p>
          )}
        </section>
      )}

      {localSpeech.chapterItems.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Chapter passages
          </p>

          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
            {localSpeech.chapterItems.map(
              (
                item,
                index,
              ) => {
                const selected =
                  index ===
                  localSpeech
                    .currentChapterIndex;

                const playable =
                  item.state ===
                    "completed"
                  && Boolean(
                    item.audioUrl,
                  );

                return (
                  <button
                    key={
                      item.id
                    }
                    type="button"
                    onClick={() => {
                      if (
                        playable
                      ) {
                        void localSpeech
                          .playChapterItem(
                            index,
                          );
                      }
                    }}
                    disabled={
                      !playable
                    }
                    className={
                      selected
                        ? "w-full rounded-xl border border-sky-300 bg-sky-50 p-3 text-left disabled:cursor-default"
                        : "w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:bg-stone-50 disabled:cursor-default"
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-stone-800">
                        Passage{" "}
                        {item.number}
                      </span>

                      <span
                        className={
                          item.state ===
                          "completed"
                            ? "text-xs font-medium text-emerald-700"
                            : item.state ===
                                "failed"
                              ? "text-xs font-medium text-red-700"
                              : item.state ===
                                  "cancelled"
                                ? "text-xs font-medium text-stone-400"
                                : "text-xs font-medium capitalize text-amber-700"
                        }
                      >
                        {item.cached
                          ? "Cached"
                          : String(
                              item.state,
                            ).replaceAll(
                              "-",
                              " ",
                            )}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-2 font-serif text-xs leading-relaxed text-stone-500">
                      {item.text}
                    </p>

                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={
                          item.state ===
                          "failed"
                            ? "h-full rounded-full bg-red-500"
                            : item.state ===
                                "completed"
                              ? "h-full rounded-full bg-emerald-500"
                              : "h-full rounded-full bg-amber-500"
                        }
                        style={{
                          width:
                            `${item.progress || 0}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              },
            )}
          </div>
        </section>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4">
        <div>
          <p className="text-sm font-medium text-stone-900">
            Browser-speech fallback
          </p>

          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            Use the existing browser voice if local generation is unavailable.
          </p>
        </div>

        <input
          type="checkbox"
          checked={
            localSpeech
              .settings
              .browserFallback
          }
          onChange={(event) => {
            localSpeech.updateSettings({
              browserFallback:
                event.target.checked,
            });
          }}
          className="h-5 w-5 shrink-0 accent-amber-700"
        />
      </label>

      <section className="rounded-2xl border border-stone-200 bg-stone-100 p-4">
        <div className="flex items-center gap-2">
          <HardDrive
            size={16}
            className="text-stone-600"
          />

          <h3 className="text-sm font-semibold text-stone-900">
            Local audio storage
          </h3>
        </div>

        {storage ? (
          <div className="mt-3 space-y-2 text-xs text-stone-600">
            <div className="flex items-center justify-between gap-3">
              <span>Cache used</span>

              <span className="font-medium text-stone-800">
                {formatGigabytes(
                  storage.cacheSizeGb,
                )}
                {" / "}
                {formatGigabytes(
                  storage.maximumCacheGb,
                )}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span>Free disk space</span>

              <span className="font-medium text-stone-800">
                {formatGigabytes(
                  storage.freeDiskGb,
                )}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span>Cached entries</span>

              <span className="font-medium text-stone-800">
                {storage.entryCount}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                void localSpeech.runStorageCleanup();
              }}
              disabled={
                localSpeech.storageLoading
              }
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50"
            >
              {localSpeech.storageLoading ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                />
              ) : (
                <RotateCcw size={14} />
              )}

              Run safe cleanup
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-stone-500">
            Storage information is unavailable.
          </p>
        )}

        {localSpeech.storageError && (
          <p className="mt-2 text-xs text-red-700">
            {localSpeech.storageError}
          </p>
        )}

        {localSpeech.lastCleanup && ( <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600"> <p> Removed{" "} <strong className="text-stone-800"> {localSpeech .lastCleanup .removedEntryCount || 0} </strong>{" "} cached entries. </p> <p className="mt-1"> Freed{" "} <strong className="text-stone-800"> {formatGigabytes( localSpeech .lastCleanup .removedGb || 0, )} </strong>. </p> {localSpeech .lastCleanup .skippedProtectedKeys ?.length > 0 && ( <p className="mt-1 text-amber-700"> {localSpeech .lastCleanup .skippedProtectedKeys .length}{" "} active cache entries were protected. </p> )} {localSpeech .lastCleanup .after ?.cleanupRequired && ( <p className="mt-1 text-red-700"> Storage is still below the safe generation threshold. </p> )} </div> )}
      </section>

      <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-500">
        <Gauge size={14} />

        <span>
          Selected engine:{" "}
          <strong className="font-medium text-stone-700">
            {localSpeech.selectedEngine}
          </strong>
        </span>
      </div>
    </div>
  );
}