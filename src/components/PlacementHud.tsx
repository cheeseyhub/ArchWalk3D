import { RotateCw, X } from 'lucide-react';
import type { GeneratedFurnitureAsset } from '../arch/types';

interface PlacementHudProps {
  asset: GeneratedFurnitureAsset | null;
  rotationY: number;
  onRotate: () => void;
  onCancel: () => void;
}

export function PlacementHud({
  asset,
  rotationY,
  onRotate,
  onCancel,
}: PlacementHudProps) {
  if (!asset) return null;

  const degrees = Math.round((((rotationY * 180) / Math.PI) % 360 + 360) % 360);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 z-20 max-w-[94vw] rounded-xl bg-[#141820]/95 border border-[#d99b4e]/55 shadow-2xl px-3.5 py-2 flex flex-wrap sm:flex-nowrap items-center justify-center gap-x-3 gap-y-2"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-3 h-3 rounded-sm border border-white/25 shrink-0"
          style={{ backgroundColor: asset.color }}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold text-[#f3f4f6] truncate max-w-[230px]">
          {asset.name}
        </span>
        <span className="text-[11px] text-[#a5aebd] font-[family-name:var(--font-mono)] tabular-nums whitespace-nowrap">
          {degrees}° · Click floor
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onRotate}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-[#eceef2] text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          <span>Rotate 45° (R)</span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#d99b4e] hover:bg-[#e3a85d] text-[#111318] text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Done</span>
        </button>
      </div>
    </div>
  );
}
