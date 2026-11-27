import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { normalizeBlueprint } from './src/arch/blueprint';
import { normalizeGeneratedFurnitureBatch } from './src/arch/furnitureCatalog';
import { sanitizeBlueprint } from './src/arch/sanitizeBlueprint';
import { parseBlueprintStreamProgress } from './src/arch/streamProgress';
import type { InputMode } from './src/arch/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 3000);
const MODEL_NAME = 'gemini-4-neon';

const VALID_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const VALID_MODES = new Set<InputMode>(['floor_plan', 'exterior', 'single_room']);

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: 'Architectural name of the building or space (e.g., "Modern 2-Bedroom House").',
    },
    roof: {
      type: Type.OBJECT,
      properties: {
        style: {
          type: Type.STRING,
          enum: ['flat', 'gabled'],
          description: 'Roof silhouette style.',
        },
        color: {
          type: Type.STRING,
          description: 'Hex color string like "#3c4148".',
        },
        overhang: {
          type: Type.NUMBER,
          description: 'Roof eave overhang in meters (typically 0.3 to 0.7).',
        },
      },
      required: ['style', 'color', 'overhang'],
    },
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          x: { type: Type.NUMBER, description: 'Room center X coordinate in meters.' },
          z: { type: Type.NUMBER, description: 'Room center Z coordinate in meters.' },
          width: { type: Type.NUMBER, description: 'Room width along X in meters.' },
          depth: { type: Type.NUMBER, description: 'Room depth along Z in meters.' },
          floorMaterial: {
            type: Type.STRING,
            enum: ['wood', 'tile', 'carpet', 'concrete'],
          },
          floorColor: {
            type: Type.STRING,
            description: 'Hex color string for the floor finish.',
          },
        },
        required: ['id', 'name', 'x', 'z', 'width', 'depth', 'floorMaterial', 'floorColor'],
      },
    },
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          x1: { type: Type.NUMBER },
          z1: { type: Type.NUMBER },
          x2: { type: Type.NUMBER },
          z2: { type: Type.NUMBER },
          height: { type: Type.NUMBER, description: 'Wall height in meters (typically 2.8 to 3.2).' },
          thickness: { type: Type.NUMBER, description: 'Wall thickness in meters (0.15 interior, 0.24 exterior).' },
          color: { type: Type.STRING, description: 'Hex wall paint/plaster color.' },
          openings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['door', 'window'] },
                offset: {
                  type: Type.NUMBER,
                  description: 'Distance in meters from (x1, z1) to the start edge of the opening along the wall.',
                },
                width: { type: Type.NUMBER, description: 'Opening width in meters.' },
                height: { type: Type.NUMBER, description: 'Opening height in meters.' },
                sillHeight: {
                  type: Type.NUMBER,
                  description: 'Height from floor to bottom of opening in meters (0 for doors, ~0.6-1.1 for windows).',
                },
              },
              required: ['type', 'offset', 'width', 'height', 'sillHeight'],
            },
          },
        },
        required: ['id', 'x1', 'z1', 'x2', 'z2', 'height', 'thickness', 'color', 'openings'],
      },
    },
    furniture: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [
              'sofa',
              'bed',
              'table',
              'chair',
              'desk',
              'counter',
              'toilet',
              'sink',
              'bathtub',
              'plant',
              'tv_stand',
              'rug',
              'coffee_table',
              'bookshelf',
              'wardrobe',
              'fridge',
              'floor_lamp',
            ],
          },
          x: { type: Type.NUMBER },
          z: { type: Type.NUMBER },
          rotationY: {
            type: Type.NUMBER,
            description: 'Yaw rotation in radians around vertical Y axis.',
          },
          width: { type: Type.NUMBER, description: 'Width in meters.' },
          depth: { type: Type.NUMBER, description: 'Depth in meters.' },
          height: { type: Type.NUMBER, description: 'Height in meters.' },
          color: { type: Type.STRING, description: 'Primary hex color of the furniture piece.' },
        },
        required: ['type', 'x', 'z', 'rotationY', 'width', 'depth', 'height', 'color'],
      },
    },
  },
  required: ['name', 'roof', 'rooms', 'walls', 'furniture'],
};

