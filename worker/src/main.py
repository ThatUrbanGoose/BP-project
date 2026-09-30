from __future__ import annotations

import os
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

WORKER_DIRECTORY = Path(
    __file__
).resolve().parent.parent

load_dotenv(
    WORKER_DIRECTORY / ".env"
)

from src.services.kokoro_engine import (
    kokoro_engine,
)

SERVICE_NAME = "bp-local-worker"
SERVICE_VERSION = "0.2.0"
SERVICE_STARTED_AT = time.time()

WORKER_HOST = "127.0.0.1"
WORKER_PORT = 3002

BP_DATA_DIRECTORY = Path(
    os.getenv(
        "BP_DATA_DIRECTORY",
        r"D:\BP-Local",
    )
)

BP_MODEL_DIRECTORY = Path(
    os.getenv(
        "BP_MODEL_DIRECTORY",
        str(
            BP_DATA_DIRECTORY
            / "models"
        ),
    )
)

BP_AUDIO_CACHE_DIRECTORY = Path(
    os.getenv(
        "BP_AUDIO_CACHE_DIRECTORY",
        str(
            BP_DATA_DIRECTORY
            / "audio-cache"
        ),
    )
)


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    mode: str
    uptime_seconds: int
    timestamp: str


class EngineStatus(BaseModel):
    engine_id: str
    display_name: str
    available: bool
    installed: bool
    status: str


class CapabilityResponse(BaseModel):
    ok: bool
    service: str
    python_version: str
    operating_system: str
    architecture: str
    logical_cpu_count: int
    physical_cpu_count: int
    total_memory_gb: float
    available_memory_gb: float
    data_directory: str
    model_directory: str
    audio_cache_directory: str
    engines: list[EngineStatus]

class KokoroVoiceResponse(
    BaseModel
):
    id: str
    name: str
    language: str
    language_code: str


class KokoroPreviewRequest(
    BaseModel
):
    text: str = Field(
        min_length=1,
        max_length=5000,
    )

    voice_id: str = Field(
        default="af_heart",
    )

    speed: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
    )


class KokoroPreviewResponse(
    BaseModel
):
    ok: bool
    engine_id: str
    generation_id: str
    voice_id: str
    language_code: str
    sample_rate: int
    duration_seconds: float
    generation_seconds: float
    real_time_factor: float
    file_size_bytes: int
    device: str
    output_file: str
    cached: bool

app = FastAPI(
    title="BP Local Worker",
    version=SERVICE_VERSION,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3001",
        "http://localhost:5173",
    ],
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "X-Request-Id",
    ],
)


@app.exception_handler(
    Exception
)
async def handle_unexpected_error(
    request,
    error: Exception,
):
    print(
        "Unhandled worker error:",
        repr(error),
        file=sys.stderr,
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": (
                    "INTERNAL_ERROR"
                ),
                "message": (
                    "BP encountered an "
                    "internal worker error."
                ),
            }
        },
    )


@app.get(
    "/",
)
async def root():
    return {
        "service": SERVICE_NAME,
        "status": "running",
        "health_endpoint": (
            "/api/health"
        ),
        "capability_endpoint": (
            "/api/capabilities"
        ),
    }


@app.get(
    "/api/health",
    response_model=HealthResponse,
)
async def health():
    current_time = time.time()

    return HealthResponse(
        ok=True,
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        mode="local",
        uptime_seconds=int(
            current_time
            - SERVICE_STARTED_AT
        ),
        timestamp=datetime.now(
            timezone.utc
        ).isoformat(),
    )


