'use client';

import React from 'react';

interface FormattedMessageProps {
  content: string;
  isUser?: boolean;
}

/**
 * Merender teks pesan dengan dukungan asterisk:
 * - Teks di dalam tanda bintang tunggal (*tindakan / narasi*) dirender miring (italic).
 * - Teks di dalam tanda bintang ganda (**penekanan / tebal**) dirender tebal (bold).
 * - Teks di dalam tanda bintang tripel (***tebal & miring***) dirender tebal dan miring.
 * - Tetap mempertahankan line-break alami (\n).
 */
export default function FormattedMessage({ content, isUser = false }: FormattedMessageProps) {
  if (!content) return null;

  // Regex tokenisasi untuk:
  // 1. ***bold italic***
  // 2. **bold**
  // 3. *italic*
  // 4. \n (newline)
  const regex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^*\n]+?\*|\n)/g;
  const parts = content.split(regex);

  return (
    <span className="inline">
      {parts.map((part, index) => {
        if (!part) return null;

        if (part === '\n') {
          return <br key={index} />;
        }

        // ***Bold & Italic***
        if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
          const inner = part.slice(3, -3);
          return (
            <strong key={index} className="font-bold italic">
              {inner}
            </strong>
          );
        }

        // **Bold**
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          const inner = part.slice(2, -2);
          return (
            <strong key={index} className="font-bold">
              {inner}
            </strong>
          );
        }

        // *Italic*
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
          const inner = part.slice(1, -1);
          return (
            <em
              key={index}
              className={`italic not-italic:font-normal ${
                isUser ? 'text-slate-200' : 'text-slate-600'
              }`}
            >
              {inner}
            </em>
          );
        }

        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
}
