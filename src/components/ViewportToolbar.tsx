import {
  Check,
  Download,
  Eye,
  EyeOff,
  Footprints,
  Globe,
  Loader2,
  Moon,
  Move,
  PanelLeftOpen,
  Redo2,
  RotateCcw,
  Sparkles,
  Sun,
  Sunset,
  Undo2,
  Zap,
} from 'lucide-react';
import type { CameraMode, LightingPreset, RenderQuality } from '../arch/types';
import { LIGHTING_PRESETS, LIGHTING_PRESET_ORDER } from '../three/lightingPresets';

interface ViewportToolbarProps {
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  arrangeMode: boolean;
  onToggleArrangeMode: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  lightingPreset: LightingPreset;
  onLightingPresetChange: (preset: LightingPreset) => void;
  renderQuality: RenderQuality;
  onToggleRenderQuality: () => void;
  showRoof: boolean;
  onToggleRoof: () => void;
  onResetView: () => void;
  onExportGltf: () => void;
  isExportingGltf?: boolean;
  exportSuccess?: boolean;
}

function LightingIcon({ preset, active }: { preset: LightingPreset; active: boolean }) {
  const cls = `w-3.5 h-3.5 ${active ? 'text-[#111318]' : 'text-[#9ca3af]'}`;
  if (preset === 'daylight') return <Sun className={cls} aria-hidden="true" />;
  if (preset === 'golden_hour') return <Sunset className={cls} aria-hidden="true" />;
  return <Moon className={cls} aria-hidden="true" />;
}

