import { Eye, EyeOff, Footprints, Globe, PanelLeftOpen, RotateCcw } from 'lucide-react';
import type { CameraMode } from '../arch/types';

interface ViewportToolbarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  showRoof: boolean;
  onToggleRoof: () => void;
  onResetView: () => void;
}

export function ViewportToolbar({
  sidebarOpen,
  onOpenSidebar,
  cameraMode,
  onCameraModeChange,
  showRoof,
  onToggleRoof,
  onResetView,
}: ViewportToolbarProps) {
  return (
    <div className="pointer-events-none absolute top-3 sm:top-4 inset-x-3 sm:inset-x-4 z-20 flex items-center justify-between gap-2 sm:gap-3">
      {/* Left slot: Expand Sidebar trigger when collapsed */}
      <div className="pointer-events-auto flex items-center shrink-0">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open studio sidebar"
            className="flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg bg-[#13161c]/95 hover:bg-[#1a1f28] border border-white/[0.12] text-sm font-medium text-[#eceef2] transition-colors whitespace-nowrap shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
          >
            <PanelLeftOpen className="w-4 h-4 text-[#e2a960]" aria-hidden="true" />
            <span className="hidden sm:inline">Studio</span>
          </button>
        )}
      </div>

      {/* Center slot: Floating Top Toolbar (solid rgba surface, no backdrop-blur over WebGL) */}
      <div
        role="toolbar"
        aria-label="3D Viewport Controls"
        className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-xl bg-[#13161c]/95 border border-white/[0.12] shadow-xl max-w-full"
      >
        {/* Camera Mode Segmented Toggle */}
        <div
          role="group"
          aria-label="Camera mode"
          className="flex items-center gap-0.5 sm:gap-1 p-0.5 rounded-lg bg-[#0c0e12]"
        >
          <button
            type="button"
            aria-pressed={cameraMode === 'orbit'}
            aria-label="Orbit (Dollhouse)"
            onClick={() => onCameraModeChange('orbit')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
              cameraMode === 'orbit'
                ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                : 'text-[#aeb5c2] hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sm:hidden">Orbit</span>
            <span className="hidden sm:inline">Orbit (Dollhouse)</span>
          </button>

          <button
            type="button"
            aria-pressed={cameraMode === 'walk'}
            aria-label="Walk Inside"
            onClick={() => onCameraModeChange('walk')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
              cameraMode === 'walk'
                ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                : 'text-[#aeb5c2] hover:text-white'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sm:hidden">Walk</span>
            <span className="hidden sm:inline">Walk Inside</span>
          </button>
        </div>

        <div className="w-px h-5 bg-white/[0.1] mx-0.5 shrink-0" aria-hidden="true" />

        {/* Toggle Roof / Cutaway */}
        <button
          type="button"
          aria-pressed={!showRoof}
          aria-label={showRoof ? 'Cutaway Roof' : 'Show Roof'}
          onClick={onToggleRoof}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            !showRoof
              ? 'bg-white/[0.12] text-white border border-white/[0.18]'
              : 'text-[#cbd5e1] hover:text-white hover:bg-white/[0.06] border border-transparent'
          }`}
        >
          {showRoof ? (
            <EyeOff className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          )}
          <span className="sm:hidden">{showRoof ? 'Roof' : 'Roof'}</span>
          <span className="hidden sm:inline">{showRoof ? 'Cutaway Roof' : 'Show Roof'}</span>
        </button>

        {/* Reset View */}
        <button
          type="button"
          aria-label="Reset View"
          onClick={onResetView}
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-[#cbd5e1] hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
          <span className="hidden sm:inline">Reset View</span>
        </button>
      </div>

      {/* Right balancer spacer to keep toolbar visually centered on desktop */}
      <div className="hidden md:block w-20 shrink-0" aria-hidden="true" />
    </div>
  );
}
