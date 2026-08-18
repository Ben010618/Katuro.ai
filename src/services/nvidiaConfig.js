/**
 * NVIDIA NIM API Configuration & Client Service
 *
 * Used specifically for PPT Lesson Presentation Generation:
 * - Content Outline & Expansion (meta/llama-3.3-70b-instruct, etc.)
 * - Classroom Visual & Diagram Image Generation (stabilityai/stable-diffusion-xl, etc.)
 * - Enhanced Pedagogical Slide Design
 *
 * Stored in Firestore at adminConfig/nvidia (Admin-only access).
 * Falls back to VITE_NVIDIA_API_KEY env variable for local development.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const CONFIG_REF = doc(db, 'adminConfig', 'nvidia');
const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes

export const DEFAULT_NVIDIA_TEXT_MODEL  = 'meta/llama-3.3-70b-instruct';
export const DEFAULT_NVIDIA_IMAGE_MODEL = 'stabilityai/stable-diffusion-xl';

export const POPULAR_TEXT_MODELS = [
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B Instruct (Recommended - Fast & Comprehensive)' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'NVIDIA Nemotron 70B (High Reasoning Quality)' },
  { id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1 (Deep Pedagogical Reasoning)' },
  { id: 'mistralai/mixtral-8x22b-instruct-v0.1', label: 'Mixtral 8x22B Instruct (Balanced & Creative)' },
];

export const POPULAR_IMAGE_MODELS = [
  { id: 'stabilityai/stable-diffusion-xl', label: 'Stable Diffusion XL (High-Resolution Educational Visuals)' },
  { id: 'stabilityai/sdxl-turbo', label: 'SDXL Turbo (Ultra-Fast Image Generation)' },
];

let _nvidiaKeyCache   = null;
let _nvidiaModelCache = null;
let _nvidiaImgModelCache = null;
let _fetchedAt        = 0;

/**
 * Invalidate in-memory cached key & config.
 */
export function invalidateNvidiaKeyCache() {
  _nvidiaKeyCache      = null;
  _nvidiaModelCache    = null;
  _nvidiaImgModelCache = null;
  _fetchedAt           = 0;
}

/**
 * Retrieve active NVIDIA API Key and config from Firestore or env.
 */
export async function getNvidiaConfig() {
  if (_nvidiaKeyCache && (Date.now() - _fetchedAt < CACHE_TTL)) {
    return {
      apiKey:     _nvidiaKeyCache,
      model:      _nvidiaModelCache || DEFAULT_NVIDIA_TEXT_MODEL,
      imageModel: _nvidiaImgModelCache || DEFAULT_NVIDIA_IMAGE_MODEL,
    };
  }

  // Try Firestore (Admin-managed production key)
  try {
    const snap = await getDoc(CONFIG_REF);
    if (snap.exists() && snap.data()?.apiKey) {
      const data = snap.data();
      _nvidiaKeyCache      = data.apiKey;
      _nvidiaModelCache    = data.model || DEFAULT_NVIDIA_TEXT_MODEL;
      _nvidiaImgModelCache = data.imageModel || DEFAULT_NVIDIA_IMAGE_MODEL;
      _fetchedAt           = Date.now();
      return {
        apiKey:     _nvidiaKeyCache,
        model:      _nvidiaModelCache,
        imageModel: _nvidiaImgModelCache,
      };
    }
  } catch {
    // Firestore read failed or offline — fall through to env fallback
  }

  // Env fallback
  const envKey = import.meta.env.VITE_NVIDIA_API_KEY;
  if (envKey) {
    _nvidiaKeyCache      = envKey;
    _nvidiaModelCache    = import.meta.env.VITE_NVIDIA_MODEL || DEFAULT_NVIDIA_TEXT_MODEL;
    _nvidiaImgModelCache = import.meta.env.VITE_NVIDIA_IMAGE_MODEL || DEFAULT_NVIDIA_IMAGE_MODEL;
    _fetchedAt           = Date.now();
    return {
      apiKey:     _nvidiaKeyCache,
      model:      _nvidiaModelCache,
      imageModel: _nvidiaImgModelCache,
    };
  }

  return { apiKey: null, model: DEFAULT_NVIDIA_TEXT_MODEL, imageModel: DEFAULT_NVIDIA_IMAGE_MODEL };
}

