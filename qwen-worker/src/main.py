from __future__ import annotations

import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime
from datetime import timezone
from pathlib import Path

import psutil
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import (
    CORSMiddleware,
)
from fastapi.responses import (
    FileResponse,
    JSONResponse,
)
from pydantic import BaseModel
from pydantic import Field


WORKER_DIRECTORY = (
    Path(__file__)
    .resolve()
    .parent
    .parent
)

load_dotenv(
    WORKER_DIRECTORY / ".env"
)


from src.services.qwen_engine import (
    qwen_engine,
)


SERVICE_NAME = "bp-qwen-worker"
SERVICE_VERSION = "0.1.0"
SERVICE_STARTED_AT = time.time()

WORKER_HOST = os.getenv(
    "QWEN_WORKER_HOST",
    "127.0.0.1",
)

WORKER_PORT = int(
    os.getenv(
        "QWEN_WORKER_PORT",
        "3003",
    )
)

IDLE_CHECK_INTERVAL_SECONDS = 15

idle_monitor_stop_event = (
    threading.Event()
)

idle_monitor_thread: (
    threading.Thread
    | None
) = None


class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
    mode: str
    uptime_seconds: int
    timestamp: str


class QwenSpeakerResponse(
    BaseModel
):
    id: str
    name: str
    description: str
    native_language: str


class QwenPreviewRequest(
    BaseModel
):
    text: str = Field(
        min_length=1,
        max_length=1000,
    )

    speaker: str = Field(
        default="Aiden",
    )

    language: str = Field(
        default="English",
        min_length=1,
        max_length=50,
    )

    instruction: str = Field(
        default=(
            "Speak calmly and clearly, "
            "with controlled warmth and "
            "a measured pace."
        ),
        max_length=500,
    )


class QwenPreviewResponse(
    BaseModel
):
    ok: bool
    engine_id: str
    generation_id: str
    speaker: str
    language: str
    instruction: str
    sample_rate: int
    duration_seconds: float
    generation_seconds: float
    real_time_factor: float
    file_size_bytes: int
    device: str
    output_file: str
    audio_url: str
    cached: bool


def idle_monitor() -> None:
    while not (
        idle_monitor_stop_event.wait(
            IDLE_CHECK_INTERVAL_SECONDS
        )
    ):
        try:
            unloaded = (
                qwen_engine
                .unload_if_idle()
            )

            if unloaded:
                print(
                    "Qwen model unloaded "
                    "after the idle timeout."
                )

        except Exception as error:
            print(
                "Qwen idle monitor error:",
                repr(error),
                file=sys.stderr,
            )


def start_idle_monitor() -> None:
    global idle_monitor_thread

    idle_monitor_stop_event.clear()

    idle_monitor_thread = (
        threading.Thread(
            target=idle_monitor,
            name=(
                "qwen-idle-monitor"
            ),
            daemon=True,
        )
    )

    idle_monitor_thread.start()


def stop_idle_monitor() -> None:
    idle_monitor_stop_event.set()

    if (
        idle_monitor_thread
        is not None
        and idle_monitor_thread
        .is_alive()
    ):
        idle_monitor_thread.join(
            timeout=5,
        )


@asynccontextmanager
async def application_lifespan(
    app: FastAPI,
):
    print(
        "Starting BP Qwen worker."
    )

    start_idle_monitor()

    yield

    print(
        "Stopping BP Qwen worker."
    )

    stop_idle_monitor()

    try:
        qwen_engine.unload()
    except Exception as error:
        print(
            "Qwen shutdown cleanup "
            "failed:",
            repr(error),
            file=sys.stderr,
        )


app = FastAPI(
    title="BP Qwen Worker",
    version=SERVICE_VERSION,
    docs_url="/docs",
    redoc_url=None,
    lifespan=application_lifespan,
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


@app.exception_handler(Exception)
async def handle_unexpected_error(
    request: Request,
    error: Exception,
):
    print(
        "Unhandled Qwen worker error:",
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
                    "internal Qwen worker "
                    "error."
                ),
            }
        },
    )


@app.get("/")
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
        "qwen_status_endpoint": (
            "/api/engines/qwen/status"
        ),
        "qwen_speaker_endpoint": (
            "/api/engines/qwen/speakers"
        ),
        "qwen_preview_endpoint": (
            "/api/engines/qwen/preview"
        ),
        "qwen_unload_endpoint": (
            "/api/engines/qwen/unload"
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
)
async def capabilities():
    engine_status = (
        qwen_engine.get_status()
    )

    memory = psutil.virtual_memory()

    return {
        "ok": True,
        "service": SERVICE_NAME,
        "python_version": (
            sys.version.split()[0]
        ),
        "logical_cpu_count": (
            psutil.cpu_count(
                logical=True
            )
            or 0
        ),
        "physical_cpu_count": (
            psutil.cpu_count(
                logical=False
            )
            or 0
        ),
        "total_memory_gb": round(
            memory.total
            / 1073741824,
            1,
        ),
        "available_memory_gb": round(
            memory.available
            / 1073741824,
            1,
        ),
        "engine": engine_status,
    }


