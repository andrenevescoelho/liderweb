FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker

COPY workers/requirements.txt /worker/requirements.txt
RUN pip install --no-cache-dir -r /worker/requirements.txt

COPY workers/audio_analysis_worker.py /worker/audio_analysis_worker.py
COPY workers/audio_analysis_service.py /worker/audio_analysis_service.py

EXPOSE 8001

CMD ["uvicorn", "audio_analysis_service:app", "--host", "0.0.0.0", "--port", "8001"]
