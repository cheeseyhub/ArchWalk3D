import { type FormEvent } from 'react';
import {
  Armchair,
  Check,
  Database,
  Loader2,
  MapPin,
  RotateCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { BlueprintFurniture, GeneratedFurnitureAsset } from '../arch/types';

interface FurniturePanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  errorMessage: string | null;
  onGenerateFurniture: () => void;
  generatedCatalog: GeneratedFurnitureAsset[];
  starterCatalog: GeneratedFurnitureAsset[];
  placingAssetId: string | null;
  onTogglePlaceAsset: (asset: GeneratedFurnitureAsset) => void;
  onDeleteCatalogAsset: (assetId: string) => void;
  placedFurniture: BlueprintFurniture[];
  onRotatePlacedItem: (index: number) => void;
  onRemovePlacedItem: (index: number) => void;
  user: User | null;
  isSyncingFurniture: boolean;
}

const FURNITURE_LABEL: Record<string, string> = {
  sofa: 'Sofa',
  bed: 'Bed',
  table: 'Table',
  chair: 'Chair',
  desk: 'Desk',
  counter: 'Counter',
  toilet: 'Toilet',
  sink: 'Sink',
  plant: 'Plant',
  tv_stand: 'TV Console',
  custom: 'Custom',
};

export function FurniturePanel({
  prompt,
  onPromptChange,
  isGenerating,
  errorMessage,
  onGenerateFurniture,
  generatedCatalog,
  starterCatalog,
  placingAssetId,
  onTogglePlaceAsset,
  onDeleteCatalogAsset,
  placedFurniture,
  onRotatePlacedItem,
  onRemovePlacedItem,
  user,
  isSyncingFurniture,
}: FurniturePanelProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isGenerating) {
      onGenerateFurniture();
    }
  };

  return (
    <div className="space-y-6 pb-2">
      {/* 1. Prompt Generator */}
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor="furniture-prompt-input" className="text-xs font-medium text-[#d1d5db]">
            Describe Furniture Set
          </label>
          <span className="text-[11px] text-[#7c8494]">Generates 3 pieces</span>
        </div>

        <textarea
          id="furniture-prompt-input"
          rows={3}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g., Japandi oak dining set, emerald velvet reading nook, or walnut studio desk setup"
          className="w-full rounded-lg bg-[#0e1116] border border-white/[0.09] px-3 py-2 text-sm text-[#eceef2] placeholder:text-[#666f7f] focus:outline-none focus:border-[#d99b4e]/70 resize-none"
        />

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg bg-red-950/60 border border-red-500/35 px-3 py-2 text-xs text-red-200 leading-relaxed"
          >
            {errorMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d99b4e] hover:bg-[#e3a85d] disabled:opacity-70 disabled:cursor-not-allowed text-[#111318] text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Designing 3 Furniture Pieces...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Generate 3 Furniture Pieces</span>
            </>
          )}
        </button>
      </form>

      <hr className="border-white/[0.08]" />

      {/* 2. Saved Generated Furniture Catalog */}
      <section aria-labelledby="generated-furniture-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Database className="w-3.5 h-3.5 text-[#e2a960] shrink-0" aria-hidden="true" />
            <h2
              id="generated-furniture-heading"
              className="text-xs font-medium text-[#d1d5db] truncate"
            >
              Your Generated Furniture
            </h2>
          </div>
          {isSyncingFurniture ? (
            <span className="flex items-center gap-1 text-[11px] text-[#e2a960] shrink-0">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              <span>Saving...</span>
            </span>
          ) : user ? (
            <span className="flex items-center gap-1 text-[11px] text-[#8a93a4] shrink-0">
              <Check className="w-3 h-3 text-[#e2a960]" aria-hidden="true" />
              <span>Database</span>
            </span>
          ) : (
            <span className="text-[11px] text-[#7c8494] shrink-0">Local cache</span>
          )}
        </div>

        {generatedCatalog.length === 0 ? (
          <p className="text-xs text-[#7c8494] leading-relaxed">
            Prompt any style above to generate 3 custom 3D pieces. Generated furniture is saved
            automatically so you never have to regenerate it on reload.
          </p>
        ) : (
          <div className="space-y-2" role="list" aria-label="Generated furniture library">
            {generatedCatalog.map((asset) => {
              const isPlacing = placingAssetId === asset.id;
              return (
                <div
                  key={asset.id}
                  role="listitem"
                  className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
                    isPlacing
                      ? 'bg-[#d99b4e]/15 border-[#d99b4e]/60'
                      : 'bg-[#0e1116] border-white/[0.07] hover:border-white/[0.15]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-white/25 shrink-0"
                          style={{ backgroundColor: asset.color }}
                          aria-hidden="true"
                        />
                        <p className="text-xs font-semibold text-[#f3f4f6] truncate">
                          {asset.name}
                        </p>
                      </div>
                      {asset.description && (
                        <p className="text-[11px] text-[#9ca3af] leading-snug line-clamp-2">
                          {asset.description}
                        </p>
                      )}
                      <p className="text-[11px] text-[#7c8494] font-[family-name:var(--font-mono)] tabular-nums">
                        {asset.width.toFixed(1)} × {asset.depth.toFixed(1)} ×{' '}
                        {asset.height.toFixed(1)} m · {asset.parts.length} parts
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteCatalogAsset(asset.id)}
                      aria-label={`Delete furniture ${asset.name}`}
                      className="p-1.5 rounded-md text-[#7c8494] hover:text-red-400 hover:bg-white/[0.06] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onTogglePlaceAsset(asset)}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
                      isPlacing
                        ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                        : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#e5e7eb]'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isPlacing ? 'Placing — Click Floor' : 'Place in Room'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <hr className="border-white/[0.08]" />

      {/* 3. Starter Studio Pieces */}
      <section aria-labelledby="starter-furniture-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 id="starter-furniture-heading" className="text-xs font-medium text-[#d1d5db]">
            Studio Starter Pieces
          </h2>
          <span className="text-[11px] text-[#7c8494]">Ready to place</span>
        </div>

        <div className="space-y-1.5" role="list" aria-label="Starter studio furniture">
          {starterCatalog.map((asset) => {
            const isPlacing = placingAssetId === asset.id;
            return (
              <div
                key={asset.id}
                role="listitem"
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  isPlacing
                    ? 'bg-[#d99b4e]/15 border-[#d99b4e]/60'
                    : 'bg-[#0e1116] border-white/[0.06] hover:border-white/[0.14]'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm border border-white/25 shrink-0"
                      style={{ backgroundColor: asset.color }}
                      aria-hidden="true"
                    />
                    <p className="text-xs font-medium text-[#eceef2] truncate">{asset.name}</p>
                  </div>
                  <p className="text-[11px] text-[#7c8494] font-[family-name:var(--font-mono)] tabular-nums">
                    {asset.width.toFixed(1)} × {asset.depth.toFixed(1)} m
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePlaceAsset(asset)}
                  aria-label={`${isPlacing ? 'Stop placing' : 'Place'} ${asset.name}`}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
                    isPlacing
                      ? 'bg-[#d99b4e] text-[#111318] font-semibold'
                      : 'bg-white/[0.07] hover:bg-white/[0.14] text-[#e5e7eb]'
                  }`}
                >
                  {isPlacing ? 'Placing' : 'Place'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <hr className="border-white/[0.08]" />

      {/* 4. Placed Furniture in Active Building */}
      <section aria-labelledby="placed-furniture-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Armchair className="w-3.5 h-3.5 text-[#9ca3af]" aria-hidden="true" />
            <h2 id="placed-furniture-heading" className="text-xs font-medium text-[#d1d5db]">
              Placed in House
            </h2>
          </div>
          <span className="text-[11px] text-[#8a93a4] font-[family-name:var(--font-mono)] tabular-nums">
            {placedFurniture.length} items
          </span>
        </div>

        {placedFurniture.length === 0 ? (
          <p className="text-xs text-[#7c8494]">No furniture placed yet.</p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5" role="list" aria-label="Placed furniture items">
            {[...placedFurniture]
              .map((item, idx) => ({ item, idx }))
              .reverse()
              .map(({ item, idx }) => {
                const label = item.name || FURNITURE_LABEL[item.type] || item.type;
                return (
                  <div
                    key={item.id ?? `${item.type}-${idx}`}
                    role="listitem"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#0e1116] border border-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#dce0e8] truncate">{label}</p>
                      <p className="text-[11px] text-[#7c8494] font-[family-name:var(--font-mono)] tabular-nums">
                        ({item.x.toFixed(1)}, {item.z.toFixed(1)}) m
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRotatePlacedItem(idx)}
                        aria-label={`Rotate ${label}`}
                        className="p-1.5 rounded text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemovePlacedItem(idx)}
                        aria-label={`Remove ${label}`}
                        className="p-1.5 rounded text-[#9ca3af] hover:text-red-400 hover:bg-white/[0.08] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