@app.get(
    "/api/capabilities",
    response_model=CapabilityResponse,
)
async def capabilities():
    memory = (
        psutil.virtual_memory()
    )

    current_kokoro_status = (
        kokoro_engine.get_status()
    )

    return CapabilityResponse(
        ok=True,
        service=SERVICE_NAME,
        python_version=(
            platform.python_version()
        ),
        operating_system=(
            platform.system()
        ),
        architecture=(
            platform.machine()
        ),
        logical_cpu_count=(
            psutil.cpu_count(
                logical=True
            )
            or 0
        ),
        physical_cpu_count=(
            psutil.cpu_count(
                logical=False
            )
            or 0
        ),
        total_memory_gb=round(
            memory.total
            / 1024
            / 1024
            / 1024,
            1,
        ),
        available_memory_gb=round(
            memory.available
            / 1024
            / 1024
            / 1024,
            1,
        ),
        data_directory=str(
            BP_DATA_DIRECTORY
        ),
        model_directory=str(
            BP_MODEL_DIRECTORY
        ),
        audio_cache_directory=str(
            BP_AUDIO_CACHE_DIRECTORY
        ),
        engines=[
                        EngineStatus(
                engine_id="kokoro",
                display_name=(
                    "Kokoro-82M"
                ),
                available=bool(
                    current_kokoro_status[
                        "available"
                    ]
                ),
                installed=bool(
                    current_kokoro_status[
                        "installed"
                    ]
                ),
                status=str(
                    current_kokoro_status[
                        "status"
                    ]
                ),
            ),
            EngineStatus(
                engine_id=(
                    "qwen3-tts-0.6b"
                ),
                display_name=(
                    "Qwen3-TTS 0.6B"
                ),
                available=False,
                installed=False,
                status=(
                    "Not installed"
                ),
            ),
        ],
    )
@app.get(
    "/api/engines/kokoro/status",
)
async def kokoro_status():
    engine_status = (
        kokoro_engine.get_status()
    )

    return {
        "ok": True,
        "engine_id": engine_status[
            "engine_id"
        ],
        "display_name": engine_status[
            "display_name"
        ],
        "installed": engine_status[
            "installed"
        ],
        "available": engine_status[
            "available"
        ],
        "loaded": engine_status[
            "loaded"
        ],
        "status": engine_status[
            "status"
        ],
        "device": engine_status[
            "device"
        ],
        "load_seconds": engine_status[
            "load_seconds"
        ],
        "default_voice": engine_status[
            "default_voice"
        ],
        "default_language": engine_status[
            "default_language"
        ],
        "sample_rate": engine_status[
            "sample_rate"
        ],
        "output_directory": engine_status[
            "output_directory"
        ],
    }


@app.get(
    "/api/engines/kokoro/voices",
    response_model=list[
        KokoroVoiceResponse
    ],
)
async def kokoro_voices():
    voice_responses = []

    for voice in (
        kokoro_engine.get_voices()
    ):
        voice_response = (
            KokoroVoiceResponse(
                id=voice["id"],
                name=voice["name"],
                language=voice[
                    "language"
                ],
                language_code=voice[
                    "language_code"
                ],
            )
        )

        voice_responses.append(
            voice_response
        )

    return voice_responses


@app.post(
    "/api/engines/kokoro/preview",
    response_model=(
        KokoroPreviewResponse
    ),
)
async def kokoro_preview(
    request: KokoroPreviewRequest,
):
    try:
        result = (
            kokoro_engine.generate(
                text=request.text,
                voice_id=(
                    request.voice_id
                ),
                speed=request.speed,
            )
        )

        response = (
            KokoroPreviewResponse(
                ok=True,
                engine_id="kokoro",
                generation_id=(
                    result.generation_id
                ),
                voice_id=(
                    result.voice_id
                ),
                language_code=(
                    result.language_code
                ),
                sample_rate=(
                    result.sample_rate
                ),
                duration_seconds=round(
                    result.duration_seconds,
                    3,
                ),
                generation_seconds=round(
                    result.generation_seconds,
                    3,
                ),
                real_time_factor=round(
                    result.real_time_factor,
                    3,
                ),
                file_size_bytes=(
                    result.file_size_bytes
                ),
                device=(
                    result.device
                ),
                output_file=(
                    result.output_path.name
                ),
                cached=(
                    result.cached
                ),
            )
        )

        return response

    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": (
                        "INVALID_KOKORO_REQUEST"
                    ),
                    "message": str(
                        error
                    ),
                }
            },
        )

    except Exception as error:
        kokoro_engine.last_error = (
            str(error)
        )

        print(
            "Kokoro preview failed:",
            repr(error),
            file=sys.stderr,
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": (
                        "KOKORO_GENERATION_FAILED"
                    ),
                    "message": (
                        "Kokoro could not "
                        "generate the "
                        "requested preview."
                    ),
                }
            },
        )