const FURNITURE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      description: 'Exactly 3 distinct, richly detailed composite 3D furniture pieces matching the prompt.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Concise designer name for the piece (e.g., "Walnut Slatted Lounge Chair").',
          },
          description: {
            type: Type.STRING,
            description: 'Short 1-sentence description of materials and silhouette.',
          },
          category: {
            type: Type.STRING,
            enum: [
              'sofa',
              'bed',
              'table',
              'chair',
              'desk',
              'counter',
              'toilet',
              'sink',
              'plant',
              'tv_stand',
              'custom',
            ],
          },
          width: { type: Type.NUMBER, description: 'Overall bounding width along X in meters (0.3 to 3.5).' },
          depth: { type: Type.NUMBER, description: 'Overall bounding depth along Z in meters (0.3 to 2.5).' },
          height: { type: Type.NUMBER, description: 'Overall bounding height along Y in meters (0.3 to 2.4).' },
          color: {
            type: Type.STRING,
            description: 'Primary 6-digit hex color with leading # prefix (e.g., "#5c3f2b"). Never use color names.',
          },
          parts: {
            type: Type.ARRAY,
            description: '5 to 12 geometric primitive parts forming a recognizable, grounded 3D piece pivoted at bottom-center (y = 0 is the floor).',
            items: {
              type: Type.OBJECT,
              properties: {
                shape: { type: Type.STRING, enum: ['box', 'cylinder', 'sphere'] },
                x: { type: Type.NUMBER, description: 'Part center X in meters relative to piece center.' },
                y: { type: Type.NUMBER, description: 'Part center Y in meters above floor (bottom face >= 0).' },
                z: { type: Type.NUMBER, description: 'Part center Z in meters relative to piece center.' },
                width: { type: Type.NUMBER, description: 'Size along X (or diameter for cylinder/sphere) in meters.' },
                height: { type: Type.NUMBER, description: 'Size along Y in meters.' },
                depth: { type: Type.NUMBER, description: 'Size along Z in meters.' },
                rotationX: { type: Type.NUMBER, description: 'Optional X tilt in radians.' },
                rotationY: { type: Type.NUMBER, description: 'Optional Y rotation in radians.' },
                rotationZ: { type: Type.NUMBER, description: 'Optional Z tilt in radians.' },
                color: {
                  type: Type.STRING,
                  description: 'Strict 6-digit hex color with # prefix for this specific part (e.g., "#4f3626" walnut, "#e3dcd0" linen, "#c89f54" brass, "#3f6a44" foliage). Vary colors across different materials.',
                },
                material: {
                  type: Type.STRING,
                  enum: ['wood', 'fabric', 'metal', 'glass', 'ceramic', 'stone', 'foliage'],
                },
              },
              required: ['shape', 'x', 'y', 'z', 'width', 'height', 'depth', 'color', 'material'],
            },
          },
        },
        required: ['name', 'description', 'category', 'width', 'depth', 'height', 'color', 'parts'],
      },
    },
  },
  required: ['items'],
};

