import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import {
  Armchair,
  Building2,
  Check,
  Cloud,
  Compass,
  Database,
  DoorOpen,
  Home,
  ImagePlus,
  LayoutGrid,
  Loader2,
  LogOut,
  PanelLeftClose,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { getBlueprintAreaSqMeters } from '../arch/blueprint';
import type {
  GeneratedFurnitureAsset,
  InputMode,
  SpatialBlueprint,
} from '../arch/types';
import type { SavedBlueprintRecord } from '../firebase/blueprints';
import { FurniturePanel } from './FurniturePanel';

export type SidebarTab = 'building' | 'furniture';

interface StudioSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  imagePreviewUrl: string | null;
  imageFileName: string | null;
  onImageSelect: (file: File) => void;
  onImageClear: () => void;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  isGenerating: boolean;
  generatingElapsedMs: number;
  errorMessage: string | null;
  onGenerate: () => void;
  onLoadDemo: () => void;
  blueprint: SpatialBlueprint;
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  // Auth & Database Persistence
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  savedModels: SavedBlueprintRecord[];
  activeSavedId: string | null;
  isSavingToDb: boolean;
  canSaveCurrentToDb: boolean;
  onSaveCurrentToDb: () => void;
  onSelectSavedModel: (record: SavedBlueprintRecord) => void;
  onDeleteSavedModel: (id: string) => void;
  // Furniture Studio
  furniturePrompt: string;
  onFurniturePromptChange: (value: string) => void;
  isGeneratingFurniture: boolean;
  furnitureError: string | null;
  onGenerateFurniture: () => void;
  generatedFurnitureCatalog: GeneratedFurnitureAsset[];
  starterFurnitureCatalog: GeneratedFurnitureAsset[];
  placingAssetId: string | null;
  onTogglePlaceAsset: (asset: GeneratedFurnitureAsset) => void;
  onDeleteCatalogAsset: (assetId: string) => void;
  onRotatePlacedItem: (index: number) => void;
  onRemovePlacedItem: (index: number) => void;
  isSyncingFurniture: boolean;
}

const INPUT_MODES: Array<{ id: InputMode; label: string; shortDesc: string }> = [
  { id: 'floor_plan', label: '2D Floor Plan', shortDesc: 'Trace walls & rooms' },
  { id: 'exterior', label: 'Building Exterior', shortDesc: 'Infer interior layout' },
  { id: 'single_room', label: 'Single Room Photo', shortDesc: 'Reconstruct room' },
];

const MODE_SHORT_LABEL: Record<InputMode, string> = {
  floor_plan: 'Floor Plan',
  exterior: 'Exterior',
  single_room: 'Single Room',
};

const FLOOR_MATERIAL_LABEL: Record<string, string> = {
  wood: 'Wood',
  tile: 'Tile',
  carpet: 'Carpet',
  concrete: 'Concrete',
};

