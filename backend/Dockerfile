FROM python:3.12-slim

RUN apt-get update && apt-get install -y stockfish && rm -rf /var/lib/apt/lists/*
# Verify stockfish installed and set its path as an env var for the app
RUN ls -la /usr/games/stockfish
ENV STOCKFISH_PATH=/usr/games/stockfish

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
