'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

export interface AutoResizeTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit'> {
  /** Tinggi maksimal dalam piksel sebelum memunculkan scroll vertikal internal (bawaan: 160px). */
  maxHeight?: number;
  /** Jika true, tombol Enter (tanpa Shift di desktop) memanggil onEnterSubmit alih-alih membuat baris baru. */
  submitOnEnter?: boolean;
  onEnterSubmit?: () => void;
  /**
   * Jika true, teks tetap turun baris (word-wrap) saat melebihi lebar kotak agar seluruh kalimat terbaca,
   * tetapi karakter Enter/newline tidak diizinkan (cocok untuk Tagline, daftar Tag, atau Judul).
   */
  singleParagraph?: boolean;
}

/**
 * Textarea yang tampak ramping seperti input satu baris saat teks pendek, lalu otomatis
 * memanjang ke bawah saat teks melewati lebar kotak agar pengguna tidak perlu scroll horizontal.
 */
const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(function AutoResizeTextarea(
  {
    maxHeight = 160,
    submitOnEnter = false,
    onEnterSubmit,
    singleParagraph = false,
    rows = 1,
    value,
    defaultValue,
    className = '',
    style,
    onChange,
    onKeyDown,
    ...rest
  },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement, []);

  const syncHeight = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    if (nextHeight > 0) {
      el.style.height = `${nextHeight}px`;
    }
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  useEffect(() => {
    syncHeight();
  }, [value, defaultValue, syncHeight]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (singleParagraph && /[\r\n]/.test(e.target.value)) {
      e.target.value = e.target.value.replace(/[\r\n]+/g, ' ');
    }
    onChange?.(e);
    syncHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (submitOnEnter && !e.shiftKey) {
        const isMobileTouch =
          typeof window !== 'undefined' &&
          (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
        if (!isMobileTouch) {
          e.preventDefault();
          onEnterSubmit?.();
          onKeyDown?.(e);
          return;
        }
      } else if (singleParagraph) {
        e.preventDefault();
        if (onEnterSubmit) {
          onEnterSubmit();
        } else {
          // Izinkan Enter men-submit form induk seperti <input type="text"> bila berada di dalam <form>
          const form = e.currentTarget.form;
          if (form) form.requestSubmit();
        }
        onKeyDown?.(e);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <textarea
      ref={innerRef}
      rows={rows}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      style={style}
      className={`resize-none break-words [overflow-wrap:anywhere] ${className}`}
      {...rest}
    />
  );
});

export default AutoResizeTextarea;
