'use client';

import React from 'react';

interface FormattedMessageProps {
  content: string;
  isUser?: boolean;
}

function renderInline(text: string, isUser: boolean, keyPrefix: string): React.ReactNode[] {
  // Tokenisasi inline: `code`, ***bold italic***, **bold**, *italic*
  const regex = /(`[^`\n]+`|\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|\*[^*\n]+?\*)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${keyPrefix}-${idx}`;

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={key}
          className={`px-1.5 py-0.5 rounded text-[0.88em] font-mono ${
            isUser
              ? 'bg-white/15 text-indigo-100'
              : 'bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300'
          }`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('***') && part.endsWith('***') && part.length >= 6) {
      return (
        <strong key={key} className="font-bold italic">
          {part.slice(3, -3)}
        </strong>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={key} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em
          key={key}
          className={`italic ${
            isUser ? 'text-slate-200 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {part.slice(1, -1)}
        </em>
      );
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

/**
 * Merender teks percakapan roleplay secara aman (tanpa raw HTML):
 * - *tindakan / narasi* -> italic dengan kontras terjaga di mode terang & gelap
 * - **tebal** & ***tebal miring***
 * - `kode / pesan HUD / teks layar` -> inline monospace
 * - > kutipan -> blockquote
 * - --- atau *** pada baris terpisah -> garis pemisah adegan
 */
export default function FormattedMessage({ content, isUser = false }: FormattedMessageProps) {
  if (!content) return null;

  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Garis pemisah adegan (--- atau ***)
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      nodes.push(
        <hr
          key={`hr-${i}`}
          className={`my-2.5 border-t ${
            isUser ? 'border-white/25' : 'border-slate-200 dark:border-slate-700'
          }`}
        />
      );
      continue;
    }

    // Blockquote (> ...)
    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [trimmed.slice(2)];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('> ')) {
        i++;
        quoteLines.push(lines[i].trim().slice(2));
      }
      nodes.push(
        <blockquote
          key={`bq-${i}`}
          className={`my-1.5 pl-3 border-l-2 text-[0.95em] ${
            isUser
              ? 'border-white/40 text-slate-100/90'
              : 'border-indigo-400/70 dark:border-indigo-500/70 text-slate-600 dark:text-slate-300'
          }`}
        >
          {quoteLines.map((qLine, qi) => (
            <React.Fragment key={qi}>
              {qi > 0 && <br />}
              {renderInline(qLine, isUser, `bq-${i}-${qi}`)}
            </React.Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    if (nodes.length > 0) {
      const prev = nodes[nodes.length - 1];
      const prevIsBlock = React.isValidElement(prev) && (prev.type === 'hr' || prev.type === 'blockquote');
      if (!prevIsBlock) {
        nodes.push(<br key={`br-${i}`} />);
      }
    }

    nodes.push(<React.Fragment key={`ln-${i}`}>{renderInline(line, isUser, `ln-${i}`)}</React.Fragment>);
  }

  return <span className="inline break-words [overflow-wrap:anywhere]">{nodes}</span>;
}