@app.get(
    "/api/engines/qwen/status",
)
async def qwen_status():
    engine_status = (
        qwen_engine.get_status()
    )

    return {
        "ok": True,
        "engine_id": engine_status[
            "engine_id"
        ],
        "display_name": engine_status[
            "display_name"
        ],
        "model_id": engine_status[
            "model_id"
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
        "busy": engine_status[
            "busy"
        ],
        "status": engine_status[
            "status"
        ],
        "device": engine_status[
            "device"
        ],
        "gpu": engine_status[
            "gpu"
        ],
        "dtype": engine_status[
            "dtype"
        ],
        "attention": engine_status[
            "attention"
        ],
        "load_seconds": engine_status[
            "load_seconds"
        ],
        "free_ram_gb": engine_status[
            "free_ram_gb"
        ],
        "free_vram_gb": engine_status[
            "free_vram_gb"
        ],
        "total_vram_gb": engine_status[
            "total_vram_gb"
        ],
        "minimum_ram_gb": engine_status[
            "minimum_ram_gb"
        ],
        "minimum_vram_gb": engine_status[
            "minimum_vram_gb"
        ],
        "idle_timeout_seconds": (
            engine_status[
                "idle_timeout_seconds"
            ]
        ),
        "seconds_until_unload": (
            engine_status[
                "seconds_until_unload"
            ]
        ),
        "default_speaker": (
            engine_status[
                "default_speaker"
            ]
        ),
        "default_language": (
            engine_status[
                "default_language"
            ]
        ),
        "maximum_text_length": (
            engine_status[
                "maximum_text_length"
            ]
        ),
        "audio_directory": (
            engine_status[
                "audio_directory"
            ]
        ),
    }


@app.get(
    "/api/engines/qwen/speakers",
    response_model=list[
        QwenSpeakerResponse
    ],
)
async def qwen_speakers():
    speaker_responses = []

    for speaker in (
        qwen_engine.get_speakers()
    ):
        speaker_response = (
            QwenSpeakerResponse(
                id=speaker["id"],
                name=speaker["name"],
                description=speaker[
                    "description"
                ],
                native_language=speaker[
                    "native_language"
                ],
            )
        )

        speaker_responses.append(
            speaker_response
        )

    return speaker_responses


@app.post(
    "/api/engines/qwen/preview",
    response_model=(
        QwenPreviewResponse
    ),
)
async def qwen_preview(
    request: QwenPreviewRequest,
):
    try:
        result = (
            qwen_engine.generate(
                text=request.text,
                speaker=request.speaker,
                language=(
                    request.language
                ),
                instruction=(
                    request.instruction
                ),
            )
        )

        audio_url = (
            "/api/engines/qwen/audio/"
            f"{result.output_path.name}"
        )

        return QwenPreviewResponse(
            ok=True,
            engine_id="qwen3-tts",
            generation_id=(
                result.generation_id
            ),
            speaker=result.speaker,
            language=result.language,
            instruction=(
                result.instruction
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
            device=result.device,
            output_file=(
                result.output_path.name
            ),
            audio_url=audio_url,
            cached=result.cached,
        )

    except ValueError as error:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": (
                        "INVALID_QWEN_REQUEST"
                    ),
                    "message": str(
                        error
                    ),
                }
            },
        )

    except RuntimeError as error:
        message = str(error)

        if (
            "already generating"
            in message
        ):
            status_code = 409
            error_code = (
                "QWEN_BUSY"
            )

        elif (
            "Insufficient"
            in message
            or "CUDA is unavailable"
            in message
        ):
            status_code = 503
            error_code = (
                "QWEN_UNAVAILABLE"
            )

        else:
            status_code = 500
            error_code = (
                "QWEN_GENERATION_FAILED"
            )

        return JSONResponse(
            status_code=status_code,
            content={
                "error": {
                    "code": error_code,
                    "message": message,
                }
            },
        )

    except Exception as error:
        qwen_engine.last_error = str(
            error
        )

        print(
            "Qwen preview failed:",
            repr(error),
            file=sys.stderr,
        )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": (
                        "QWEN_GENERATION_FAILED"
                    ),
                    "message": (
                        "Qwen3-TTS could "
                        "not generate the "
                        "requested preview."
                    ),
                }
            },
        )


@app.get(
    "/api/engines/qwen/audio/{filename}",
)
async def qwen_audio(
    filename: str,
):
    safe_filename = Path(
        filename
    ).name

    if (
        safe_filename != filename
        or not safe_filename
            .lower()
            .endswith(".wav")
    ):
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": (
                        "INVALID_AUDIO_FILE"
                    ),
                    "message": (
                        "The requested audio "
                        "filename is invalid."
                    ),
                }
            },
        )

    audio_path = (
        qwen_engine.audio_directory
        / safe_filename
    )

    if not audio_path.is_file():
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": (
                        "AUDIO_NOT_FOUND"
                    ),
                    "message": (
                        "The requested Qwen "
                        "audio file was not "
                        "found."
                    ),
                }
            },
        )

    return FileResponse(
        path=audio_path,
        media_type="audio/wav",
        filename=safe_filename,
    )


@app.post(
    "/api/engines/qwen/unload",
)
async def qwen_unload():
    if qwen_engine.is_busy():
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": (
                        "QWEN_BUSY"
                    ),
                    "message": (
                        "Qwen3-TTS cannot "
                        "be unloaded while "
                        "generation is active."
                    ),
                }
            },
        )

    unloaded = qwen_engine.unload()

    return {
        "ok": unloaded,
        "loaded": (
            qwen_engine.is_loaded()
        ),
        "status": (
            qwen_engine
            .get_status()[
                "status"
            ]
        ),
    }