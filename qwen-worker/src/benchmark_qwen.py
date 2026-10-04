from __future__ import annotations

import gc
import json
import os
import sys
import time
import traceback
from datetime import datetime
from datetime import timezone
from pathlib import Path

from dotenv import load_dotenv


WORKER_DIRECTORY = (
    Path(__file__)
    .resolve()
    .parent
    .parent
)

load_dotenv(
    WORKER_DIRECTORY / ".env"
)


import psutil
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


MODEL_ID = os.getenv(
    "QWEN_DEFAULT_MODEL",
    (
        "Qwen/"
        "Qwen3-TTS-12Hz-"
        "0.6B-CustomVoice"
    ),
)

AUDIO_DIRECTORY = Path(
    os.getenv(
        "QWEN_AUDIO_DIRECTORY",
        (
            r"D:\BP-Local"
            r"\audio-cache"
            r"\qwen3-tts"
        ),
    )
)

METADATA_DIRECTORY = Path(
    os.getenv(
        "QWEN_METADATA_DIRECTORY",
        (
            r"D:\BP-Local"
            r"\metadata"
            r"\qwen3-tts"
        ),
    )
)

DEFAULT_SPEAKER = os.getenv(
    "QWEN_DEFAULT_SPEAKER",
    "Aiden",
)

DEFAULT_LANGUAGE = os.getenv(
    "QWEN_DEFAULT_LANGUAGE",
    "English",
)

TEST_INSTRUCTION = os.getenv(
    "QWEN_TEST_INSTRUCTION",
    (
        "Speak calmly and clearly, "
        "with controlled warmth and "
        "a measured pace."
    ),
)

ATTENTION_IMPLEMENTATION = os.getenv(
    "QWEN_ATTENTION_IMPLEMENTATION",
    "sdpa",
)

MIN_AVAILABLE_RAM_GB = float(
    os.getenv(
        "QWEN_MIN_AVAILABLE_RAM_GB",
        "6",
    )
)

MIN_AVAILABLE_VRAM_GB = float(
    os.getenv(
        "QWEN_MIN_AVAILABLE_VRAM_GB",
        "4",
    )
)

MAX_TEXT_LENGTH = int(
    os.getenv(
        "QWEN_MAX_TEXT_LENGTH",
        "1000",
    )
)

TEST_TEXT = (
    "The road ahead is uncertain, "
    "but we will face it together."
)

OUTPUT_FILE = (
    AUDIO_DIRECTORY
    / "qwen3-tts-benchmark.wav"
)

METADATA_FILE = (
    METADATA_DIRECTORY
    / "qwen3-tts-benchmark.json"
)


def bytes_to_gigabytes(
    byte_count: int,
) -> float:
    return round(
        byte_count
        / 1024
        / 1024
        / 1024,
        2,
    )


def get_available_ram_gb() -> float:
    memory = (
        psutil.virtual_memory()
    )

    return bytes_to_gigabytes(
        memory.available
    )


def get_cuda_memory() -> tuple[
    float,
    float,
]:
    free_bytes, total_bytes = (
        torch.cuda.mem_get_info()
    )

    free_gigabytes = (
        bytes_to_gigabytes(
            free_bytes
        )
    )

    total_gigabytes = (
        bytes_to_gigabytes(
            total_bytes
        )
    )

    return (
        free_gigabytes,
        total_gigabytes,
    )


def cleanup_cuda() -> None:
    gc.collect()

    if not torch.cuda.is_available():
        return

    try:
        torch.cuda.empty_cache()
    except Exception as error:
        print(
            "CUDA cache cleanup skipped: "
            f"{error}",
            file=sys.stderr,
        )

        return

    try:
        torch.cuda.ipc_collect()
    except Exception as error:
        print(
            "CUDA IPC cleanup skipped: "
            f"{error}",
            file=sys.stderr,
        )

