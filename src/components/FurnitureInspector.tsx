import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Minus,
  Move,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  FURNITURE_COLOR_SWATCHES,
  getFurnitureDisplayLabel,
} from '../arch/blueprintHistory';
import type { BlueprintFurniture } from '../arch/types';
import type { FurniturePreviewPatch } from './ArchViewport';

interface FurnitureInspectorProps {
  item: BlueprintFurniture;
  index: number;
  onRotate: (deltaRadians: number) => void;
  onSetRotation: (radians: number) => void;
  onResize: (width: number, depth: number, height: number) => void;
  onRecolor: (hexColor: string) => void;
  onPreviewEdit: (patch: FurniturePreviewPatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function normalizeDegrees(radians: number): number {
  const deg = Math.round(((radians * 180) / Math.PI) % 360);
  return (deg + 360) % 360;
}

function clampDim(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
}

export function FurnitureInspector({
  item,
  index,
  onRotate,
  onSetRotation,
  onResize,
  onRecolor,
  onPreviewEdit,
  onDuplicate,
  onDelete,
  onClose,
}: FurnitureInspectorProps) {
  const [draftAngleDeg, setDraftAngleDeg] = useState(() => normalizeDegrees(item.rotationY));
  const [draftWidth, setDraftWidth] = useState(item.width);
  const [draftDepth, setDraftDepth] = useState(item.depth);
  const [draftHeight, setDraftHeight] = useState(item.height);
  const [draftColor, setDraftColor] = useState(
    /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color.toLowerCase() : '#9c7148',
  );

  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const latestColorRef = useRef(draftColor);
  latestColorRef.current = draftColor;

  const minHeight = item.type === 'rug' ? 0.02 : 0.15;
  const maxHeight = item.type === 'rug' ? 0.12 : 2.8;
  const heightStep = item.type === 'rug' ? 0.01 : 0.05;

  // Sync draft controls whenever selection or Undo/Redo updates the item
  useEffect(() => {
    setDraftAngleDeg(normalizeDegrees(item.rotationY));
    setDraftWidth(item.width);
    setDraftDepth(item.depth);
    setDraftHeight(item.height);
    const validHex = /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color.toLowerCase() : '#9c7148';
    setDraftColor(validHex);
  }, [index, item.rotationY, item.width, item.depth, item.height, item.color]);

  // Commit custom <input type="color"> once on native change event (picker confirm/close)
  useEffect(() => {
    const el = colorInputRef.current;
    if (!el) return;
    const onNativeColorCommit = () => {
      const next = el.value.toLowerCase();
      if (next !== item.color.toLowerCase()) {
        onRecolor(next);
      }
    };
    el.addEventListener('change', onNativeColorCommit);
    return () => el.removeEventListener('change', onNativeColorCommit);
  }, [item.color, onRecolor]);

  const label = getFurnitureDisplayLabel(item);
  const displayAngle = ((Math.round(draftAngleDeg) % 360) + 360) % 360;

  const commitSliderRotation = (deg: number) => {
    const nextRad = (deg * Math.PI) / 180;
    const currentNorm = normalizeDegrees(item.rotationY);
    const nextNorm = ((Math.round(deg) % 360) + 360) % 360;
    if (nextNorm !== currentNorm) {
      onSetRotation(nextRad);
    }
  };

  const commitSliderResize = (nextW: number, nextD: number, nextH: number) => {
    if (
      Math.abs(nextW - item.width) > 0.005 ||
      Math.abs(nextD - item.depth) > 0.005 ||
      Math.abs(nextH - item.height) > 0.005
    ) {
      onResize(nextW, nextD, nextH);
    }
  };

  const stepWidth = (delta: number) => {
    const next = clampDim(item.width + delta, 0.3, 4.5);
    setDraftWidth(next);
    onResize(next, item.depth, item.height);
  };

  const stepDepth = (delta: number) => {
    const next = clampDim(item.depth + delta, 0.3, 4.0);
    setDraftDepth(next);
    onResize(item.width, next, item.height);
  };

  const stepHeight = (delta: number) => {
    const next = clampDim(item.height + delta, minHeight, maxHeight);
    setDraftHeight(next);
    onResize(item.width, item.depth, next);
  };

  return (
    <aside
      aria-label="Furniture Inspector"
      data-testid="furniture-inspector"
      className="absolute bottom-4 right-3 sm:bottom-5 sm:right-4 z-20 w-[292px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl bg-[#13161c]/95 border border-white/[0.14] shadow-2xl text-[#eceef2]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08] bg-[#181c24] sticky top-0 z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5 text-[#e2a960] shrink-0" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-white truncate">{label}</h3>
          </div>
          <p className="text-[11px] text-[#9ca3af] mt-0.5">
            Drag to move ·{' '}
            <kbd className="font-[family-name:var(--font-mono)] text-[#d1d5db]">R</kbd>/
            <kbd className="font-[family-name:var(--font-mono)] text-[#d1d5db]">Shift+R</kbd> ·{' '}
            <kbd className="font-[family-name:var(--font-mono)] text-[#d1d5db]">ESC</kbd>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Deselect furniture"
          className="p-1 rounded-md text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="p-3.5 space-y-3">
        {/* Rotation controls: live 0-360 slider + quick -45 / +45 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium uppercase tracking-wider text-[#9ca3af]">Rotation</span>
            <span
              data-testid="inspector-angle"
              className="font-[family-name:var(--font-mono)] text-[#f3d4a8]"
            >
              {displayAngle}°
            </span>
          </div>
          <input
            type="range"
            aria-label="Furniture rotation"
            min={0}
            max={360}
            step={1}
            value={Math.min(360, Math.max(0, Math.round(draftAngleDeg)))}
            onChange={(e) => {
              const deg = Number(e.target.value);
              setDraftAngleDeg(deg);
              onPreviewEdit({ rotationY: (deg * Math.PI) / 180 });
            }}
            onPointerUp={() => commitSliderRotation(draftAngleDeg)}
            onKeyUp={() => commitSliderRotation(draftAngleDeg)}
            onBlur={() => commitSliderRotation(draftAngleDeg)}
            className="w-full h-1.5 rounded-lg appearance-none bg-white/[0.12] accent-[#d99b4e] cursor-pointer"
          />
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => onRotate(-Math.PI / 4)}
              aria-label="Rotate -45 degrees"
              title="Rotate -45° (Shift+R)"
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0c0e12] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-[#eceef2] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
              <span>-45°</span>
            </button>
            <button
              type="button"
              onClick={() => onRotate(Math.PI / 4)}
              aria-label="Rotate +45 degrees"
              title="Rotate +45° (R)"
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0c0e12] hover:bg-white/[0.08] border border-white/[0.1] text-xs font-medium text-[#eceef2] transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
              <span>+45°</span>
            </button>
          </div>
        </div>

        {/* Width, Depth & Height Live Resize Controls */}
        <div className="space-y-2">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-[#9ca3af]">
            Dimensions
          </span>

          {/* Width */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#cbd5e1]">Width</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepWidth(-0.1)}
                  aria-label="Decrease width"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Minus className="w-3 h-3" aria-hidden="true" />
                </button>
                <span
                  data-testid="inspector-width"
                  className="w-11 text-center font-[family-name:var(--font-mono)] text-[#eceef2]"
                >
                  {draftWidth.toFixed(2)}m
                </span>
                <button
                  type="button"
                  onClick={() => stepWidth(0.1)}
                  aria-label="Increase width"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            </div>
            <input
              type="range"
              aria-label="Furniture width"
              min={0.3}
              max={4.5}
              step={0.05}
              value={clampDim(draftWidth, 0.3, 4.5)}
              onChange={(e) => {
                const nextW = Number(e.target.value);
                setDraftWidth(nextW);
                onPreviewEdit({ width: nextW, depth: draftDepth, height: draftHeight });
              }}
              onPointerUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onKeyUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onBlur={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              className="w-full h-1.5 rounded-lg appearance-none bg-white/[0.12] accent-[#d99b4e] cursor-pointer"
            />
          </div>

          {/* Depth */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#cbd5e1]">Depth</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepDepth(-0.1)}
                  aria-label="Decrease depth"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Minus className="w-3 h-3" aria-hidden="true" />
                </button>
                <span
                  data-testid="inspector-depth"
                  className="w-11 text-center font-[family-name:var(--font-mono)] text-[#eceef2]"
                >
                  {draftDepth.toFixed(2)}m
                </span>
                <button
                  type="button"
                  onClick={() => stepDepth(0.1)}
                  aria-label="Increase depth"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            </div>
            <input
              type="range"
              aria-label="Furniture depth"
              min={0.3}
              max={4.0}
              step={0.05}
              value={clampDim(draftDepth, 0.3, 4.0)}
              onChange={(e) => {
                const nextD = Number(e.target.value);
                setDraftDepth(nextD);
                onPreviewEdit({ width: draftWidth, depth: nextD, height: draftHeight });
              }}
              onPointerUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onKeyUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onBlur={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              className="w-full h-1.5 rounded-lg appearance-none bg-white/[0.12] accent-[#d99b4e] cursor-pointer"
            />
          </div>

          {/* Height */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#cbd5e1]">Height</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepHeight(-heightStep * 2)}
                  aria-label="Decrease height"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Minus className="w-3 h-3" aria-hidden="true" />
                </button>
                <span
                  data-testid="inspector-height"
                  className="w-11 text-center font-[family-name:var(--font-mono)] text-[#eceef2]"
                >
                  {draftHeight.toFixed(2)}m
                </span>
                <button
                  type="button"
                  onClick={() => stepHeight(heightStep * 2)}
                  aria-label="Increase height"
                  className="p-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[#cbd5e1]"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                </button>
              </div>
            </div>
            <input
              type="range"
              aria-label="Furniture height"
              min={minHeight}
              max={maxHeight}
              step={heightStep}
              value={clampDim(draftHeight, minHeight, maxHeight)}
              onChange={(e) => {
                const nextH = Number(e.target.value);
                setDraftHeight(nextH);
                onPreviewEdit({ width: draftWidth, depth: draftDepth, height: nextH });
              }}
              onPointerUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onKeyUp={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              onBlur={() => commitSliderResize(draftWidth, draftDepth, draftHeight)}
              className="w-full h-1.5 rounded-lg appearance-none bg-white/[0.12] accent-[#d99b4e] cursor-pointer"
            />
          </div>
        </div>

        {/* Color Swatches + Custom Color Picker */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium uppercase tracking-wider text-[#9ca3af]">Finish</span>
            <span className="font-[family-name:var(--font-mono)] text-[#9ca3af]">
              {draftColor}
            </span>
          </div>
          <div className="grid grid-cols-9 gap-1.5 items-center">
            {FURNITURE_COLOR_SWATCHES.map((swatch) => {
              const selected = draftColor === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={`Color ${swatch.label}`}
                  onClick={() => {
                    setDraftColor(swatch.hex.toLowerCase());
                    onRecolor(swatch.hex);
                  }}
                  style={{ backgroundColor: swatch.hex }}
                  className={`w-6 h-6 rounded-md border transition-transform ${
                    selected
                      ? 'border-[#f5c77e] ring-2 ring-[#d99b4e]/60 scale-110'
                      : 'border-white/25 hover:scale-105'
                  }`}
                />
              );
            })}
            <label
              title="Custom color"
              className="relative w-6 h-6 rounded-md border border-dashed border-white/35 overflow-hidden cursor-pointer flex items-center justify-center bg-[#0c0e12] hover:border-[#e2a960]"
            >
              <span className="text-[10px] font-bold text-[#e2a960]">+</span>
              <input
                ref={colorInputRef}
                type="color"
                aria-label="Custom furniture color"
                value={draftColor}
                onChange={(e) => {
                  const nextHex = e.target.value.toLowerCase();
                  setDraftColor(nextHex);
                  onPreviewEdit({ color: nextHex });
                }}
                onBlur={() => {
                  if (latestColorRef.current !== item.color.toLowerCase()) {
                    onRecolor(latestColorRef.current);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Duplicate & Delete Actions */}
        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-[#eceef2] transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/12 hover:bg-red-500/22 border border-red-400/25 text-xs font-medium text-red-200 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-300" aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