/**
 * Helper to get just the key or null if not set.
 */
export async function getNvidiaKey() {
  const config = await getNvidiaConfig();
  return config.apiKey;
}

/**
 * Admin-only: Save NVIDIA configuration to Firestore.
 */
export async function saveNvidiaConfig({ apiKey, model, imageModel }, adminUid) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('NVIDIA API key cannot be empty.');

  const preview = trimmed.startsWith('nvapi-')
    ? 'nvapi-' + '•'.repeat(16) + trimmed.slice(-4)
    : trimmed.slice(0, 6) + '•'.repeat(16) + trimmed.slice(-4);

  await setDoc(CONFIG_REF, {
    apiKey:     trimmed,
    preview,
    hasKey:     true,
    model:      model || DEFAULT_NVIDIA_TEXT_MODEL,
    imageModel: imageModel || DEFAULT_NVIDIA_IMAGE_MODEL,
    updatedAt:  new Date(),
    updatedBy:  adminUid,
  });

  invalidateNvidiaKeyCache();
}

/**
 * Admin-only: Read public status info (masked preview, last update).
 */
export async function getNvidiaKeyStatus() {
  try {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists() || !snap.data().hasKey) {
      // Check env fallback
      const envKey = import.meta.env.VITE_NVIDIA_API_KEY;
      if (envKey) {
        return {
          hasKey:     true,
          preview:    envKey.slice(0, 6) + '••••••••••••••••' + envKey.slice(-4),
          model:      import.meta.env.VITE_NVIDIA_MODEL || DEFAULT_NVIDIA_TEXT_MODEL,
          imageModel: import.meta.env.VITE_NVIDIA_IMAGE_MODEL || DEFAULT_NVIDIA_IMAGE_MODEL,
          isEnv:      true,
        };
      }
      return { hasKey: false };
    }
    const d = snap.data();
    return {
      hasKey:     true,
      preview:    d.preview || 'nvapi-••••••••••••••••••••••••••••',
      model:      d.model   || DEFAULT_NVIDIA_TEXT_MODEL,
      imageModel: d.imageModel || DEFAULT_NVIDIA_IMAGE_MODEL,
      updatedAt:  d.updatedAt ?? null,
    };
  } catch {
    return { hasKey: false, error: true };
  }
}

/**
 * Test NVIDIA Key connectivity by sending a lightweight test request.
 */
export async function testNvidiaKey(apiKey, model = DEFAULT_NVIDIA_TEXT_MODEL) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('API key is required.');

  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${trimmed}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_NVIDIA_TEXT_MODEL,
      messages: [{ role: 'user', content: 'Respond with exactly: OK' }],
      max_tokens: 10,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || err?.message || `HTTP ${res.status} — Key may be invalid or quota exhausted.`;
    throw new Error(`NVIDIA API Error: ${msg}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content || '';
  return { ok: true, reply };
}

/**
 * Execute chat completion call to NVIDIA NIM with retry on rate-limit.
 */
export async function callNvidiaChat({
  messages,
  model,
  temperature = 0.5,
  maxTokens = 3000,
  responseFormat,
  _attempt = 0,
}) {
  const config = await getNvidiaConfig();
  if (!config.apiKey) {
    throw new Error('NVIDIA API Key is not configured. Please set it in Admin Dashboard → API Settings.');
  }

  const chosenModel = model || config.model || DEFAULT_NVIDIA_TEXT_MODEL;
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

  const payload = {
    model: chosenModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    if (_attempt < 3) {
      const delay = (2 ** _attempt) * 1000 + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
      return callNvidiaChat({ messages, model, temperature, maxTokens, responseFormat, _attempt: _attempt + 1 });
    }
    throw new Error('Could not reach NVIDIA AI service. Please check your internet connection and try again.');
  }

  if ((res.status === 429 || res.status === 503) && _attempt < 3) {
    const delay = (2 ** _attempt) * 1200 + Math.random() * 600;
    await new Promise(r => setTimeout(r, delay));
    return callNvidiaChat({ messages, model, temperature, maxTokens, responseFormat, _attempt: _attempt + 1 });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || err?.message || `HTTP ${res.status}`;
    throw new Error(`NVIDIA API call failed: ${msg}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return content;
}

