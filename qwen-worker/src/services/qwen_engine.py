from __future__ import annotations

import gc
import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import psutil
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


QWEN_SPEAKERS = [
    {
        "id": "Aiden",
        "name": "Aiden",
        "description": (
            "Sunny American English voice"
        ),
        "native_language": "English",
    },
    {
        "id": "Ryan",
        "name": "Ryan",
        "description": (
            "Dynamic English voice "
            "with rhythmic delivery"
        ),
        "native_language": "English",
    },
    {
        "id": "Vivian",
        "name": "Vivian",
        "description": (
            "Bright young voice"
        ),
        "native_language": "Chinese",
    },
    {
        "id": "Serena",
        "name": "Serena",
        "description": (
            "Warm and gentle voice"
        ),
        "native_language": "Chinese",
    },
    {
        "id": "Uncle_Fu",
        "name": "Uncle Fu",
        "description": (
            "Seasoned voice with "
            "a mellow timbre"
        ),
        "native_language": "Chinese",
    },
    {
        "id": "Dylan",
        "name": "Dylan",
        "description": (
            "Youthful Beijing voice"
        ),
        "native_language": "Chinese",
    },
    {
        "id": "Eric",
        "name": "Eric",
        "description": (
            "Lively Chengdu voice"
        ),
        "native_language": "Chinese",
    },
    {
        "id": "Ono_Anna",
        "name": "Ono Anna",
        "description": (
            "Playful Japanese voice"
        ),
        "native_language": "Japanese",
    },
    {
        "id": "Sohee",
        "name": "Sohee",
        "description": (
            "Warm Korean voice"
        ),
        "native_language": "Korean",
    },
]


@dataclass
class QwenGenerationResult:
    generation_id: str
    output_path: Path
    speaker: str
    language: str
    instruction: str
    sample_rate: int
    duration_seconds: float
    generation_seconds: float
    real_time_factor: float
    file_size_bytes: int
    device: str
    cached: bool