function formatShortElapsed(ms: number): string {
  const secs = Math.floor(Math.max(0, ms) / 1000);
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function StudioSidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  imagePreviewUrl,
  imageFileName,
  onImageSelect,
  onImageClear,
  inputMode,
  onInputModeChange,
  prompt,
  onPromptChange,
  isGenerating,
  generatingElapsedMs,
  errorMessage,
  onGenerate,
  onLoadDemo,
  blueprint,
  activeRoomId,
  onSelectRoom,
  user,
  authReady,
  isSigningIn,
  onSignIn,
  onSignOut,
  savedModels,
  activeSavedId,
  isSavingToDb,
  canSaveCurrentToDb,
  onSaveCurrentToDb,
  onSelectSavedModel,
  onDeleteSavedModel,
  furniturePrompt,
  onFurniturePromptChange,
  isGeneratingFurniture,
  furnitureError,
  onGenerateFurniture,
  generatedFurnitureCatalog,
  starterFurnitureCatalog,
  placingAssetId,
  onTogglePlaceAsset,
  onDeleteCatalogAsset,
  onRotatePlacedItem,
  onRemovePlacedItem,
  isSyncingFurniture,
}: StudioSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const totalArea = Math.round(getBlueprintAreaSqMeters(blueprint));

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /^image\/(png|jpeg|webp)$/i.test(file.type)) {
      onImageSelect(file);
    }
  };

  return (
    <aside
      aria-label="Architectural Studio Controls"
      className={`fixed md:relative inset-y-0 left-0 z-30 flex flex-col bg-[#13161c] border-r border-white/[0.08] transition-transform duration-200 ease-out w-[320px] sm:w-[344px] shrink-0 h-full ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
      }`}
    >
      {/* Header Brand Row */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-[#d99b4e]/15 border border-[#d99b4e]/40 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-[#e2a960]" aria-hidden="true" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-[#f3f4f6] whitespace-nowrap">
            ArchWalk 3D
          </h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Collapse sidebar"
          className="p-2 -mr-1.5 rounded-md text-[#9ca3af] hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
        >
          <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Studio Section Tabs */}
      <div
        role="tablist"
        aria-label="Studio workspace sections"
        className="grid grid-cols-2 px-5 pt-3 pb-2 gap-1.5 border-b border-white/[0.08] shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'building'}
          onClick={() => onTabChange('building')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            activeTab === 'building'
              ? 'bg-[#1c212b] text-[#f3f4f6] border border-[#d99b4e]/50'
              : 'text-[#8a93a4] hover:text-[#e5e7eb] hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Building</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'furniture'}
          onClick={() => onTabChange('furniture')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
            activeTab === 'furniture'
              ? 'bg-[#1c212b] text-[#f3f4f6] border border-[#d99b4e]/50'
              : 'text-[#8a93a4] hover:text-[#e5e7eb] hover:bg-white/[0.04] border border-transparent'
          }`}
        >
          <Armchair className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Furniture</span>
        </button>
      </div>

      {/* Scrollable Controls Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {activeTab === 'furniture' ? (
          <FurniturePanel
            prompt={furniturePrompt}
            onPromptChange={onFurniturePromptChange}
            isGenerating={isGeneratingFurniture}
            errorMessage={furnitureError}
            onGenerateFurniture={onGenerateFurniture}
            generatedCatalog={generatedFurnitureCatalog}
            starterCatalog={starterFurnitureCatalog}
            placingAssetId={placingAssetId}
            onTogglePlaceAsset={onTogglePlaceAsset}
            onDeleteCatalogAsset={onDeleteCatalogAsset}
            placedFurniture={blueprint.furniture}
            onRotatePlacedItem={onRotatePlacedItem}
            onRemovePlacedItem={onRemovePlacedItem}
            user={user}
            isSyncingFurniture={isSyncingFurniture}
          />
        ) : (
          <>
        {/* 1. Architectural Image Dropzone */}
        <section aria-labelledby="upload-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span id="upload-heading" className="text-xs font-medium text-[#d1d5db]">
              Source Image
            </span>
            <span className="text-[11px] text-[#7c8494]">PNG, JPG, WEBP</span>
          </div>

          <input
            ref={fileInputRef}
            id="arch-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {imagePreviewUrl ? (
            <div className="relative rounded-lg overflow-hidden border border-white/[0.1] bg-[#0d0f13]">
              <img
                src={imagePreviewUrl}
                alt={
                  imageFileName
                    ? `Uploaded architectural image: ${imageFileName}`
                    : 'Uploaded architectural preview'
                }
                referrerPolicy="no-referrer"
                className="w-full h-36 object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#171b22] border-t border-white/[0.06]">
                <span className="text-xs text-[#cbd5e1] truncate">
                  {imageFileName ?? 'Uploaded image'}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-1 text-xs font-medium text-[#d1d5db] hover:text-white rounded hover:bg-white/[0.06] transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={onImageClear}
                    aria-label="Remove uploaded image"
                    className="p-1 text-[#9ca3af] hover:text-red-400 rounded hover:bg-white/[0.06] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-lg border border-dashed transition-colors ${
                isDragOver
                  ? 'border-[#d99b4e] bg-[#d99b4e]/10'
                  : 'border-white/[0.14] bg-[#0e1116] hover:border-white/[0.26]'
              }`}
            >
              <button
                type="button"
                aria-label="Upload architectural image"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-6 px-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] rounded-lg"
              >
                <ImagePlus className="w-6 h-6 text-[#9ca3af]" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[#e5e7eb]">
                    Upload architectural image
                  </p>
                  <p className="text-xs text-[#8a93a4]">
                    Drop a floor plan, exterior, or room photo
                  </p>
                </div>
              </button>
            </div>
          )}
        </section>

        {/* 2. Input Mode Selector */}
        <section aria-labelledby="mode-heading" className="space-y-2.5">
          <h2 id="mode-heading" className="text-xs font-medium text-[#d1d5db]">
            Input Mode
          </h2>
          <div
            role="radiogroup"
            aria-label="Architectural input mode"
            className="grid grid-cols-1 gap-1.5"
          >
            {INPUT_MODES.map((m) => {
              const active = inputMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onInputModeChange(m.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
                    active
                      ? 'bg-[#1c212b] border-[#d99b4e]/60 text-white'
                      : 'bg-[#0e1116] border-white/[0.07] text-[#9ca3af] hover:text-[#e5e7eb] hover:border-white/[0.14]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {m.id === 'floor_plan' && (
                      <LayoutGrid
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[#e2a960]' : 'text-[#6e7787]'}`}
                        aria-hidden="true"
                      />
                    )}
                    {m.id === 'exterior' && (
                      <Building2
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[#e2a960]' : 'text-[#6e7787]'}`}
                        aria-hidden="true"
                      />
                    )}
                    {m.id === 'single_room' && (
                      <DoorOpen
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[#e2a960]' : 'text-[#6e7787]'}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm font-medium whitespace-nowrap">{m.label}</span>
                  </span>
                  <span className="text-[11px] text-[#7c8494] whitespace-nowrap ml-2">
                    {m.shortDesc}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. Optional Design Notes */}
        <section className="space-y-2">
          <label htmlFor="design-notes-input" className="block text-xs font-medium text-[#d1d5db]">
            Design Notes <span className="text-[#7c8494] font-normal">(Optional)</span>
          </label>
          <textarea
            id="design-notes-input"
            rows={2}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="e.g., Make it a modern 2-bedroom layout with warm wood floors"
            className="w-full rounded-lg bg-[#0e1116] border border-white/[0.09] px-3 py-2 text-sm text-[#eceef2] placeholder:text-[#666f7f] focus:outline-none focus:border-[#d99b4e]/70 resize-none"
          />
        </section>

        {/* 4. Primary & Demo Actions */}
        <section className="space-y-2.5">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg bg-red-950/60 border border-red-500/35 px-3 py-2.5 text-xs text-red-200 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d99b4e] hover:bg-[#e3a85d] disabled:opacity-70 disabled:cursor-not-allowed text-[#111318] text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="font-[family-name:var(--font-mono)] tabular-nums">
                  Building... {formatShortElapsed(generatingElapsedMs)}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                <span>Generate 3D Model</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLoadDemo}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-[#dce0e8] text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
          >
            <Home className="w-4 h-4 text-[#9ca3af]" aria-hidden="true" />
            <span>Load Demo House</span>
          </button>
        </section>

        <hr className="border-white/[0.08]" />

        {/* 5. Saved Models (Database Persistence) */}
        <section aria-labelledby="saved-models-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Database className="w-3.5 h-3.5 text-[#e2a960] shrink-0" aria-hidden="true" />
              <h2 id="saved-models-heading" className="text-xs font-medium text-[#d1d5db]">
                Saved Models
              </h2>
            </div>

            {isSavingToDb ? (
              <span className="flex items-center gap-1 text-[11px] text-[#e2a960] shrink-0">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                <span>Saving...</span>
              </span>
            ) : activeSavedId ? (
              <span className="flex items-center gap-1 text-[11px] text-[#9ca3af] shrink-0">
                <Check className="w-3 h-3 text-[#e2a960]" aria-hidden="true" />
                <span>Saved</span>
              </span>
            ) : null}
          </div>

          <div className="space-y-2.5">

              {canSaveCurrentToDb && (
                <button
                  type="button"
                  onClick={onSaveCurrentToDb}
                  disabled={isSavingToDb}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#d99b4e]/15 hover:bg-[#d99b4e]/25 border border-[#d99b4e]/35 text-[#f3d4a8] text-xs font-medium transition-colors"
                >
                  <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Save Current House to Database</span>
                </button>
              )}

              {savedModels.length === 0 ? (
                <p className="text-xs text-[#7c8494] py-1">
                  Generated 3D buildings will automatically save here so reloads never lose your work.
                </p>
              ) : (
                <div className="space-y-1" role="list" aria-label="Saved architectural models">
                  {savedModels.map((record) => {
                    const isActive = activeSavedId === record.id;
                    return (
                      <div
                        key={record.id}
                        role="listitem"
                        className={`flex items-center gap-1 rounded-lg border transition-colors ${
                          isActive
                            ? 'bg-[#d99b4e]/15 border-[#d99b4e]/45'
                            : 'bg-[#0e1116] border-white/[0.06] hover:border-white/[0.14]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectSavedModel(record)}
                          className="flex-1 min-w-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] rounded-l-lg"
                        >
                          <p className="text-xs font-medium text-[#eceef2] truncate">
                            {record.name}
                          </p>
                          <p className="text-[11px] text-[#8a93a4] font-[family-name:var(--font-mono)] tabular-nums truncate">
                            {record.roomCount} {record.roomCount === 1 ? 'room' : 'rooms'} ·{' '}
                            {Math.round(record.areaSqMeters)} m² ·{' '}
                            {MODE_SHORT_LABEL[record.inputMode]}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSavedModel(record.id)}
                          aria-label={`Delete saved model ${record.name}`}
                          className="p-2 mr-1 rounded-md text-[#7c8494] hover:text-red-400 hover:bg-white/[0.06] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </section>

        <hr className="border-white/[0.08]" />

        {/* 6. Active Blueprint Rooms List */}
        <section aria-labelledby="rooms-heading" className="space-y-3 pb-2">
          <div className="space-y-1">
            <h2
              id="rooms-heading"
              className="font-[family-name:var(--font-display)] text-sm font-semibold text-[#f3f4f6]"
            >
              {blueprint.name}
            </h2>
            <p className="text-xs text-[#8a93a4] font-[family-name:var(--font-mono)] tabular-nums">
              {blueprint.rooms.length} {blueprint.rooms.length === 1 ? 'room' : 'rooms'} ·{' '}
              {totalArea} m² ·{' '}
              {blueprint.roof.style === 'gabled' ? 'Gabled roof' : 'Flat roof'}
            </p>
          </div>

          <div className="space-y-1" role="list" aria-label="Blueprint rooms">
            {blueprint.rooms.map((room) => {
              const isSelected = activeRoomId === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom(room.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e] ${
                    isSelected
                      ? 'bg-[#d99b4e]/15 text-white border border-[#d99b4e]/45'
                      : 'bg-transparent hover:bg-white/[0.05] text-[#d1d5db] border border-transparent'
                  }`}
                >
                  <span className="text-sm font-medium truncate pr-2">{room.name}</span>
                  <span className="text-xs text-[#8a93a4] font-[family-name:var(--font-mono)] tabular-nums whitespace-nowrap shrink-0">
                    {room.width.toFixed(1)} × {room.depth.toFixed(1)} m ·{' '}
                    {FLOOR_MATERIAL_LABEL[room.floorMaterial] ?? room.floorMaterial}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
          </>
        )}
      </div>

      {/* Persistent Google Account Footer */}
      {user && (
        <div className="px-5 py-3 border-t border-white/[0.08] bg-[#101318] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google profile'}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full border border-white/[0.15] object-cover shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#d99b4e]/20 border border-[#d99b4e]/45 flex items-center justify-center text-xs font-semibold text-[#e2a960] shrink-0">
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#eceef2] truncate">
                {user.displayName || 'Signed in'}
              </p>
              {user.email && (
                <p className="text-[11px] text-[#8a93a4] truncate">{user.email}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-[#cbd5e1] hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d99b4e]"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