def write_metadata(
    metadata: dict,
) -> None:
    METADATA_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    METADATA_FILE.write_text(
        json.dumps(
            metadata,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def print_environment() -> None:
    print(
        "BP Qwen3-TTS guarded benchmark"
    )

    print(
        f"Model: {MODEL_ID}"
    )

    print(
        f"Speaker: {DEFAULT_SPEAKER}"
    )

    print(
        f"Language: {DEFAULT_LANGUAGE}"
    )

    print(
        "Instruction: "
        f"{TEST_INSTRUCTION}"
    )

    print(
        "Attention implementation: "
        f"{ATTENTION_IMPLEMENTATION}"
    )

    print(
        "PyTorch version: "
        f"{torch.__version__}"
    )

    print(
        "PyTorch CUDA runtime: "
        f"{torch.version.cuda}"
    )

    print(
        "CUDA available: "
        f"{torch.cuda.is_available()}"
    )


def run_preflight_checks() -> tuple[
    bool,
    float,
    float,
    float,
]:
    available_ram_gb = (
        get_available_ram_gb()
    )

    print(
        "Available system RAM: "
        f"{available_ram_gb} GB"
    )

    if (
        available_ram_gb
        < MIN_AVAILABLE_RAM_GB
    ):
        print(
            "Not enough free system RAM.",
            file=sys.stderr,
        )

        print(
            "Required RAM: "
            f"{MIN_AVAILABLE_RAM_GB} GB",
            file=sys.stderr,
        )

        return (
            False,
            available_ram_gb,
            0.0,
            0.0,
        )

    if not torch.cuda.is_available():
        print(
            "CUDA is unavailable in the "
            "Qwen environment.",
            file=sys.stderr,
        )

        print(
            "The benchmark will not "
            "automatically attempt CPU "
            "generation because it may "
            "take a very long time.",
            file=sys.stderr,
        )

        return (
            False,
            available_ram_gb,
            0.0,
            0.0,
        )

    free_vram_gb, total_vram_gb = (
        get_cuda_memory()
    )

    print(
        "GPU: "
        f"{torch.cuda.get_device_name(0)}"
    )

    print(
        "Free VRAM: "
        f"{free_vram_gb} GB"
    )

    print(
        "Total VRAM: "
        f"{total_vram_gb} GB"
    )

    if (
        free_vram_gb
        < MIN_AVAILABLE_VRAM_GB
    ):
        print(
            "Not enough free GPU memory.",
            file=sys.stderr,
        )

        print(
            "Required free VRAM: "
            f"{MIN_AVAILABLE_VRAM_GB} GB",
            file=sys.stderr,
        )

        return (
            False,
            available_ram_gb,
            free_vram_gb,
            total_vram_gb,
        )

    if len(TEST_TEXT) > MAX_TEXT_LENGTH:
        print(
            "Benchmark text exceeds the "
            "configured maximum length.",
            file=sys.stderr,
        )

        return (
            False,
            available_ram_gb,
            free_vram_gb,
            total_vram_gb,
        )

    return (
        True,
        available_ram_gb,
        free_vram_gb,
        total_vram_gb,
    )


def main() -> int:
    AUDIO_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    METADATA_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True,
    )

    print_environment()

    (
        preflight_passed,
        available_ram_gb,
        free_vram_gb,
        total_vram_gb,
    ) = run_preflight_checks()

    if not preflight_passed:
        write_metadata(
            {
                "ok": False,
                "error": (
                    "PREFLIGHT_FAILED"
                ),
                "timestamp": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
                "model": MODEL_ID,
                "available_ram_gb": (
                    available_ram_gb
                ),
                "free_vram_gb": (
                    free_vram_gb
                ),
                "total_vram_gb": (
                    total_vram_gb
                ),
            }
        )

        return 1

    cleanup_cuda()

    torch.cuda.reset_peak_memory_stats()

    initial_allocated_bytes = (
        torch.cuda.memory_allocated()
    )

    initial_reserved_bytes = (
        torch.cuda.memory_reserved()
    )

    model = None

    benchmark_started_at = (
        time.perf_counter()
    )

    load_seconds = 0.0
    generation_seconds = 0.0

    try:
        print()
        print(
            "Loading Qwen3-TTS..."
        )

        print(
            "The first load may download "
            "several model files."
        )

        load_started_at = (
            time.perf_counter()
        )

        model = (
            Qwen3TTSModel
            .from_pretrained(
                MODEL_ID,
                device_map="cuda:0",
                dtype=torch.float32,
                attn_implementation=(
                    ATTENTION_IMPLEMENTATION
                ),
            )
        )

        load_seconds = (
            time.perf_counter()
            - load_started_at
        )

        print(
            "Model loaded in "
            f"{load_seconds:.2f} seconds."
        )

        loaded_allocated_gb = (
            bytes_to_gigabytes(
                torch.cuda
                .memory_allocated()
            )
        )

        loaded_reserved_gb = (
            bytes_to_gigabytes(
                torch.cuda
                .memory_reserved()
            )
        )

        print(
            "VRAM allocated after load: "
            f"{loaded_allocated_gb} GB"
        )

        print(
            "VRAM reserved after load: "
            f"{loaded_reserved_gb} GB"
        )

        print()
        print(
            "Generating benchmark audio..."
        )

        generation_started_at = (
            time.perf_counter()
        )

        wavs, sample_rate = (
            model.generate_custom_voice(
                text=TEST_TEXT,
                language=(
                    DEFAULT_LANGUAGE
                ),
                speaker=(
                    DEFAULT_SPEAKER
                ),
                instruct=(
                    TEST_INSTRUCTION
                ),
            )
        )

        generation_seconds = (
            time.perf_counter()
            - generation_started_at
        )

        if wavs is None:
            raise RuntimeError(
                "Qwen3-TTS returned no "
                "audio collection."
            )

        if len(wavs) == 0:
            raise RuntimeError(
                "Qwen3-TTS returned an "
                "empty audio collection."
            )

        audio = wavs[0]

        if hasattr(
            audio,
            "detach",
        ):
            audio = (
                audio
                .detach()
                .cpu()
                .numpy()
            )

        sf.write(
            OUTPUT_FILE,
            audio,
            sample_rate,
        )

        duration_seconds = (
            len(audio)
            / sample_rate
        )

        real_time_factor = (
            generation_seconds
            / duration_seconds
            if duration_seconds > 0
            else 0.0
        )

        peak_allocated_gb = (
            bytes_to_gigabytes(
                torch.cuda
                .max_memory_allocated()
            )
        )

        peak_reserved_gb = (
            bytes_to_gigabytes(
                torch.cuda
                .max_memory_reserved()
            )
        )

        file_size_bytes = (
            OUTPUT_FILE
            .stat()
            .st_size
        )

        total_seconds = (
            time.perf_counter()
            - benchmark_started_at
        )

        metadata = {
            "ok": True,
            "timestamp": (
                datetime.now(
                    timezone.utc
                ).isoformat()
            ),
            "model": MODEL_ID,
            "speaker": (
                DEFAULT_SPEAKER
            ),
            "language": (
                DEFAULT_LANGUAGE
            ),
            "instruction": (
                TEST_INSTRUCTION
            ),
            "text": TEST_TEXT,
            "device": "cuda:0",
            "gpu": (
                torch.cuda
                .get_device_name(0)
            ),
            "torch_version": (
                torch.__version__
            ),
            "torch_cuda_version": (
                torch.version.cuda
            ),
            "dtype": "float32",
            "attention": (
                ATTENTION_IMPLEMENTATION
            ),
            "sample_rate": (
                sample_rate
            ),
            "duration_seconds": round(
                duration_seconds,
                3,
            ),
            "load_seconds": round(
                load_seconds,
                3,
            ),
            "generation_seconds": round(
                generation_seconds,
                3,
            ),
            "total_seconds": round(
                total_seconds,
                3,
            ),
            "real_time_factor": round(
                real_time_factor,
                3,
            ),
            "available_ram_before_gb": (
                available_ram_gb
            ),
            "free_vram_before_gb": (
                free_vram_gb
            ),
            "total_vram_gb": (
                total_vram_gb
            ),
            "loaded_allocated_vram_gb": (
                loaded_allocated_gb
            ),
            "loaded_reserved_vram_gb": (
                loaded_reserved_gb
            ),
            "peak_allocated_vram_gb": (
                peak_allocated_gb
            ),
            "peak_reserved_vram_gb": (
                peak_reserved_gb
            ),
            "initial_allocated_bytes": (
                initial_allocated_bytes
            ),
            "initial_reserved_bytes": (
                initial_reserved_bytes
            ),
            "file_size_bytes": (
                file_size_bytes
            ),
            "output_file": str(
                OUTPUT_FILE
            ),
        }

        write_metadata(
            metadata
        )

        print()
        print(
            "Generation complete."
        )

        print(
            f"Output: {OUTPUT_FILE}"
        )

        print(
            "Metadata: "
            f"{METADATA_FILE}"
        )

        print(
            "Audio duration: "
            f"{duration_seconds:.2f} "
            "seconds"
        )

        print(
            "Model load time: "
            f"{load_seconds:.2f} "
            "seconds"
        )

        print(
            "Generation time: "
            f"{generation_seconds:.2f} "
            "seconds"
        )

        print(
            "Real-time factor: "
            f"{real_time_factor:.2f}"
        )

        print(
            "Peak allocated VRAM: "
            f"{peak_allocated_gb} GB"
        )

        print(
            "Peak reserved VRAM: "
            f"{peak_reserved_gb} GB"
        )

        return 0

    except torch.cuda.OutOfMemoryError:
        error_message = (
            "CUDA ran out of memory "
            "while loading or generating "
            "with Qwen3-TTS."
        )

        print(
            error_message,
            file=sys.stderr,
        )

        write_metadata(
            {
                "ok": False,
                "error": (
                    "CUDA_OUT_OF_MEMORY"
                ),
                "message": (
                    error_message
                ),
                "model": MODEL_ID,
                "free_vram_before_gb": (
                    free_vram_gb
                ),
                "total_vram_gb": (
                    total_vram_gb
                ),
                "timestamp": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
            }
        )

        return 2

    except Exception as error:
        print(
            "Qwen3-TTS benchmark failed:",
            repr(error),
            file=sys.stderr,
        )

        traceback.print_exc()

        write_metadata(
            {
                "ok": False,
                "error": (
                    type(error).__name__
                ),
                "message": str(
                    error
                ),
                "model": MODEL_ID,
                "timestamp": (
                    datetime.now(
                        timezone.utc
                    ).isoformat()
                ),
            }
        )

        return 3

    finally:
        if model is not None:
            del model

        cleanup_cuda()

        print()
        print(
            "CUDA cleanup complete."
        )


if __name__ == "__main__":
    raise SystemExit(
        main()
    )