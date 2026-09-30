from __future__ import annotations

import os
import time
from pathlib import Path

import soundfile as sf
import torch
from dotenv import load_dotenv
from kokoro import KPipeline


WORKER_DIRECTORY = Path(
    __file__
).resolve().parent.parent

load_dotenv(
    WORKER_DIRECTORY / ".env"
)

AUDIO_CACHE_DIRECTORY = Path(
    os.getenv(
        "BP_AUDIO_CACHE_DIRECTORY",
        r"D:\BP-Local\audio-cache",
    )
)

KOKORO_OUTPUT_DIRECTORY = (
    AUDIO_CACHE_DIRECTORY
    / "kokoro"
)

OUTPUT_FILE = (
    KOKORO_OUTPUT_DIRECTORY
    / "kokoro-test.wav"
)

LANGUAGE_CODE = os.getenv(
    "KOKORO_DEFAULT_LANGUAGE",
    "a",
)

VOICE_ID = os.getenv(
    "KOKORO_DEFAULT_VOICE",
    "af_heart",
)

TEST_TEXT = (
    "Welcome to BP. "
    "Kokoro is now generating speech "
    "locally on this computer."
)


def main() -> None:
    KOKORO_OUTPUT_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "BP Kokoro test"
    )

    print(
        f"Python device support: "
        f"CUDA available = "
        f"{torch.cuda.is_available()}"
    )

    if torch.cuda.is_available():
        print(
            "CUDA device: "
            f"{torch.cuda.get_device_name(0)}"
        )

    print(
        f"Language: {LANGUAGE_CODE}"
    )

    print(
        f"Voice: {VOICE_ID}"
    )

    print(
        "Loading Kokoro pipeline..."
    )

    load_started_at = time.perf_counter()

    pipeline = KPipeline(
        lang_code=LANGUAGE_CODE,
    )

    load_seconds = (
        time.perf_counter()
        - load_started_at
    )

    print(
        "Pipeline loaded in "
        f"{load_seconds:.2f} seconds."
    )

    print(
        "Generating test audio..."
    )

    generation_started_at = (
        time.perf_counter()
    )

    generator = pipeline(
        TEST_TEXT,
        voice=VOICE_ID,
        speed=1.0,
    )

    audio_parts = []
    generated_text_parts = []

    for result in generator:
        graphemes, phonemes, audio = (
            result
        )

        generated_text_parts.append(
            str(graphemes)
        )

        audio_parts.append(
            audio
        )

        print(
            "Generated chunk:"
        )

        print(
            f"  Text: {graphemes}"
        )

        print(
            f"  Phonemes: {phonemes}"
        )

    if not audio_parts:
        raise RuntimeError(
            "Kokoro returned no audio."
        )

    if len(audio_parts) == 1:
        final_audio = audio_parts[0]
    else:
        final_audio = torch.cat(
            [
                torch.as_tensor(
                    audio_part
                )
                for audio_part
                in audio_parts
            ]
        ).cpu().numpy()

    if hasattr(
        final_audio,
        "detach",
    ):
        final_audio = (
            final_audio
            .detach()
            .cpu()
            .numpy()
        )

    sample_rate = 24000

    sf.write(
        OUTPUT_FILE,
        final_audio,
        sample_rate,
    )

    generation_seconds = (
        time.perf_counter()
        - generation_started_at
    )

    duration_seconds = (
        len(final_audio)
        / sample_rate
    )

    real_time_factor = (
        generation_seconds
        / duration_seconds
        if duration_seconds > 0
        else 0
    )

    file_size_bytes = (
        OUTPUT_FILE.stat().st_size
    )

    print()
    print(
        "Generation complete."
    )

    print(
        f"Output: {OUTPUT_FILE}"
    )

    print(
        "Audio duration: "
        f"{duration_seconds:.2f} seconds"
    )

    print(
        "Generation time: "
        f"{generation_seconds:.2f} seconds"
    )

    print(
        "Real-time factor: "
        f"{real_time_factor:.2f}"
    )

    print(
        "File size: "
        f"{file_size_bytes} bytes"
    )


if __name__ == "__main__":
    main()
