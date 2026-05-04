import { useState } from 'react';
import axios from 'axios';
import { ImagePlus, Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { cn } from '../../utils';
import type { BlogImage } from '../../types';

interface ImageGeneratorProps {
  blogId?: string;
  onImageGenerated: (image: BlogImage) => void;
  compact?: boolean;
  initialPrompt?: string;
}

const API = 'http://localhost:8000';

export function ImageGenerator({ blogId, onImageGenerated, compact, initialPrompt }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [provider, setProvider] = useState<'openai' | 'gemini'>('openai');
  const [style, setStyle] = useState('');
  const [quality, setQuality] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const { data } = await axios.post(`${API}/api/blog/generate-image`, {
        prompt,
        provider,
        style,
        quality,
        size: '1024x1024',
        blog_id: blogId || null,
      });
      const b64 = data.b64;
      setPreview(`data:image/png;base64,${b64}`);
      onImageGenerated({
        id: data.image_id,
        prompt: data.prompt,
        provider: data.provider,
        b64,
        url: blogId && data.image_id
          ? `${API}/blog-assets/${blogId}/${data.image_id}.png`
          : '',
        alt: prompt,
      });
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Image generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", compact ? "p-3" : "p-4")}>
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-cyan-precision" />
        <span className="text-sm font-semibold text-slate-200">Generate Image</span>
      </div>

      {/* Provider toggle */}
      <div className="flex bg-ink-900 rounded-lg p-0.5 border border-ink-650">
        {(['openai', 'gemini'] as const).map(p => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn(
              "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
              provider === p ? "bg-ink-700 text-slate-200 shadow" : "text-slate-500 hover:text-slate-300"
            )}
          >
            {p === 'openai' ? 'OpenAI' : 'Gemini'}
          </button>
        ))}
      </div>

      {/* Prompt */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the image you want to generate..."
        rows={3}
        className="w-full bg-ink-950 border border-ink-650 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-precision/50 resize-none"
      />

      {/* Style & Quality row */}
      {!compact && (
        <div className="flex gap-2">
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Style (e.g. watercolor, flat design)"
            className="flex-1 bg-ink-950 border border-ink-650 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-precision/50"
          />
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="bg-ink-950 border border-ink-650 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={loading || !prompt.trim()}
        className="flex items-center justify-center gap-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Preview */}
      {preview && (
        <div className="relative group">
          <img src={preview} alt={prompt} className="w-full rounded-lg border border-ink-650" />
          <button
            onClick={() => { setPreview(null); generate(); }}
            className="absolute top-2 right-2 p-1.5 bg-ink-900/80 text-slate-300 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-ink-800"
            title="Regenerate"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