function buildModePrompt(mode: InputMode, userNotes: string): string {
  const modeDirective =
    mode === 'floor_plan'
      ? `MODE: 2D Floor Plan.
Carefully trace the exact room layout, proportions, exterior and interior walls, door openings, window openings, and visible furniture from the 2D architectural floor plan. Ensure adjacent rooms share aligned walls with no gaps, and include interior door openings connecting every room so a person can walk throughout the entire space.`
      : mode === 'exterior'
        ? `MODE: Building Exterior Photo.
Analyze the building's architectural style, estimated footprint proportions, facade wall color, roof style (flat or gabled) and roof color, plus visible exterior door and window positions. Then design a realistic, logical, fully connected single-story interior floor plan (e.g., living room, kitchen, bedroom(s), bathroom, hallway) whose interior rooms and furniture align cleanly with those exterior doors and windows.`
        : `MODE: Single Room Photo.
Reconstruct the visible room's real-world dimensions, floor material and color, visible walls, windows, and furniture pieces accurately. Complete the enclosed room by adding the unseen rear wall behind the camera with a realistic entry door opening so the user can walk inside the complete enclosed room.`;

  const notesBlock = userNotes.trim()
    ? `\nAdditional user design notes to honor: "${userNotes.trim()}"`
    : '';

  return `${modeDirective}${notesBlock}

COORDINATE GRID & REAL-WORLD SCALE CALIBRATION:
- The input image has a faint 10x10 architectural reference grid overlaid across it: columns A–J run horizontally (left to right) and rows 1–10 run vertically (top to bottom).
- Use the A–J and 1–10 grid lines as a precise visual ruler to align parallel walls, corner intersections, room proportions, and door/window placements along exact straight axes.
- Anchor real-world scale strictly to architectural standards: standard single interior/exterior door widths = 0.9m (height 2.15m), standard ceiling/wall height = 2.8m (unless clearly double-height), and standard exterior/interior wall thicknesses = 0.22m / 0.14m.

CRITICAL SPATIAL RULES:
1. All coordinates are in real-world meters on the XZ ground plane, centered near [0, 0].
2. Each room's (x, z) is its geometric CENTER, with width along X and depth along Z. Adjacent rooms must tile cleanly without overlapping or leaving stray gaps.
3. Wall endpoints (x1, z1) to (x2, z2) must meet cleanly at shared corners and never duplicate collinear walls between adjacent rooms. Every opening's offset is measured in meters from (x1, z1) to the opening's start edge, so offset >= 0.15 and offset + width <= wallLength - 0.15.
4. Every interior room must be reachable through at least one door opening (sillHeight: 0, width: 0.9m standard single door up to 1.8m wide opening, height: 2.15m).
5. Place realistic furniture inside the rooms with proper clearance from walls and doorways (never block doors or place furniture outside room boundaries).
6. Use natural, tasteful architectural hex colors (e.g., "#ece8e0" plaster, "#b7885a" oak, "#383e47" slate roof).`;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets, or use Load Demo House to explore the 3D engine.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SYSTEM_INSTRUCTION =
  'You are a senior architectural spatial modeling engineer. Every input image includes a faint numbered 10x10 coordinate grid overlay (columns A-J horizontally, rows 1-10 vertically). Use this coordinate grid to achieve tight orthogonal wall alignment, accurate room proportions, and closed corners, and anchor real-world metric scale to standard 0.9m door widths and 2.8m wall heights. Convert architectural floor plans, exterior photographs, and interior room photos into precise, walkable, single-story 3D spatial blueprints in real-world meters without duplicate overlapping walls.';

function classifyErrorStatus(message: string): number {
  if (/API_KEY|PERMISSION_DENIED|not configured/i.test(message)) return 401;
  if (/RESOURCE_EXHAUSTED|429/i.test(message)) return 429;
  return 500;
}

function writeSseEvent(res: express.Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function loadFirebaseWebApiKey(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    return typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  } catch {
    return '';
  }
}

const FIREBASE_WEB_API_KEY = loadFirebaseWebApiKey();

/**
 * Verifies the caller's Firebase Google Auth ID token via Identity Toolkit's
 * accounts:lookup endpoint so unauthenticated API calls are rejected with 401.
 */
async function requireFirebaseAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const idToken = match?.[1]?.trim();

  if (!idToken) {
    res.status(401).json({
      error: 'Google sign-in is required to generate 3D models and furniture.',
    });
    return;
  }

  if (!FIREBASE_WEB_API_KEY) {
    res.status(500).json({
      error: 'Firebase authentication configuration is missing on the server.',
    });
    return;
  }

  try {
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );

    if (!verifyRes.ok) {
      res.status(401).json({
        error: 'Your Google session has expired or is invalid. Please sign in again.',
      });
      return;
    }

    const data = (await verifyRes.json()) as {
      users?: Array<{ localId?: string; email?: string; disabled?: boolean }>;
    };
    const account = data.users?.[0];
    if (!account?.localId || account.disabled) {
      res.status(401).json({
        error: 'Your Google account could not be verified. Please sign in again.',
      });
      return;
    }

    next();
  } catch {
    res.status(503).json({
      error: 'Unable to verify Google authentication right now. Please try again.',
    });
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  app.post('/api/furniture/generate', requireFirebaseAuth, async (req, res) => {
    try {
      const { prompt } = (req.body ?? {}) as { prompt?: string };
      const cleanedPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 400) : '';
      if (!cleanedPrompt) {
        res.status(400).json({ error: 'Please describe the furniture you want to generate.' });
        return;
      }

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Design EXACTLY 3 distinct, complementary 3D furniture pieces inspired by this user request: "${cleanedPrompt}".

CRITICAL 3D MODELING RULES:
1. Return exactly 3 pieces in "items" (for example, if the user asks for "living room set" or "gaming desk", create 3 complementary distinct variations or matching pieces).
2. Each piece MUST be assembled from 5 to 12 realistic parts ("box", "cylinder", "sphere") in real-world meters centered at (x=0, z=0) with the floor at y=0.
3. For every part, "y" is the part's vertical CENTER above the floor, so legs of height 0.4m have y=0.2, and a tabletop of thickness 0.05m sitting atop 0.7m legs has y=0.725. Never leave floating gaps between legs, frames, seats, cushions, or tabletops.
4. Contrast materials thoughtfully (e.g., matte "fabric" cushions against warm "wood" frames, brushed "metal" hardware, "stone" or "glass" tops, "ceramic" accents, or "foliage").
5. EVERY "color" field MUST be a valid 6-digit "#RRGGBB" hex string (never color words), and different materials on the same piece MUST use visibly distinct, realistic hex colors (e.g., "#4f3626" wood frame, "#e5ded2" cream cushion, "#2f343c" ceramic vessel, "#3d6643" botanical foliage).`,
        config: {
          systemInstruction:
            'You are a senior industrial & architectural 3D furniture designer. You build realistic, accurately proportioned, grounded multi-part 3D furniture assemblies in real-world meters for an architectural walkthrough engine.',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
          responseMimeType: 'application/json',
          responseSchema: FURNITURE_BATCH_SCHEMA,
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'The Gemini API returned an empty furniture response. Please try again.',
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(502).json({
          error: 'Failed to parse structured JSON from the furniture generator. Please retry.',
        });
        return;
      }

      const items = normalizeGeneratedFurnitureBatch(parsed, cleanedPrompt);
      res.json({ items });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected server error while generating furniture.';
      res.status(classifyErrorStatus(message)).json({ error: message });
    }
  });

  app.post('/api/blueprint/generate-stream', requireFirebaseAuth, async (req, res) => {
    const { imageBase64, mimeType, mode, prompt } = (req.body ?? {}) as {
      imageBase64?: string;
      mimeType?: string;
      mode?: InputMode;
      prompt?: string;
    };

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      res.status(400).json({ error: 'An architectural image is required.' });
      return;
    }

    const resolvedMime =
      typeof mimeType === 'string' && VALID_MIME_TYPES.has(mimeType)
        ? mimeType
        : 'image/png';
    const resolvedMode: InputMode =
      mode && VALID_MODES.has(mode) ? mode : 'floor_plan';
    const userNotes = typeof prompt === 'string' ? prompt.slice(0, 600) : '';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientClosed = false;
    // IMPORTANT: On POST requests in Node.js 16+, req emits 'close' as soon as
    // express.json() finishes reading the request body. Track client aborts on
    // the response stream instead (only true if closed before res.writableEnded).
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const startedAt = Date.now();
    let lastWriteAt = startedAt;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const emitSse = (event: string, data: unknown) => {
      lastWriteAt = Date.now();
      writeSseEvent(res, event, data);
    };

    const clearHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    try {
      const ai = getGeminiClient();

      emitSse('stage', {
        stage: 'analyzing',
        message: 'Inspecting architectural image...',
      });

      emitSse('stage', {
        stage: 'reasoning',
        message: 'Planning spatial dimensions, walls & openings...',
      });

      heartbeatTimer = setInterval(() => {
        if (clientClosed || res.writableEnded) {
          clearHeartbeat();
          return;
        }
        if (Date.now() - lastWriteAt >= 1200) {
          emitSse('heartbeat', {
            elapsedMs: Date.now() - startedAt,
          });
        }
      }, 1200);

      const stream = await ai.models.generateContentStream({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: resolvedMime,
                data: imageBase64,
              },
            },
            {
              text: buildModePrompt(resolvedMode, userNotes),
            },
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
          responseMimeType: 'application/json',
          responseSchema: BLUEPRINT_SCHEMA,
        },
      });

      let rawText = '';
      let enteredStreaming = false;
      let lastEmittedChars = 0;
      let lastSignature = '';

      for await (const chunk of stream) {
        if (clientClosed) break;
        const delta = chunk.text ?? '';
        if (!delta) continue;

        rawText += delta;
        if (!enteredStreaming) {
          enteredStreaming = true;
          emitSse('stage', {
            stage: 'streaming',
            message: 'Streaming rooms, walls & furniture geometry...',
          });
        }

        const progress = parseBlueprintStreamProgress(rawText);
        const sig = `${progress.detectedName ?? ''}|${progress.roofStyle ?? ''}|${progress.roomsCount}|${progress.roomNames.length}|${progress.wallsCount}|${progress.furnitureCount}`;
        if (sig !== lastSignature || rawText.length - lastEmittedChars >= 320) {
          lastSignature = sig;
          lastEmittedChars = rawText.length;
          emitSse('progress', {
            progress,
            elapsedMs: Date.now() - startedAt,
          });
        }
      }

      clearHeartbeat();
      if (clientClosed) {
        res.end();
        return;
      }

      const trimmed = rawText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      if (!trimmed) {
        emitSse('error', {
          error:
            'The Gemini API returned an empty blueprint response. Please try again with a clearer image.',
        });
        res.end();
        return;
      }

      emitSse('stage', {
        stage: 'building',
        message: 'Validating architectural mesh & saving blueprint...',
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        emitSse('error', {
          error: 'Failed to parse structured JSON from the model response. Please retry.',
        });
        res.end();
        return;
      }

      const blueprint = sanitizeBlueprint(normalizeBlueprint(parsed));
      emitSse('complete', {
        blueprint,
        elapsedMs: Date.now() - startedAt,
      });
      res.end();
    } catch (err: unknown) {
      clearHeartbeat();
      if (!clientClosed && !res.writableEnded) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unexpected server error while generating blueprint.';
        emitSse('error', { error: message });
        res.end();
      }
    }
  });

  app.post('/api/blueprint/generate', requireFirebaseAuth, async (req, res) => {
    try {
      const { imageBase64, mimeType, mode, prompt } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        mode?: InputMode;
        prompt?: string;
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'An architectural image is required.' });
        return;
      }

      const resolvedMime =
        typeof mimeType === 'string' && VALID_MIME_TYPES.has(mimeType)
          ? mimeType
          : 'image/png';
      const resolvedMode: InputMode =
        mode && VALID_MODES.has(mode) ? mode : 'floor_plan';
      const userNotes = typeof prompt === 'string' ? prompt.slice(0, 600) : '';

      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: resolvedMime,
                data: imageBase64,
              },
            },
            {
              text: buildModePrompt(resolvedMode, userNotes),
            },
          ],
        },
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
          responseMimeType: 'application/json',
          responseSchema: BLUEPRINT_SCHEMA,
        },
      });

      const rawText = (response.text ?? '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      if (!rawText) {
        res.status(502).json({
          error: 'The Gemini API returned an empty blueprint response. Please try again with a clearer image.',
        });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(502).json({
          error: 'Failed to parse structured JSON from the model response. Please retry.',
        });
        return;
      }

      const blueprint = sanitizeBlueprint(normalizeBlueprint(parsed));
      res.json({ blueprint });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unexpected server error while generating blueprint.';
      res.status(classifyErrorStatus(message)).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ArchWalk 3D server listening on http://localhost:${PORT}`);
  });
}

startServer();