class QwenEngine:
    def __init__(self) -> None:
        self.model_id = os.getenv(
            "QWEN_DEFAULT_MODEL",
            (
                "Qwen/"
                "Qwen3-TTS-12Hz-"
                "0.6B-CustomVoice"
            ),
        )

        self.audio_directory = Path(
            os.getenv(
                "QWEN_AUDIO_DIRECTORY",
                (
                    r"D:\BP-Local"
                    r"\audio-cache"
                    r"\qwen3-tts"
                ),
            )
        )

        self.metadata_directory = Path(
            os.getenv(
                "QWEN_METADATA_DIRECTORY",
                (
                    r"D:\BP-Local"
                    r"\metadata"
                    r"\qwen3-tts"
                ),
            )
        )

        self.default_speaker = os.getenv(
            "QWEN_DEFAULT_SPEAKER",
            "Aiden",
        )

        self.default_language = os.getenv(
            "QWEN_DEFAULT_LANGUAGE",
            "English",
        )

        self.default_instruction = os.getenv(
            "QWEN_TEST_INSTRUCTION",
            (
                "Speak calmly and clearly, "
                "with controlled warmth and "
                "a measured pace."
            ),
        )

        self.attention_implementation = (
            os.getenv(
                "QWEN_ATTENTION_IMPLEMENTATION",
                "sdpa",
            )
        )

        self.maximum_text_length = int(
            os.getenv(
                "QWEN_MAX_TEXT_LENGTH",
                "1000",
            )
        )

        self.minimum_available_ram_gb = float(
            os.getenv(
                "QWEN_MIN_AVAILABLE_RAM_GB",
                "6",
            )
        )

        self.minimum_available_vram_gb = float(
            os.getenv(
                "QWEN_MIN_AVAILABLE_VRAM_GB",
                "4.7",
            )
        )

        self.idle_timeout_seconds = int(
            os.getenv(
                "QWEN_IDLE_TIMEOUT_SECONDS",
                "300",
            )
        )

        self.model: Qwen3TTSModel | None = None

        self.model_load_seconds: float | None = None
        self.last_used_at: float | None = None
        self.last_error: str | None = None

        self.generation_lock = threading.Lock()
        self.state_lock = threading.RLock()

        self.audio_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

        self.metadata_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

    @staticmethod
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

    def get_available_ram_gb(
        self,
    ) -> float:
        memory = psutil.virtual_memory()

        return self.bytes_to_gigabytes(
            memory.available
        )

    def get_cuda_memory(
        self,
    ) -> tuple[float, float]:
        if not torch.cuda.is_available():
            return 0.0, 0.0

        free_bytes, total_bytes = (
            torch.cuda.mem_get_info()
        )

        return (
            self.bytes_to_gigabytes(
                free_bytes
            ),
            self.bytes_to_gigabytes(
                total_bytes
            ),
        )

    def cleanup_cuda(self) -> None:
        gc.collect()

        if not torch.cuda.is_available():
            return

        try:
            torch.cuda.empty_cache()
        except Exception as error:
            print(
                "CUDA cache cleanup skipped: "
                f"{error}"
            )

            return

        try:
            torch.cuda.ipc_collect()
        except Exception as error:
            print(
                "CUDA IPC cleanup skipped: "
                f"{error}"
            )

    def is_installed(self) -> bool:
        return True

    def is_loaded(self) -> bool:
        return self.model is not None

    def is_available(self) -> bool:
        return (
            torch.cuda.is_available()
            and self.last_error is None
        )

    def is_busy(self) -> bool:
        acquired = (
            self.generation_lock.acquire(
                blocking=False
            )
        )

        if acquired:
            self.generation_lock.release()
            return False

        return True

    def seconds_until_unload(
        self,
    ) -> int | None:
        if (
            not self.is_loaded()
            or self.last_used_at is None
        ):
            return None

        elapsed = (
            time.monotonic()
            - self.last_used_at
        )

        remaining = max(
            0,
            self.idle_timeout_seconds
            - int(elapsed),
        )

        return remaining

    def get_status(
        self,
    ) -> dict[str, Any]:
        available_ram = (
            self.get_available_ram_gb()
        )

        free_vram, total_vram = (
            self.get_cuda_memory()
        )

        if self.last_error:
            status = (
                "Error: "
                f"{self.last_error}"
            )
        elif self.is_busy():
            status = "Generating"
        elif self.is_loaded():
            status = "Ready"
        elif not torch.cuda.is_available():
            status = "CUDA unavailable"
        elif (
            free_vram
            < self.minimum_available_vram_gb
        ):
            status = (
                "Insufficient free VRAM"
            )
        else:
            status = (
                "Installed, not loaded"
            )

        return {
            "engine_id": "qwen3-tts",
            "display_name": (
                "Qwen3-TTS 0.6B"
            ),
            "model_id": self.model_id,
            "installed": (
                self.is_installed()
            ),
            "available": (
                self.is_available()
            ),
            "loaded": (
                self.is_loaded()
            ),
            "busy": self.is_busy(),
            "status": status,
            "device": (
                "cuda:0"
                if torch.cuda.is_available()
                else "unavailable"
            ),
            "gpu": (
                torch.cuda.get_device_name(0)
                if torch.cuda.is_available()
                else None
            ),
            "dtype": "float32",
            "attention": (
                self.attention_implementation
            ),
            "load_seconds": (
                self.model_load_seconds
            ),
            "free_ram_gb": available_ram,
            "free_vram_gb": free_vram,
            "total_vram_gb": total_vram,
            "minimum_ram_gb": (
                self.minimum_available_ram_gb
            ),
            "minimum_vram_gb": (
                self.minimum_available_vram_gb
            ),
            "idle_timeout_seconds": (
                self.idle_timeout_seconds
            ),
            "seconds_until_unload": (
                self.seconds_until_unload()
            ),
            "default_speaker": (
                self.default_speaker
            ),
            "default_language": (
                self.default_language
            ),
            "maximum_text_length": (
                self.maximum_text_length
            ),
            "audio_directory": str(
                self.audio_directory
            ),
        }

    def get_speakers(
        self,
    ) -> list[dict[str, str]]:
        return [
            speaker.copy()
            for speaker
            in QWEN_SPEAKERS
        ]

    def validate_speaker(
        self,
        speaker: str,
    ) -> None:
        speaker_ids = {
            item["id"]
            for item in QWEN_SPEAKERS
        }

        if speaker not in speaker_ids:
            raise ValueError(
                "The selected Qwen speaker "
                f"is invalid: {speaker}"
            )

    def run_preflight_checks(
        self,
    ) -> None:
        available_ram = (
            self.get_available_ram_gb()
        )

        if (
            available_ram
            < self.minimum_available_ram_gb
        ):
            raise RuntimeError(
                "Insufficient free system "
                "memory for Qwen3-TTS. "
                f"Required: "
                f"{self.minimum_available_ram_gb} "
                f"GB. Available: "
                f"{available_ram} GB."
            )

        if not torch.cuda.is_available():
            raise RuntimeError(
                "CUDA is unavailable in the "
                "Qwen environment."
            )

        free_vram, _ = (
            self.get_cuda_memory()
        )

        if (
            not self.is_loaded()
            and free_vram
            < self.minimum_available_vram_gb
        ):
            raise RuntimeError(
                "Insufficient free GPU "
                "memory for Qwen3-TTS. "
                f"Required: "
                f"{self.minimum_available_vram_gb} "
                f"GB. Available: "
                f"{free_vram} GB."
            )

    def load(self) -> None:
        with self.state_lock:
            if self.model is not None:
                self.last_used_at = (
                    time.monotonic()
                )

                return

            self.run_preflight_checks()
            self.cleanup_cuda()

            load_started_at = (
                time.perf_counter()
            )

            try:
                self.model = (
                    Qwen3TTSModel
                    .from_pretrained(
                        self.model_id,
                        device_map="cuda:0",
                        dtype=torch.float32,
                        attn_implementation=(
                            self.attention_implementation
                        ),
                    )
                )

                self.model_load_seconds = (
                    time.perf_counter()
                    - load_started_at
                )

                self.last_used_at = (
                    time.monotonic()
                )

                self.last_error = None

            except Exception as error:
                self.model = None
                self.model_load_seconds = None
                self.last_error = str(
                    error
                )

                self.cleanup_cuda()
                raise

    def unload(self) -> bool:
        with self.state_lock:
            if self.is_busy():
                return False

            if self.model is None:
                self.cleanup_cuda()
                return True

            model = self.model
            self.model = None

            del model

            self.model_load_seconds = None
            self.last_used_at = None

            self.cleanup_cuda()

            return True

    def unload_if_idle(self) -> bool:
        if (
            not self.is_loaded()
            or self.last_used_at is None
            or self.is_busy()
        ):
            return False

        idle_seconds = (
            time.monotonic()
            - self.last_used_at
        )

        if (
            idle_seconds
            < self.idle_timeout_seconds
        ):
            return False

        return self.unload()

    def generate(
        self,
        text: str,
        speaker: str | None = None,
        language: str | None = None,
        instruction: str | None = None,
        filename: str | None = None,
    ) -> QwenGenerationResult:
        clean_text = text.strip()

        if not clean_text:
            raise ValueError(
                "Text is required."
            )

        if (
            len(clean_text)
            > self.maximum_text_length
        ):
            raise ValueError(
                "The Qwen text cannot exceed "
                f"{self.maximum_text_length} "
                "characters."
            )

        selected_speaker = (
            speaker
            or self.default_speaker
        )

        selected_language = (
            language
            or self.default_language
        ).strip()

        selected_instruction = (
            instruction
            or self.default_instruction
        ).strip()

        self.validate_speaker(
            selected_speaker
        )

        if not selected_language:
            raise ValueError(
                "Language is required."
            )

        if len(selected_instruction) > 500:
            raise ValueError(
                "The Qwen performance "
                "instruction cannot exceed "
                "500 characters."
            )

        acquired = (
            self.generation_lock.acquire(
                blocking=False
            )
        )

        if not acquired:
            raise RuntimeError(
                "Qwen3-TTS is already "
                "generating audio."
            )

        try:
            self.run_preflight_checks()
            self.load()

            if self.model is None:
                raise RuntimeError(
                    "The Qwen model could "
                    "not be loaded."
                )

            generation_id = (
                uuid.uuid4().hex
            )

            safe_filename = (
                filename
                or (
                    "qwen3-tts-"
                    f"{generation_id}.wav"
                )
            )

            safe_filename = Path(
                safe_filename
            ).name

            if not safe_filename.lower().endswith(
                ".wav"
            ):
                safe_filename = (
                    f"{safe_filename}.wav"
                )

            output_path = (
                self.audio_directory
                / safe_filename
            )

            generation_started_at = (
                time.perf_counter()
            )

            try:
                wavs, sample_rate = (
                    self.model
                    .generate_custom_voice(
                        text=clean_text,
                        language=(
                            selected_language
                        ),
                        speaker=(
                            selected_speaker
                        ),
                        instruct=(
                            selected_instruction
                        ),
                    )
                )
            except torch.cuda.OutOfMemoryError:
                self.last_error = (
                    "CUDA ran out of memory "
                    "during Qwen generation."
                )

                self.unload()

                raise RuntimeError(
                    self.last_error
                )

            generation_seconds = (
                time.perf_counter()
                - generation_started_at
            )

            if (
                wavs is None
                or len(wavs) == 0
            ):
                raise RuntimeError(
                    "Qwen3-TTS returned no "
                    "audio."
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
                output_path,
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

            self.last_used_at = (
                time.monotonic()
            )

            self.last_error = None

            return QwenGenerationResult(
                generation_id=(
                    generation_id
                ),
                output_path=(
                    output_path
                ),
                speaker=selected_speaker,
                language=selected_language,
                instruction=(
                    selected_instruction
                ),
                sample_rate=sample_rate,
                duration_seconds=(
                    duration_seconds
                ),
                generation_seconds=(
                    generation_seconds
                ),
                real_time_factor=(
                    real_time_factor
                ),
                file_size_bytes=(
                    output_path
                    .stat()
                    .st_size
                ),
                device="cuda:0",
                cached=False,
            )

        except Exception as error:
            self.last_error = str(
                error
            )

            raise

        finally:
            self.generation_lock.release()


qwen_engine = QwenEngine()