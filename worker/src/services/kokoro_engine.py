from __future__ import annotations

import os
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
from kokoro import KPipeline


SAMPLE_RATE = 24000

AMERICAN_ENGLISH_VOICES = [
    {
        "id": "af_heart",
        "name": "Heart",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_alloy",
        "name": "Alloy",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_aoede",
        "name": "Aoede",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_bella",
        "name": "Bella",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_jessica",
        "name": "Jessica",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_kore",
        "name": "Kore",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_nicole",
        "name": "Nicole",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_nova",
        "name": "Nova",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_river",
        "name": "River",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_sarah",
        "name": "Sarah",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "af_sky",
        "name": "Sky",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_adam",
        "name": "Adam",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_echo",
        "name": "Echo",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_eric",
        "name": "Eric",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_fenrir",
        "name": "Fenrir",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_liam",
        "name": "Liam",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_michael",
        "name": "Michael",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_onyx",
        "name": "Onyx",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_puck",
        "name": "Puck",
        "language": "en-US",
        "language_code": "a",
    },
    {
        "id": "am_santa",
        "name": "Santa",
        "language": "en-US",
        "language_code": "a",
    },
]


@dataclass
class KokoroGenerationResult:
    generation_id: str
    output_path: Path
    voice_id: str
    language_code: str
    sample_rate: int
    duration_seconds: float
    generation_seconds: float
    real_time_factor: float
    file_size_bytes: int
    device: str
    cached: bool


class KokoroEngine:
    def __init__(self) -> None:
        audio_cache_directory = Path(
            os.getenv(
                "BP_AUDIO_CACHE_DIRECTORY",
                r"D:\BP-Local\audio-cache",
            )
        )

        self.output_directory = (
            audio_cache_directory
            / "kokoro"
        )

        self.default_language = os.getenv(
            "KOKORO_DEFAULT_LANGUAGE",
            "a",
        )

        self.default_voice = os.getenv(
            "KOKORO_DEFAULT_VOICE",
            "af_heart",
        )

        requested_device = os.getenv(
            "KOKORO_DEVICE",
            "auto",
        ).strip().lower()

        if requested_device == "auto":
            self.device = (
                "cuda"
                if torch.cuda.is_available()
                else "cpu"
            )
        elif requested_device in {
            "cpu",
            "cuda",
        }:
            self.device = requested_device
        else:
            self.device = "cpu"

        if (
            self.device == "cuda"
            and not torch.cuda.is_available()
        ):
            self.device = "cpu"

        self.pipeline: KPipeline | None = None

        self.load_seconds: float | None = None

        self.last_error: str | None = None

        self.lock = threading.Lock()

        self.output_directory.mkdir(
            parents=True,
            exist_ok=True,
        )

    def is_installed(self) -> bool:
        return True

    def is_loaded(self) -> bool:
        return self.pipeline is not None

    def is_available(self) -> bool:
        return self.last_error is None

    def get_status(
        self,
    ) -> dict[str, Any]:
        if self.last_error:
            status = (
                "Error: "
                f"{self.last_error}"
            )
        elif self.is_loaded():
            status = "Ready"
        else:
            status = (
                "Installed, not loaded"
            )

        return {
            "engine_id": "kokoro",
            "display_name": (
                "Kokoro-82M"
            ),
            "installed": (
                self.is_installed()
            ),
            "available": (
                self.is_available()
            ),
            "loaded": (
                self.is_loaded()
            ),
            "status": status,
            "device": self.device,
            "load_seconds": (
                self.load_seconds
            ),
            "default_voice": (
                self.default_voice
            ),
            "default_language": (
                self.default_language
            ),
            "sample_rate": (
                SAMPLE_RATE
            ),
            "output_directory": str(
                self.output_directory
            ),
        }

    def get_voices(
        self,
    ) -> list[dict[str, str]]:
        return [
            voice.copy()
            for voice
            in AMERICAN_ENGLISH_VOICES
        ]

    def validate_voice(
        self,
        voice_id: str,
    ) -> None:
        valid_voice_ids = {
            voice["id"]
            for voice
            in AMERICAN_ENGLISH_VOICES
        }

        if voice_id not in valid_voice_ids:
            raise ValueError(
                "The selected Kokoro "
                f"voice is invalid: "
                f"{voice_id}"
            )

    def load(self) -> None:
        if self.pipeline is not None:
            return

        with self.lock:
            if self.pipeline is not None:
                return

            load_started_at = (
                time.perf_counter()
            )

            try:
                self.pipeline = KPipeline(
                    lang_code=(
                        self.default_language
                    ),
                    repo_id=(
                        "hexgrad/Kokoro-82M"
                    ),
                    device=self.device,
                )

                self.load_seconds = (
                    time.perf_counter()
                    - load_started_at
                )

                self.last_error = None

            except Exception as error:
                self.pipeline = None
                self.load_seconds = None
                self.last_error = str(
                    error
                )

                raise

    def generate(
        self,
        text: str,
        voice_id: str | None = None,
        speed: float = 1.0,
        filename: str | None = None,
    ) -> KokoroGenerationResult:
        clean_text = text.strip()

        if not clean_text:
            raise ValueError(
                "Text is required."
            )

        if len(clean_text) > 5000:
            raise ValueError(
                "The Kokoro preview text "
                "cannot exceed 5000 "
                "characters."
            )

        selected_voice = (
            voice_id
            or self.default_voice
        )

        self.validate_voice(
            selected_voice
        )

        if (
            speed < 0.5
            or speed > 2.0
        ):
            raise ValueError(
                "Speed must be between "
                "0.5 and 2.0."
            )

        self.load()

        if self.pipeline is None:
            raise RuntimeError(
                "The Kokoro pipeline "
                "could not be loaded."
            )

        generation_id = (
            uuid.uuid4().hex
        )

        safe_filename = (
            filename
            or (
                "kokoro-"
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
            self.output_directory
            / safe_filename
        )

        generation_started_at = (
            time.perf_counter()
        )

        audio_parts: list[
            np.ndarray
        ] = []

        try:
            with self.lock:
                generator = self.pipeline(
                    clean_text,
                    voice=selected_voice,
                    speed=speed,
                )

                for result in generator:
                    audio = getattr(
                        result,
                        "audio",
                        None,
                    )

                    if audio is None:
                        try:
                            audio = result[2]
                        except (
                            IndexError,
                            TypeError,
                        ):
                            audio = None

                    if audio is None:
                        continue

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

                    audio_array = np.asarray(
                        audio,
                        dtype=np.float32,
                    ).reshape(-1)

                    if audio_array.size > 0:
                        audio_parts.append(
                            audio_array
                        )

            if not audio_parts:
                raise RuntimeError(
                    "Kokoro returned no "
                    "audio."
                )

            final_audio = np.concatenate(
                audio_parts
            )

            sf.write(
                output_path,
                final_audio,
                SAMPLE_RATE,
            )

            generation_seconds = (
                time.perf_counter()
                - generation_started_at
            )

            duration_seconds = (
                len(final_audio)
                / SAMPLE_RATE
            )

            real_time_factor = (
                generation_seconds
                / duration_seconds
                if duration_seconds > 0
                else 0.0
            )

            self.last_error = None

            return KokoroGenerationResult(
                generation_id=(
                    generation_id
                ),
                output_path=(
                    output_path
                ),
                voice_id=(
                    selected_voice
                ),
                language_code=(
                    self.default_language
                ),
                sample_rate=(
                    SAMPLE_RATE
                ),
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
                device=self.device,
                cached=False,
            )

        except Exception as error:
            self.last_error = str(
                error
            )

            raise


kokoro_engine = KokoroEngine()