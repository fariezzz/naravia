# Skrip Start & Watchdog Produksi Naravia (Fase 4 - Opsional Deploy VM / Windows)
$ErrorActionPreference = "Continue"
$Port = if ($env:PORT) { $env:PORT } else { "3100" }

Write-Host "[Naravia Watchdog] Memulai layanan Naravia di port $Port..."

while ($true) {
    $env:PORT = $Port
    npm run start -- -p $Port
    Write-Host "[Naravia Watchdog] Proses berhenti. Menyalakan ulang dalam 3 detik..."
    Start-Sleep -Seconds 3
}
