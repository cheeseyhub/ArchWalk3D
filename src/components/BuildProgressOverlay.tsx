import { Check, Loader2, X } from 'lucide-react';
import type { BlueprintStreamProgress } from '../arch/streamProgress';

export type BuildStageId = 'analyzing' | 'reasoning' | 'streaming' | 'building';

export interface BuildProgressState {
  stage: BuildStageId;
  statusText: string;
  elapsedMs: number;
  stream: BlueprintStreamProgress;
}

interface BuildProgressOverlayProps {
  visible: boolean;
  progress: BuildProgressState;
  onCancel: () => void;
}

const STAGES: Array<{ id: BuildStageId; label: string }> = [
  { id: 'analyzing', label: 'Inspecting source image' },
  { id: 'reasoning', label: 'Planning spatial layout & openings' },
  { id: 'streaming', label: 'Streaming rooms, walls & furniture' },
  { id: 'building', label: 'Constructing 3D model & saving' },
];

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

function estimatePercent(progress: BuildProgressState): number {
  const { stage, elapsedMs, stream } = progress;
  if (stage === 'analyzing') return 10;
  if (stage === 'reasoning') {
    // Smooth asymptotic climb from 14% to 44% during model thinking
    const secs = elapsedMs / 1000;
    return Math.min(44, Math.round(14 + 30 * (1 - Math.exp(-secs / 14))));
  }
  if (stage === 'streaming') {
    // Climb from 46% to 90% based on streamed JSON size & discovered entities
    const entityWeight =
      stream.roomsCount * 4 + stream.wallsCount * 1.5 + stream.furnitureCount * 0.8;
    const byteWeight = stream.charsReceived / 180;
    return Math.min(90, Math.round(46 + Math.min(44, entityWeight + byteWeight)));
  }
  return 96;
}

export function BuildProgressOverlay({
  visible,
  progress,
  onCancel,
}: BuildProgressOverlayProps) {
  if (!visible) return null;

  const activeStageIndex = STAGES.findIndex((s) => s.id === progress.stage);
  const percent = estimatePercent(progress);
  const { stream } = progress;
  const kbReceived = (stream.charsReceived / 1024).toFixed(1);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generating 3D architectural model"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0d11]/80 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-[#141820] border border-white/[0.12] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.08]">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[#e2a960] animate-spin shrink-0" aria-hidden="true" />
              <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-[#f3f4f6] truncate">
                {stream.detectedName ? `Building ${stream.detectedName}` : 'Building 3D Architecture'}
              </h2>
            </div>
            <p className="text-xs text-[#9ca3af] truncate">{progress.statusText}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-[family-name:var(--font-mono)] tabular-nums text-[#d1d5db]">
              {formatElapsed(progress.elapsedMs)}
            </span>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel generation"
              className="p-1.5 rounded-md text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-5 pt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-[family-name:var(--font-mono)] tabular-nums text-[#8a93a4]">
            <span>Progress</span>
            <span>
              {percent}%{stream.charsReceived > 0 ? ` · ${kbReceived} KB` : ''}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#d99b4e] transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Pipeline Stages */}
        <ol className="px-5 py-4 space-y-2.5">
          {STAGES.map((stageItem, idx) => {
            const isDone = idx < activeStageIndex;
            const isActive = idx === activeStageIndex;
            return (
              <li key={stageItem.id} className="flex items-center gap-2.5 text-xs">
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                    isDone
                      ? 'bg-[#d99b4e]/20 border-[#d99b4e] text-[#e2a960]'
                      : isActive
                        ? 'border-[#e2a960] text-[#e2a960]'
                        : 'border-white/[0.15] text-[#666f7f]'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-2.5 h-2.5" aria-hidden="true" />
                  ) : isActive ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="text-[9px] font-[family-name:var(--font-mono)]">
                      {idx + 1}
                    </span>
                  )}
                </span>
                <span
                  className={
                    isDone
                      ? 'text-[#9ca3af]'
                      : isActive
                        ? 'text-[#f3f4f6] font-medium'
                        : 'text-[#666f7f]'
                  }
                >
                  {stageItem.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Live Discovered Geometry Readout */}
        <div className="px-5 py-3.5 bg-[#0f1218] border-t border-white/[0.08] space-y-2.5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[11px] text-[#7c8494]">Rooms</p>
              <p className="text-base font-semibold font-[family-name:var(--font-mono)] tabular-nums text-[#f3f4f6]">
                {stream.roomsCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#7c8494]">Walls</p>
              <p className="text-base font-semibold font-[family-name:var(--font-mono)] tabular-nums text-[#f3f4f6]">
                {stream.wallsCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#7c8494]">Furniture</p>
              <p className="text-base font-semibold font-[family-name:var(--font-mono)] tabular-nums text-[#f3f4f6]">
                {stream.furnitureCount}
              </p>
            </div>
          </div>

          {stream.roomNames.length > 0 && (
            <p className="text-[11px] text-[#9ca3af] truncate border-t border-white/[0.06] pt-2">
              <span className="text-[#7c8494]">Drafted: </span>
              {stream.roomNames.join(' · ')}
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#7c8494]">
              Auto-saves on completion
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-[#cbd5e1] hover:text-white px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
