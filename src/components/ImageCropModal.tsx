'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Check, X, Move } from 'lucide-react';

interface ImageCropModalProps {
  open: boolean;
  imageSrc: string | null;
  title?: string;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob) => Promise<void> | void;
}

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512;

export default function ImageCropModal({
  open,
  imageSrc,
  title = 'Sesuaikan Foto Profil',
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Skala dasar agar sisi terpendek gambar menutup penuh kotak crop 1:1 (cover)
  const baseScale = Math.max(
    VIEWPORT_SIZE / Math.max(1, naturalSize.width),
    VIEWPORT_SIZE / Math.max(1, naturalSize.height)
  );

  const clampOffset = useCallback(
    (nextX: number, nextY: number, currentZoom: number) => {
      const scaledW = naturalSize.width * baseScale * currentZoom;
      const scaledH = naturalSize.height * baseScale * currentZoom;
      const maxX = Math.max(0, (scaledW - VIEWPORT_SIZE) / 2);
      const maxY = Math.max(0, (scaledH - VIEWPORT_SIZE) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [naturalSize.width, naturalSize.height, baseScale]
  );

  // Reset saat gambar baru dibuka
  useEffect(() => {
    if (!open || !imageSrc) {
      setImgLoaded(false);
      return;
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [open, imageSrc]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    imgRef.current = el;
    setNaturalSize({
      width: el.naturalWidth || 1,
      height: el.naturalHeight || 1,
    });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImgLoaded(true);
  };

  // Gambar ulang ke kanvas pratinjau secara real-time
  const drawToCanvas = useCallback(
    (canvas: HTMLCanvasElement, targetSize: number) => {
      const ctx = canvas.getContext('2d');
      const img = imgRef.current;
      if (!ctx || !img || !imgLoaded) return;

      canvas.width = targetSize;
      canvas.height = targetSize;
      ctx.clearRect(0, 0, targetSize, targetSize);

      const ratio = targetSize / VIEWPORT_SIZE;
      const effectiveScale = baseScale * zoom * ratio;
      const drawW = naturalSize.width * effectiveScale;
      const drawH = naturalSize.height * effectiveScale;
      const drawX = (targetSize - drawW) / 2 + offset.x * ratio;
      const drawY = (targetSize - drawH) / 2 + offset.y * ratio;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    },
    [imgLoaded, baseScale, zoom, offset.x, offset.y, naturalSize.width, naturalSize.height]
  );

  useEffect(() => {
    if (previewCanvasRef.current && imgLoaded) {
      drawToCanvas(previewCanvasRef.current, 160);
    }
  }, [drawToCanvas, imgLoaded]);

  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(1, Math.min(3, Number(newZoom.toFixed(2))));
    setZoom(clampedZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y, clampedZoom));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragStart({
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rawX = e.clientX - dragStart.x;
    const rawY = e.clientY - dragStart.y;
    setOffset(clampOffset(rawX, rawY, zoom));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Abaikan jika pointer sudah dilepas
    }
    setDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    handleZoomChange(zoom + delta);
  };

  const handleSave = async () => {
    if (!imgRef.current || !imgLoaded || saving) return;
    setSaving(true);
    try {
      const outCanvas = document.createElement('canvas');
      drawToCanvas(outCanvas, OUTPUT_SIZE);

      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Gagal memproses gambar hasil crop.'));
          },
          'image/png',
          0.95
        );
      });

      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !imageSrc) return null;

  const displayW = naturalSize.width * baseScale * zoom;
  const displayH = naturalSize.height * baseScale * zoom;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-5 shadow-xl space-y-5 my-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Geser dan atur perbesaran gambar di dalam bingkai rasio 1:1.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Area Utama: Bingkai Interaktif 1:1 & Pratinjau Hasil */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* Bingkai Crop 1:1 */}
          <div className="flex flex-col items-center gap-2">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
              className="relative overflow-hidden rounded-2xl border-2 border-slate-300 bg-slate-900 cursor-grab active:cursor-grabbing select-none touch-none shadow-inner"
            >
              <img
                src={imageSrc}
                alt="Area Crop"
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  width: imgLoaded ? `${displayW}px` : '100%',
                  height: imgLoaded ? `${displayH}px` : '100%',
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
                className="absolute max-w-none pointer-events-none select-none"
              />

              {/* Overlay Panduan Lingkaran 1:1 */}
              <div
                className="absolute inset-0 pointer-events-none rounded-full border-2 border-white/90"
                style={{
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
                }}
              />

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-slate-900/75 text-white text-[10px] font-medium inline-flex items-center gap-1 pointer-events-none">
                <Move className="w-3 h-3" />
                <span>Geser untuk mengatur posisi</span>
              </div>
            </div>
          </div>

          {/* Panel Pratinjau Hasil Crop */}
          <div className="flex sm:flex-col items-center justify-center gap-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-4 w-full sm:w-auto">
            <div className="text-center space-y-2">
              <span className="block text-xs font-semibold text-slate-700">
                Pratinjau Foto Profil
              </span>
              <div className="relative mx-auto w-24 h-24 rounded-full overflow-hidden border-2 border-indigo-500 shadow-xs bg-slate-200">
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-full object-cover block"
                />
              </div>
              <span className="block text-[11px] text-slate-500">
                Tampilan Lingkaran (1:1)
              </span>
            </div>
          </div>
        </div>

        {/* Kontrol Zoom & Reset */}
        <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <button
              type="button"
              onClick={() => handleZoomChange(zoom - 0.15)}
              disabled={zoom <= 1}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center justify-center shrink-0"
              title="Perkecil"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="1"
              max="3"
              step="0.02"
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-600 cursor-pointer"
              aria-label="Zoom gambar"
            />

            <button
              type="button"
              onClick={() => handleZoomChange(zoom + 0.15)}
              disabled={zoom >= 3}
              className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center justify-center shrink-0"
              title="Perbesar"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="text-xs font-semibold text-slate-600 w-11 text-right tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Posisi</span>
          </button>
        </div>

        {/* Tombol Batal & Simpan */}
        <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-slate-100">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            <span>Batal</span>
          </button>
          <button
            type="button"
            disabled={saving || !imgLoaded}
            onClick={handleSave}
            className="h-9 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Foto'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
