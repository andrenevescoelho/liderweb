"""Worker base para análise de BPM e tonalidade.

Uso esperado:
- Recebe jobs com song_id + source_type + source_url.
- Baixa/extrai um trecho de 60-90s.
- Executa estimativa de BPM e key.
- Envia callback para a API Next.js.
"""

from __future__ import annotations

import io
import json
import math
import os
import tempfile
from dataclasses import dataclass
from typing import Dict, Optional

import librosa
import numpy as np
import requests
import soundfile as sf
from yt_dlp import YoutubeDL

TARGET_SR = 22050
ANALYSIS_SECONDS = 90

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class AnalysisResult:
    bpm_detected: Optional[int]
    key_detected: Optional[str]
    mode_detected: Optional[str]
    confidence_bpm: float
    confidence_key: float


def _download_youtube_excerpt(url: str) -> str:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        output_file = tmp.name

    ydl_opts = {
        "format": "bestaudio/best",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
            }
        ],
        "outtmpl": output_file.replace(".wav", ""),
        "quiet": True,
        "noplaylist": True,
        "postprocessor_args": ["-t", str(ANALYSIS_SECONDS)],
    }

    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

    if not os.path.exists(output_file):
        candidate = output_file.replace(".wav", ".wav")
        if os.path.exists(candidate):
            output_file = candidate

    return output_file


def _download_upload(url: str) -> str:
    response = requests.get(url, timeout=30)
    response.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        audio_bytes = io.BytesIO(response.content)
        y, sr = librosa.load(audio_bytes, sr=TARGET_SR, mono=True, duration=ANALYSIS_SECONDS)
        sf.write(tmp.name, y, sr)
        return tmp.name


def _load_normalized_audio(path: str) -> np.ndarray:
    y, _ = librosa.load(path, sr=TARGET_SR, mono=True, duration=ANALYSIS_SECONDS)
    if len(y) == 0:
        raise ValueError("Áudio vazio")
    max_amp = np.max(np.abs(y))
    return y / max_amp if max_amp > 0 else y


def detect_bpm(y: np.ndarray) -> tuple[Optional[int], float]:
    onset_env = librosa.onset.onset_strength(y=y, sr=TARGET_SR)
    tempo, _ = librosa.beat.beat_track(onset_envelope=onset_env, sr=TARGET_SR)
    if not tempo or math.isnan(tempo):
        return None, 0.0

    bpm = int(round(float(tempo)))
    bpm_candidates = librosa.beat.tempo(onset_envelope=onset_env, sr=TARGET_SR, aggregate=None)
    confidence = float(np.clip(np.std(bpm_candidates) / 30.0, 0, 1))
    confidence = float(np.clip(1.0 - confidence, 0, 1))
    return bpm, confidence


def detect_key(y: np.ndarray) -> tuple[Optional[str], Optional[str], float]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=TARGET_SR)
    chroma_mean = chroma.mean(axis=1)

    best_score = -1.0
    best_key = None
    best_mode = None

    for i, note in enumerate(NOTE_NAMES):
        major_profile = np.roll(MAJOR_PROFILE, i)
        minor_profile = np.roll(MINOR_PROFILE, i)

        major_score = np.corrcoef(chroma_mean, major_profile)[0, 1]
        minor_score = np.corrcoef(chroma_mean, minor_profile)[0, 1]

        if major_score > best_score:
            best_score = major_score
            best_key = note
            best_mode = "major"

        if minor_score > best_score:
            best_score = minor_score
            best_key = note
            best_mode = "minor"

    if best_key is None:
        return None, None, 0.0

    confidence = float(np.clip((best_score + 1) / 2, 0, 1))
    return best_key, best_mode, confidence


def analyze_song(source_type: str, source_url: str) -> AnalysisResult:
    temp_path = None
    try:
        if source_type == "YOUTUBE":
            temp_path = _download_youtube_excerpt(source_url)
        elif source_type == "UPLOAD":
            temp_path = _download_upload(source_url)
        else:
            raise ValueError(f"source_type inválido: {source_type}")

        y = _load_normalized_audio(temp_path)
        bpm, bpm_confidence = detect_bpm(y)
        key, mode, key_confidence = detect_key(y)

        return AnalysisResult(
            bpm_detected=bpm,
            key_detected=key,
            mode_detected=mode,
            confidence_bpm=bpm_confidence,
            confidence_key=key_confidence,
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def send_callback(song_id: str, payload: Dict[str, object]) -> None:
    callback_base = os.environ["APP_BASE_URL"].rstrip("/")
    callback_token = os.environ.get("AUDIO_ANALYSIS_CALLBACK_TOKEN")

    headers = {"Content-Type": "application/json"}
    if callback_token:
        headers["Authorization"] = f"Bearer {callback_token}"

    response = requests.post(
        f"{callback_base}/api/songs/{song_id}/analysis-result",
        headers=headers,
        data=json.dumps(payload),
        timeout=20,
    )
    response.raise_for_status()


def process_job(job: Dict[str, str]) -> None:
    song_id = job["songId"]
    source_type = job["sourceType"]
    source_url = job["sourceUrl"]

    try:
        result = analyze_song(source_type, source_url)
        send_callback(
            song_id,
            {
                "analysisStatus": "DONE",
                "bpmDetected": result.bpm_detected,
                "keyDetected": result.key_detected,
                "modeDetected": result.mode_detected,
                "confidenceBpm": result.confidence_bpm,
                "confidenceKey": result.confidence_key,
            },
        )
    except Exception as exc:
        send_callback(
            song_id,
            {
                "analysisStatus": "FAILED",
                "analysisError": str(exc),
            },
        )
