import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Sparkles } from 'lucide-react';
import {
  PROCEDURAL_FURNITURE_CATALOG,
  type ProceduralFurnitureCatalogEntry,
} from '../arch/blueprintHistory';
import type { FurnitureType } from '../arch/types';

interface AddFurniturePopoverProps {
  visible: boolean;
  hasSelection: boolean;
  onAddItem: (type: FurnitureType) => void;
  onExitArrange: () => void;
}

const GROUPS: readonly ProceduralFurnitureCatalogEntry['group'][] = [
  'Living',
  'Bedroom & Study',
  'Kitchen & Bath',
  'Lighting & Decor',
];

export function AddFurniturePopover({
  visible,
  hasSelection,
  onAddItem,
  onExitArrange,
}: AddFurniturePopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      data-testid="arrange-controls-bar"
      className="absolute top-[8.25rem] sm:top-[4.25rem] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 max-w-[calc(100vw-1.5rem)]"
    >
      {/* Compact Arrange Mode Action Strip */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#13161c]/95 border border-[#d99b4e]/40 shadow-xl">
        <span className="hidden sm:inline-block pl-2.5 pr-1 text-[11px] text-[#cbd5e1] whitespace-nowrap">
          {hasSelection ? 'Drag item on floor or edit below' : 'Click any furniture to select'}
        </span>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-label="Add Item"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#d99b4e] hover:bg-[#e2a960] text-[#111318] text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Item</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={onExitArrange}
          aria-label="Done arranging"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-[#eceef2] transition-colors whitespace-nowrap"
        >
          <Check className="w-3.5 h-3.5 text-[#e2a960]" aria-hidden="true" />
          <span>Done</span>
        </button>
      </div>

      {/* Add Item Catalog Popover */}
      {open && (
        <div
          role="dialog"
          aria-label="Add procedural furniture item"
          data-testid="add-furniture-popover"
          className="w-[310px] max-w-[calc(100vw-1.5rem)] max-h-[min(62vh,440px)] overflow-y-auto rounded-xl bg-[#13161c]/98 border border-white/[0.14] shadow-2xl p-3 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <div>
              <h3 className="text-xs font-semibold text-white">Add Procedural Furniture</h3>
              <p className="text-[11px] text-[#9ca3af]">
                Spawns at the center of your current view
              </p>
            </div>
          </div>

          {GROUPS.map((groupName) => {
            const entries = PROCEDURAL_FURNITURE_CATALOG.filter((e) => e.group === groupName);
            return (
              <div key={groupName} className="space-y-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af]">
                  {groupName}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {entries.map((entry) => (
                    <button
                      key={entry.type}
                      type="button"
                      onClick={() => {
                        onAddItem(entry.type);
                        setOpen(false);
                      }}
                      className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg bg-[#0d1016] hover:bg-white/[0.09] border border-white/[0.08] hover:border-[#d99b4e]/50 text-left transition-colors"
                    >
                      <div className="flex items-center gap-1.5 w-full min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/25"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-xs font-medium text-[#eceef2] truncate">
                          {entry.label}
                        </span>
                      </div>
                      {entry.interactiveHint ? (
                        <span className="flex items-center gap-1 text-[10px] text-[#e2a960]">
                          <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
                          {entry.interactiveHint}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#7c8594] font-[family-name:var(--font-mono)]">
                          {entry.width.toFixed(1)}×{entry.depth.toFixed(1)}m
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
