#!/usr/bin/env bash
# Skrip Start & Watchdog Produksi Naravia (Fase 4 - Opsional Deploy VM Linux)
PORT="${PORT:-3100}"
echo "[Naravia Watchdog] Memulai layanan Naravia di port ${PORT}..."

while true; do
  PORT="$PORT" npm run start -- -p "$PORT"
  echo "[Naravia Watchdog] Proses berhenti. Menyalakan ulang dalam 3 detik..."
  sleep 3
done
