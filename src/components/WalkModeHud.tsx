interface WalkModeHudProps {
  visible: boolean;
  isPointerLocked: boolean;
  activeRoomName: string | null;
}

export function WalkModeHud({
  visible,
  isPointerLocked,
  activeRoomName,
}: WalkModeHudProps) {
  if (!visible) return null;

  return (
    <>
      {/* Subtle center reticle while pointer-locked in first-person walk mode */}
      {isPointerLocked && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white/80 ring-2 ring-black/40" />
        </div>
      )}

      {/* Compact controls hint overlay at bottom center (no backdrop-blur over WebGL) */}
      <div
        role="status"
        aria-live="polite"
        data-testid="walk-mode-hud"
        className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 z-20 max-w-[94vw]"
      >
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 rounded-xl bg-[#13161c]/95 border border-white/[0.12] shadow-xl text-xs text-[#d1d5db]">
          {activeRoomName && (
            <span className="font-medium text-[#e2a960] whitespace-nowrap pr-3 border-r border-white/[0.14]">
              {activeRoomName}
            </span>
          )}
          <span className="whitespace-nowrap">
            <kbd className="font-[family-name:var(--font-mono)] text-white font-medium">WASD</kbd>{' '}
            to move
          </span>
          <span className="hidden sm:inline text-white/20" aria-hidden="true">
            ·
          </span>
          <span className="whitespace-nowrap">
            <kbd className="font-[family-name:var(--font-mono)] text-white font-medium">Mouse</kbd>{' '}
            {isPointerLocked ? 'to look' : 'to look'}
          </span>
          <span className="hidden sm:inline text-white/20" aria-hidden="true">
            ·
          </span>
          <span className="whitespace-nowrap">
            <kbd className="font-[family-name:var(--font-mono)] text-white font-medium">ESC</kbd>{' '}
            to release cursor
          </span>
        </div>
      </div>
    </>
  );
}
