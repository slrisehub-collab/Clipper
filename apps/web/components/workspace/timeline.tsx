'use client';
import { useState } from 'react';
import { formatTimestamp, formatDuration, type Segment } from '@clipforge/core/plan';
import { cn } from '@/lib/cn';

/** Visual map of where the cuts fall. */
export function Timeline({ segments, duration, className }: { segments: Segment[]; duration: number; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const many = segments.length > 120;
  return (
    <div className={className}>
      <div className="relative h-12 overflow-hidden rounded-lg border border-white/[0.06] bg-ink-900" onMouseLeave={() => setHover(null)}>
        {segments.map((s, i) => (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            className={cn(
              'absolute inset-y-1.5 transition-colors',
              many ? '' : 'rounded-[3px]',
              hover === i ? 'bg-volt-300' : i % 2 ? 'bg-volt-500/55' : 'bg-volt-400/85',
            )}
            style={{
              left: `${(s.start / duration) * 100}%`,
              width: `calc(${((s.end - s.start) / duration) * 100}% - ${many ? 0 : 2}px)`,
              marginLeft: many ? 0 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[11px] text-mist-500">
        <span>00:00</span>
        <span className="text-mist-300">
          {hover !== null ? `Clip ${hover + 1}: ${formatTimestamp(segments[hover].start)} to ${formatTimestamp(segments[hover].end)} (${formatDuration(segments[hover].end - segments[hover].start)})` : ''}
        </span>
        <span>{formatTimestamp(duration)}</span>
      </div>
    </div>
  );
}

export function SegmentList({ segments }: { segments: Segment[] }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-white/[0.06]">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-ink-800 text-[11px] uppercase tracking-wide text-mist-400">
          <tr><th className="px-3 py-2 font-medium">Clip</th><th className="px-3 py-2 font-medium">Start</th><th className="px-3 py-2 font-medium">End</th><th className="px-3 py-2 text-right font-medium">Length</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04] font-mono tabular-nums text-mist-200">
          {segments.map((s, i) => (
            <tr key={i} className={i === segments.length - 1 && segments.length > 1 && Math.abs((s.end - s.start) - (segments[0].end - segments[0].start)) > 0.01 ? 'text-signal-amber' : ''}>
              <td className="px-3 py-1.5 font-sans text-mist-300">#{i + 1}</td>
              <td className="px-3 py-1.5">{formatTimestamp(s.start, true)}</td>
              <td className="px-3 py-1.5">{formatTimestamp(s.end, true)}</td>
              <td className="px-3 py-1.5 text-right">{formatDuration(s.end - s.start)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