export function ViewportToolbar({
  sidebarOpen,
  onOpenSidebar,
  cameraMode,
  onCameraModeChange,
  arrangeMode,
  onToggleArrangeMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  lightingPreset,
  onLightingPresetChange,
  renderQuality,
  onToggleRenderQuality,
  showRoof,
  onToggleRoof,
  onResetView,
  onExportGltf,
  isExportingGltf = false,
  exportSuccess = false,
}: ViewportToolbarProps) {
  const isHighQuality = renderQuality === 'high';

  return (
    <div className="pointer-events-none absolute top-3 sm:top-4 inset-x-3 sm:inset-x-4 z-20 flex items-start sm:items-center justify-between gap-2 sm:gap-3">
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
        className="pointer-events-auto flex flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-xl bg-[#13161c]/95 border border-white/[0.12] shadow-xl max-w-full"
      >
        {/* Camera Mode Segmented Toggle */}
        <div
          role="group"
          aria-label="Camera mode"
          className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0c0e12]"
        >
          <button
            type="button"
            aria-pressed={cameraMode === 'orbit'}
            aria-label="Orbit (Dollhouse)"
            onClick={() => onCameraModeChange('orbit')}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
              cameraMode === 'orbit'
                ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                : 'text-[#aeb5c2] hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="2xl:hidden">Orbit</span>
            <span className="hidden 2xl:inline">Orbit (Dollhouse)</span>
          </button>

          <button
            type="button"
            aria-pressed={cameraMode === 'walk'}
            aria-label="Walk Inside"
            onClick={() => onCameraModeChange('walk')}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
              cameraMode === 'walk'
                ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                : 'text-[#aeb5c2] hover:text-white'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="2xl:hidden">Walk</span>
            <span className="hidden 2xl:inline">Walk Inside</span>
          </button>
        </div>

        {/* Arrange Furniture Toggle (Orbit Mode Direct Manipulation) */}
        <button
          type="button"
          aria-pressed={arrangeMode}
          aria-label="Arrange Furniture"
          title="Select, drag, rotate, resize, recolor, or add furniture in Orbit Mode"
          onClick={onToggleArrangeMode}
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            arrangeMode
              ? 'bg-[#d99b4e] text-[#111318] font-semibold border border-[#f2c67c]'
              : 'text-[#eceef2] hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
          }`}
        >
          <Move
            className={`w-3.5 h-3.5 ${arrangeMode ? 'text-[#111318]' : 'text-[#e2a960]'}`}
            aria-hidden="true"
          />
          <span className="xl:hidden">Arrange</span>
          <span className="hidden xl:inline">Arrange Furniture</span>
        </button>

        {/* Undo / Redo Blueprint History Controls */}
        <div
          role="group"
          aria-label="History controls"
          className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0c0e12]"
        >
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded-md text-[#cbd5e1] hover:text-white hover:bg-white/[0.08] disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className="p-1.5 rounded-md text-[#cbd5e1] hover:text-white hover:bg-white/[0.08] disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
          >
            <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="hidden sm:block w-px h-5 bg-white/[0.1] mx-0.5 shrink-0" aria-hidden="true" />

        {/* Lighting Preset Segmented Control: Daylight / Golden Hour / Night */}
        <div
          role="group"
          aria-label="Lighting preset"
          className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0c0e12]"
        >
          {LIGHTING_PRESET_ORDER.map((presetId) => {
            const cfg = LIGHTING_PRESETS[presetId];
            const active = lightingPreset === presetId;
            return (
              <button
                key={presetId}
                type="button"
                aria-pressed={active}
                aria-label={`${cfg.label} lighting`}
                title={cfg.label}
                onClick={() => onLightingPresetChange(presetId)}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
                  active
                    ? 'bg-[#e6c592] text-[#111318] font-semibold'
                    : 'text-[#aeb5c2] hover:text-white'
                }`}
              >
                <LightingIcon preset={presetId} active={active} />
                <span className="hidden lg:inline 2xl:hidden">{cfg.shortLabel}</span>
                <span className="hidden 2xl:inline">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden sm:block w-px h-5 bg-white/[0.1] mx-0.5 shrink-0" aria-hidden="true" />

        {/* Render Quality Toggle: High (AO + Soft PCF) / Fast */}
        <button
          type="button"
          aria-pressed={isHighQuality}
          aria-label={`Quality: ${isHighQuality ? 'High' : 'Fast'}`}
          title={
            isHighQuality
              ? 'High quality: Ambient occlusion contact shadows & soft shadows'
              : 'Fast mode: Post-processing disabled for smooth frame rates'
          }
          onClick={onToggleRenderQuality}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            isHighQuality
              ? 'bg-white/[0.11] text-[#f3d4a8] border border-[#d99b4e]/35'
              : 'text-[#cbd5e1] hover:text-white hover:bg-white/[0.06] border border-white/[0.08]'
          }`}
        >
          {isHighQuality ? (
            <Sparkles className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          ) : (
            <Zap className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
          )}
          <span className="xl:hidden">{isHighQuality ? 'High' : 'Fast'}</span>
          <span className="hidden xl:inline">
            Quality: {isHighQuality ? 'High' : 'Fast'}
          </span>
        </button>

        {/* Toggle Roof / Cutaway */}
        <button
          type="button"
          aria-pressed={!showRoof}
          aria-label={showRoof ? 'Cutaway Roof' : 'Show Roof'}
          onClick={onToggleRoof}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
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
          <span className="xl:hidden">Roof</span>
          <span className="hidden xl:inline">{showRoof ? 'Cutaway Roof' : 'Show Roof'}</span>
        </button>

        {/* Reset View */}
        <button
          type="button"
          aria-label="Reset View"
          title="Reset View"
          onClick={onResetView}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium text-[#cbd5e1] hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
          <span className="hidden 2xl:inline">Reset</span>
        </button>

        <div className="hidden sm:block w-px h-5 bg-white/[0.1] mx-0.5 shrink-0" aria-hidden="true" />

        {/* Export to GLTF */}
        <button
          type="button"
          aria-label="Export to GLTF"
          onClick={onExportGltf}
          disabled={isExportingGltf}
          className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            exportSuccess
              ? 'bg-[#d99b4e]/20 text-[#f3d4a8] border border-[#d99b4e]/45'
              : 'text-[#eceef2] hover:text-white hover:bg-white/[0.08] border border-transparent'
          }`}
        >
          {isExportingGltf ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e2a960]" aria-hidden="true" />
          ) : exportSuccess ? (
            <Check className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          ) : (
            <Download className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          )}
          <span className="lg:hidden">{isExportingGltf ? '...' : 'GLTF'}</span>
          <span className="hidden lg:inline">
            {isExportingGltf ? 'Exporting...' : exportSuccess ? 'Exported GLTF' : 'Export to GLTF'}
          </span>
        </button>
      </div>

      {/* Right balancer spacer to keep toolbar visually centered on desktop */}
      <div className="hidden 2xl:block w-12 shrink-0" aria-hidden="true" />
    </div>
  );
}