/**
 * Generate an educational image / diagram using NVIDIA NIM Image API.
 * Supports Stability AI models on NVIDIA NIM (e.g. stabilityai/stable-diffusion-xl).
 * Returns base64 data URL string (data:image/png;base64,...) or null if generation is skipped/failed.
 */
export async function generateNvidiaImage({
  prompt,
  width = 896,
  height = 512,
  model,
  subject = '',
  topic = '',
}) {
  const config = await getNvidiaConfig();
  const chosenModel = model || config.imageModel || DEFAULT_NVIDIA_IMAGE_MODEL;
  
  // Format ultra-relevant, lightweight educational visual prompt
  const enhancedPrompt = `Ultra-relevant educational diagram or high-contrast illustration${subject ? ` for ${subject}` : ''}${topic ? ` on ${topic}` : ''}, clean minimalist 2D infographic or sharp photography, pure clean white background, high legibility, curriculum-aligned visual aid for classroom slide: ${prompt}`;

  // 1. Try NVIDIA GenAI Stability AI NIM endpoint if API key is present
  if (config.apiKey) {
    const url = `https://ai.api.nvidia.com/v1/genai/${chosenModel}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text_prompts: [
            { text: enhancedPrompt, weight: 1 },
            { text: 'blurry, low quality, dark, chaotic, cluttered background, unreadable messy text, watermark, signature, ugly, distorted, heavy file, noise', weight: -1 },
          ],
          cfg_scale: 7,
          height: Math.min(height, 768),
          width: Math.min(width, 1024),
          samples: 1,
          steps: 25,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const b64 = data?.artifacts?.[0]?.base64;
        if (b64) {
          return `data:image/png;base64,${b64}`;
        }
      }
    } catch (err) {
      console.warn('NVIDIA primary image generation failed, trying standard NIM endpoint:', err);
    }

    // 2. Try standard OpenAI-compatible image endpoint format on NVIDIA NIM
    try {
      const altUrl = 'https://integrate.api.nvidia.com/v1/images/generations';
      const altRes = await fetch(altUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
          prompt: enhancedPrompt,
          n: 1,
          size: `${width}x${height}`,
          response_format: 'b64_json',
        }),
      });

      if (altRes.ok) {
        const altData = await altRes.json();
        const b64 = altData?.data?.[0]?.b64_json;
        if (b64) {
          return `data:image/png;base64,${b64}`;
        }
        const imgUrl = altData?.data?.[0]?.url;
        if (imgUrl) return imgUrl;
      }
    } catch (err) {
      console.warn('NVIDIA standard image endpoint failed:', err);
    }
  }

  // 3. Guaranteed High-Speed AI Visual Generator (Pollinations Flux / SDXL)
  // Ensures every classroom slide gets an ultra-relevant, crisp educational photo/diagram
  try {
    const cleanSubject = (subject || '').trim();
    const cleanTopic = (topic || '').trim();
    const cleanPromptDesc = (prompt || '').trim();
    const combinedPrompt = `${cleanSubject ? cleanSubject + ' ' : ''}${cleanTopic ? cleanTopic + ', ' : ''}${cleanPromptDesc}, educational diagram illustration, clean minimalist 2d vector infographic, white background, high contrast, textbook illustration, high resolution`;
    
    const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(combinedPrompt)}?width=896&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
    
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) {
    console.warn('Educational visual fallback generation failed:', err);
  }

  return null;
}

