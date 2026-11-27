export const GRID_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;
export const GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface CoordinateGridLayout {
  canvasWidth: number;
  canvasHeight: number;
  marginLeft: number;
  marginTop: number;
  imageWidth: number;
  imageHeight: number;
  cellWidth: number;
  cellHeight: number;
  colCenters: Array<{ label: string; x: number }>;
  rowCenters: Array<{ label: string; y: number }>;
  verticalLines: number[];
  horizontalLines: number[];
}

/**
 * Pure layout calculator for the 10x10 (A-J x 1-10) architectural reference grid.
 * Adds clean top/left ruler margins so coordinate labels never obscure image walls or text.
 */
export function computeCoordinateGridLayout(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension = 1800,
): CoordinateGridLayout {
  const safeW = Math.max(64, Math.round(sourceWidth));
  const safeH = Math.max(64, Math.round(sourceHeight));
  const scale = Math.min(1, maxDimension / Math.max(safeW, safeH));
  const imageWidth = Math.max(64, Math.round(safeW * scale));
  const imageHeight = Math.max(64, Math.round(safeH * scale));

  const marginLeft = Math.max(26, Math.round(Math.min(imageWidth, imageHeight) * 0.036));
  const marginTop = marginLeft;
  const canvasWidth = imageWidth + marginLeft;
  const canvasHeight = imageHeight + marginTop;

  const cellWidth = imageWidth / GRID_COLS.length;
  const cellHeight = imageHeight / GRID_ROWS.length;

  const verticalLines: number[] = [];
  for (let i = 0; i <= GRID_COLS.length; i++) {
    verticalLines.push(marginLeft + i * cellWidth);
  }

  const horizontalLines: number[] = [];
  for (let j = 0; j <= GRID_ROWS.length; j++) {
    horizontalLines.push(marginTop + j * cellHeight);
  }

  const colCenters = GRID_COLS.map((label, i) => ({
    label,
    x: marginLeft + (i + 0.5) * cellWidth,
  }));

  const rowCenters = GRID_ROWS.map((row, j) => ({
    label: String(row),
    y: marginTop + (j + 0.5) * cellHeight,
  }));

  return {
    canvasWidth,
    canvasHeight,
    marginLeft,
    marginTop,
    imageWidth,
    imageHeight,
    cellWidth,
    cellHeight,
    colCenters,
    rowCenters,
    verticalLines,
    horizontalLines,
  };
}

function readRawFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Could not read uploaded image file.'));
        return;
      }
      resolve({
        base64: result.slice(commaIdx + 1),
        mimeType: file.type || 'image/png',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode uploaded image for grid pre-processing.'));
    };
    img.src = url;
  });
}

/**
 * Draws an uploaded architectural image onto an offscreen HTML5 Canvas with a faint,
 * numbered 10x10 coordinate grid (A-J horizontally, 1-10 vertically) overlaid on top.
 * Keeps the user's clean original preview untouched while giving Gemini precise alignment cues.
 */
export async function createGriddedImageBase64(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  if (typeof document === 'undefined') {
    return readRawFileAsBase64(file);
  }

  try {
    const img = await loadImageFromFile(file);
    const layout = computeCoordinateGridLayout(img.naturalWidth || img.width, img.naturalHeight || img.height);

    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return readRawFileAsBase64(file);
    }

    // Ruler margin background
    ctx.fillStyle = '#181c24';
    ctx.fillRect(0, 0, layout.canvasWidth, layout.canvasHeight);

    // Draw the clean original image inside the grid frame
    ctx.drawImage(
      img,
      layout.marginLeft,
      layout.marginTop,
      layout.imageWidth,
      layout.imageHeight,
    );

    // Faint dual-stroke gridlines (dark hairline + warm amber/cyan tint) so lines stay visible on both white blueprints and dark photos
    const lineWidth = Math.max(1, Math.round(Math.min(layout.imageWidth, layout.imageHeight) / 900));

    ctx.save();
    ctx.lineWidth = lineWidth;

    const strokeGridLines = (strokeStyle: string, dash: number[]) => {
      ctx.strokeStyle = strokeStyle;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const x of layout.verticalLines) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, layout.marginTop);
        ctx.lineTo(px, layout.canvasHeight);
      }
      for (const y of layout.horizontalLines) {
        const py = Math.round(y) + 0.5;
        ctx.moveTo(layout.marginLeft, py);
        ctx.lineTo(layout.canvasWidth, py);
      }
      ctx.stroke();
    };

    // Subtle shadow backing + crisp faint architectural overlay
    strokeGridLines('rgba(10, 14, 22, 0.22)', []);
    strokeGridLines('rgba(235, 175, 85, 0.34)', [6, 4]);
    ctx.setLineDash([]);

    // Outer frame border
    ctx.strokeStyle = 'rgba(235, 175, 85, 0.55)';
    ctx.lineWidth = Math.max(1, lineWidth);
    ctx.strokeRect(
      layout.marginLeft + 0.5,
      layout.marginTop + 0.5,
      layout.imageWidth - 1,
      layout.imageHeight - 1,
    );

    // Column (A-J) and Row (1-10) labels inside the dedicated ruler bands
    const fontSize = Math.max(11, Math.min(22, Math.round(layout.marginTop * 0.56)));
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3d4a8';

    for (const col of layout.colCenters) {
      ctx.fillText(col.label, col.x, layout.marginTop * 0.52);
    }
    for (const row of layout.rowCenters) {
      ctx.fillText(row.label, layout.marginLeft * 0.5, row.y);
    }

    // Subtle faint cell tags at interior intersections (every other cell) for unambiguous spatial reference
    const cellFontSize = Math.max(9, Math.min(13, Math.round(fontSize * 0.65)));
    ctx.font = `600 ${cellFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let r = 0; r < GRID_ROWS.length; r += 2) {
      for (let c = 0; c < GRID_COLS.length; c += 2) {
        const tag = `${GRID_COLS[c]}${GRID_ROWS[r]}`;
        const tx = layout.verticalLines[c] + 4;
        const ty = layout.horizontalLines[r] + 3;
        ctx.fillStyle = 'rgba(12, 16, 24, 0.45)';
        ctx.fillText(tag, tx + 1, ty + 1);
        ctx.fillStyle = 'rgba(248, 214, 158, 0.52)';
        ctx.fillText(tag, tx, ty);
      }
    }
    ctx.restore();

    const outputMime =
      file.type === 'image/jpeg' || file.type === 'image/webp' ? 'image/jpeg' : 'image/png';
    const dataUrl =
      outputMime === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', 0.92)
        : canvas.toDataURL('image/png');
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) {
      return readRawFileAsBase64(file);
    }

    return {
      base64: dataUrl.slice(commaIdx + 1),
      mimeType: outputMime,
    };
  } catch {
    return readRawFileAsBase64(file);
  }
}
