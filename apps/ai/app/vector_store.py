"""
FAISS-backed student index.

Uses `IndexFlatIP` over L2-normalised vectors, so inner product == cosine
similarity. Flat (exhaustive) search is the right call at campus scale —
tens of thousands of students, millisecond queries, no training step. The
swap to IVF/HNSW is a one-line change if a university ever outgrows it.
"""
from __future__ import annotations

import json
from pathlib import Path

import faiss
import numpy as np

from .config import settings
from .embeddings import embed_texts
from .schemas import StudentProfile


class StudentVectorStore:
    def __init__(self, dim: int | None = None) -> None:
        self.dim = dim or settings.embedding_dim
        self.index: faiss.Index | None = None
        self.students: list[StudentProfile] = []
        self.provider: str = "local-hashing"
        self._load_from_disk()

    # ---------------------------------------------------------------- state
    @property
    def size(self) -> int:
        return len(self.students)

    def _ensure_index(self) -> faiss.Index:
        if self.index is None:
            self.index = faiss.IndexFlatIP(self.dim)
        return self.index

    # ---------------------------------------------------------------- disk
    def _meta_path(self) -> Path:
        return settings.index_file.with_suffix(".json")

    def _load_from_disk(self) -> None:
        index_path, meta_path = settings.index_file, self._meta_path()
        if not (index_path.exists() and meta_path.exists()):
            return
        try:
            self.index = faiss.read_index(str(index_path))
            self.dim = self.index.d
            payload = json.loads(meta_path.read_text())
            self.students = [StudentProfile(**s) for s in payload.get("students", [])]
            self.provider = payload.get("provider", "local-hashing")
            print(f"[vector_store] restored {len(self.students)} students from disk")
        except Exception as exc:  # noqa: BLE001
            print(f"[vector_store] could not restore index ({exc}); starting empty")
            self.index, self.students = None, []

    def persist(self) -> None:
        if self.index is None:
            return
        try:
            settings.index_file.parent.mkdir(parents=True, exist_ok=True)
            faiss.write_index(self.index, str(settings.index_file))
            self._meta_path().write_text(
                json.dumps(
                    {
                        "provider": self.provider,
                        "students": [s.model_dump(by_alias=True) for s in self.students],
                    }
                )
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[vector_store] persist failed: {exc}")

    # ---------------------------------------------------------------- writes
    def build(self, students: list[StudentProfile]) -> tuple[int, int, str]:
        """Replaces the whole index. Idempotent — safe to call on every sync."""
        matrix, provider = embed_texts(s.profile_text() for s in students)
        if matrix.size == 0:
            self.index, self.students, self.provider = None, [], provider
            return 0, self.dim, provider

        self.dim = matrix.shape[1]
        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(matrix)
        self.students = list(students)
        self.provider = provider
        self.persist()
        return self.index.ntotal, self.dim, provider

    # ---------------------------------------------------------------- reads
    def search(self, query: str, top_k: int = 10) -> list[tuple[StudentProfile, float]]:
        """Returns (student, cosine similarity in [0,1]) pairs, best first."""
        if self.index is None or not self.students:
            return []

        query_vec, _ = embed_texts([query])
        if query_vec.size == 0:
            return []

        k = min(top_k, len(self.students))
        scores, indices = self.index.search(query_vec.astype(np.float32), k)

        results: list[tuple[StudentProfile, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            # Inner product on normalised vectors can dip slightly negative.
            results.append((self.students[int(idx)], max(0.0, min(1.0, float(score)))))
        return results

    def clear(self) -> None:
        self.index, self.students = None, []
        for path in (settings.index_file, self._meta_path()):
            path.unlink(missing_ok=True)


# Process-wide singleton.
store = StudentVectorStore()
