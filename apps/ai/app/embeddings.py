"""
Embedding layer with a graceful degradation chain.

1. **Gemini** (`text-embedding-004`) when GEMINI_API_KEY is configured.
2. **Local hashed TF-IDF** otherwise — deterministic, dependency-free, and
   good enough for skill/JD overlap retrieval. Because it uses the hashing
   trick there is no vocabulary to fit, so vectors stay comparable across
   process restarts and between separate index/query calls.
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import Iterable

import numpy as np

from .config import settings

TOKEN_RE = re.compile(r"[a-z0-9+#.]+")

STOPWORDS = {
    "the", "and", "for", "with", "you", "our", "are", "will", "have", "this", "that", "from",
    "your", "work", "role", "team", "using", "into", "who", "all", "any", "can", "their", "them",
    "about", "across", "also", "more", "than", "when", "what", "which", "while", "would", "must",
    "should", "able", "well", "good", "strong", "plus", "etc", "per", "not", "but", "its", "has",
    "been", "they", "were", "was", "use", "used", "one", "two", "new", "other", "such", "very",
}


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def tokenize(text: str) -> list[str]:
    tokens = [t for t in TOKEN_RE.findall(normalize_text(text)) if len(t) > 1]
    return [t for t in tokens if t not in STOPWORDS]


def _bucket(token: str, dim: int) -> tuple[int, float]:
    """Stable hash -> (index, sign). The sign reduces collision bias."""
    digest = hashlib.md5(token.encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % dim
    sign = 1.0 if digest[4] % 2 == 0 else -1.0
    return idx, sign


def local_embed(text: str, dim: int | None = None) -> np.ndarray:
    """Hashed bag-of-ngrams with sublinear TF weighting, L2-normalised."""
    dim = dim or settings.embedding_dim
    vec = np.zeros(dim, dtype=np.float32)

    tokens = tokenize(text)
    if not tokens:
        return vec

    counts: dict[str, float] = {}
    for token in tokens:
        counts[token] = counts.get(token, 0.0) + 1.0
        # Character trigrams capture "react"/"reactive", "node"/"nodejs" style near-misses.
        padded = f"_{token}_"
        for i in range(len(padded) - 2):
            gram = f"#{padded[i:i + 3]}"
            counts[gram] = counts.get(gram, 0.0) + 0.4

    for token, count in counts.items():
        idx, sign = _bucket(token, dim)
        vec[idx] += sign * (1.0 + math.log(count))

    norm = float(np.linalg.norm(vec))
    return vec / norm if norm > 0 else vec


def embed_texts(texts: Iterable[str]) -> tuple[np.ndarray, str]:
    """
    Returns (matrix[N, dim], provider_name).
    Falls back to local embeddings on any Gemini error so retrieval never dies.
    """
    texts = list(texts)
    if not texts:
        return np.zeros((0, settings.embedding_dim), dtype=np.float32), "local-hashing"

    if settings.gemini_enabled:
        try:
            from google import genai  # imported lazily — optional dependency

            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.embed_content(
                model=settings.gemini_embed_model,
                contents=texts,
            )
            vectors = [np.asarray(e.values, dtype=np.float32) for e in response.embeddings]
            matrix = np.vstack(vectors)
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            return matrix / norms, "gemini"
        except Exception as exc:  # noqa: BLE001 — any failure degrades, never raises
            print(f"[embeddings] Gemini unavailable ({exc}); using local hashing embeddings")

    return np.vstack([local_embed(t) for t in texts]), "local-hashing"


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity for already-normalised vectors (dot product)."""
    if a.size == 0 or b.size == 0:
        return 0.0
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else 0.0


def calibrate_similarity(similarity: float, provider: str | None = None) -> float:
    """
    Score calibration.

    Raw cosine values are not comparable across embedders: hashed TF-IDF puts
    related documents in the ~0.15–0.65 band, while Gemini's embedding model
    compresses everything into a high, narrow ~0.55–0.92 band. Mapping each
    provider's realistic band onto [0, 1] makes the blended match score
    human-interpretable ("72/100") without changing candidate *ordering*,
    because the transform is monotonic.
    """
    provider = provider or settings_provider()
    lo, hi = (0.15, 0.65) if provider.startswith("local") else (0.55, 0.92)
    return max(0.0, min(1.0, (similarity - lo) / (hi - lo)))


def settings_provider() -> str:
    """Which embedding provider is active — used to pick the calibration band."""
    from .vector_store import store  # local import avoids a circular dependency

    return store.provider
