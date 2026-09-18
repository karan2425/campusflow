"""
CampusFlow AI microservice — entrypoint.

Exposes semantic candidate matching (FAISS), resume intelligence and the
campus copilot. All Gemini calls degrade to deterministic, context-grounded
fallbacks, so the service is useful with or without an API key.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import settings
from .routers import chat, health, interview, matching, resume
from .vector_store import store

STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    print("\n  🤖 CampusFlow AI service")
    print(f"  ├─ Gemini      {'enabled (' + settings.gemini_model + ')' if settings.gemini_enabled else 'disabled — using deterministic fallbacks'}")
    print(f"  ├─ Embeddings  {settings.embedding_dim}-dim hashed TF-IDF" + (" (Gemini override available)" if settings.gemini_enabled else ""))
    print(f"  ├─ FAISS index {store.size} vectors in memory")
    print(f"  └─ Docs        http://localhost:{settings.port}/docs\n")
    yield


app = FastAPI(
    title="CampusFlow AI Service",
    description=(
        "Semantic matching, resume intelligence and the campus copilot for CampusFlow. "
        "Gemini-powered with deterministic offline fallbacks."
    ),
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_origin_regex=r"https://[a-z0-9-]+\.(e2b\.app|vercel\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
    response.headers["X-AI-Provider"] = "gemini" if settings.gemini_enabled else "local-fallback"
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    print(f"[ai] unhandled error: {exc!r}")
    return JSONResponse(status_code=500, content={"detail": "AI service error", "error": str(exc)})


@app.get("/", tags=["health"])
async def root() -> dict:
    return {
        "service": "CampusFlow AI",
        "version": __version__,
        "uptimeSec": round(time.time() - STARTED_AT),
        "geminiEnabled": settings.gemini_enabled,
        "indexSize": store.size,
        "docs": "/docs",
    }


app.include_router(health.router, prefix="/ai")
app.include_router(matching.router, prefix="/ai")
app.include_router(chat.router, prefix="/ai")
app.include_router(resume.router, prefix="/ai")
app.include_router(interview.router, prefix="/ai")


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
