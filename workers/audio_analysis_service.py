from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from audio_analysis_worker import process_job


class JobPayload(BaseModel):
    songId: str
    sourceType: str
    sourceUrl: str


app = FastAPI(title="LiderWeb Audio Analysis Service")


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/jobs")
def create_job(payload: JobPayload, authorization: str | None = Header(default=None)) -> Dict[str, Any]:
    expected_token = os.environ.get("AUDIO_ANALYSIS_SERVICE_TOKEN")

    if expected_token:
        if authorization != f"Bearer {expected_token}":
            raise HTTPException(status_code=401, detail="Não autorizado")

    process_job(
        {
            "songId": payload.songId,
            "sourceType": payload.sourceType,
            "sourceUrl": payload.sourceUrl,
        }
    )

    return {"ok": True, "songId": payload.songId}
