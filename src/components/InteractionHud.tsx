import { Armchair, DoorOpen, LampFloor, MousePointerClick, Tv } from 'lucide-react';
import type { CameraMode, FurnitureInteractionKind, HoveredFurnitureInfo } from '../arch/types';

interface InteractionHudProps {
  cameraMode: CameraMode;
  arrangeMode: boolean;
  hasSelection: boolean;
  isPlacing: boolean;
  hoveredInteraction: HoveredFurnitureInfo | null;
  isSeated: boolean;
}

function InteractionIcon({ kind }: { kind: FurnitureInteractionKind }) {
  const cls = 'w-3.5 h-3.5 text-[#e2a960] shrink-0';
  switch (kind) {
    case 'toggle_lamp':
      return <LampFloor className={cls} aria-hidden="true" />;
    case 'toggle_tv':
      return <Tv className={cls} aria-hidden="true" />;
    case 'toggle_door':
      return <DoorOpen className={cls} aria-hidden="true" />;
    case 'sit':
      return <Armchair className={cls} aria-hidden="true" />;
  }
}

export function InteractionHud({
  cameraMode,
  arrangeMode,
  hasSelection,
  isPlacing,
  hoveredInteraction,
  isSeated,
}: InteractionHudProps) {
  if (arrangeMode || hasSelection || isPlacing) return null;

  const isWalk = cameraMode === 'walk';

  return (
    <>
      {/* Walk Mode subtle center-screen crosshair (always visible; turns brass over interactive furniture) */}
      {isWalk && !isSeated && (
        <div
          aria-hidden="true"
          data-testid="walk-crosshair"
          data-interactive-target={hoveredInteraction ? hoveredInteraction.type : ''}
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div
            className={`relative flex items-center justify-center transition-transform duration-150 ${
              hoveredInteraction ? 'scale-125' : 'scale-100'
            }`}
          >
            <div
              className={`rounded-full transition-colors duration-150 ${
                hoveredInteraction
                  ? 'w-5 h-5 border-2 border-[#e2a960] bg-[#e2a960]/15'
                  : 'w-2 h-2 border border-white/80 bg-white/75 ring-2 ring-black/45'
              }`}
            />
            {hoveredInteraction && (
              <div className="absolute w-1 h-1 rounded-full bg-[#f5d092]" />
            )}
          </div>
        </div>
      )}

      {/* Seated Walk Mode HUD prompt */}
      {isWalk && isSeated && (
        <div
          role="status"
          aria-live="polite"
          data-testid="seated-hud"
          className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#13161c]/95 border border-[#d99b4e]/45 shadow-xl text-xs text-[#eceef2] whitespace-nowrap">
            <Armchair className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
            <span className="font-medium text-[#f3d4a8]">Seated</span>
            <span className="text-white/25" aria-hidden="true">
              ·
            </span>
            <span className="text-[#cbd5e1]">
              Press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.1] font-[family-name:var(--font-mono)] text-white">
                WASD
              </kbd>{' '}
              or{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.1] font-[family-name:var(--font-mono)] text-white">
                E
              </kbd>{' '}
              to stand up
            </span>
          </div>
        </div>
      )}

      {/* Interactive Furniture Hover Prompt (Walk Mode near center crosshair, Orbit Mode bottom-center) */}
      {hoveredInteraction && !isSeated && (
        <div
          role="status"
          aria-live="polite"
          data-testid="interaction-prompt"
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 ${
            isWalk ? 'top-[calc(50%+26px)]' : 'bottom-5'
          }`}
        >
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#13161c]/95 border border-[#d99b4e]/45 shadow-xl text-xs text-[#eceef2] whitespace-nowrap">
            <InteractionIcon kind={hoveredInteraction.interactionKind} />
            {isWalk ? (
              <span>
                Press{' '}
                <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-[#d99b4e] text-[#111318] font-[family-name:var(--font-mono)] font-semibold">
                  E
                </kbd>{' '}
                <span className="text-[#f3d4a8] font-medium">
                  {hoveredInteraction.actionLabel}
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
                <span className="text-[#aeb5c2]">Click:</span>
                <span className="text-[#f3d4a8] font-medium">
                  {hoveredInteraction.actionLabel}
                </span>
                <span className="text-white/25" aria-hidden="true">
                  ·
                </span>
                <span className="text-[#9ca3af]">Double-click to edit</span>
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
