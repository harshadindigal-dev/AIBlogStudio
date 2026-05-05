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
    <div className={cn('flex flex-col gap-3', compact ? 'p-3' : 'p-5')}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)' }}>
          <Sparkles size={13} className="text-cyan-precision" />
        </div>
        <span className="text-xs font-bold text-slate-300 tracking-wide">Generate Image</span>
      </div>

      {/* Provider toggle */}
      <div className="flex rounded-xl p-0.5 border border-cyan-precision/10"
        style={{ background: 'rgba(2,8,16,0.5)' }}>
        {(['openai', 'gemini'] as const).map(p => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn(
              'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all',
              provider === p
                ? 'text-cyan-precision glow-cyan-sm'
                : 'text-slate-600 hover:text-slate-400'
            )}
            style={provider === p ? { background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' } : {}}
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
        className="w-full input-neon rounded-xl p-3 text-sm text-slate-200 resize-none"
      />

      {/* Style & Quality */}
      {!compact && (
        <div className="flex gap-2">
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="Style (e.g. watercolor)"
            className="flex-1 input-neon rounded-xl px-3 py-2 text-xs text-slate-200"
          />
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="input-neon rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
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
        className="btn-neon flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm disabled:opacity-40"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
        {loading ? 'Generating...' : 'Generate'}
      </button>

      {error && (
        <p className="text-red-400 text-xs px-2 py-1.5 rounded-lg border border-red-500/20"
          style={{ background: 'rgba(239,68,68,0.05)' }}>
          {error}
        </p>
      )}

      {/* Preview */}
      {preview && (
        <div className="relative group rounded-xl overflow-hidden border border-cyan-precision/15">
          <img src={preview} alt={prompt} className="w-full" />
          <button
            onClick={() => { setPreview(null); generate(); }}
            className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-cyan-precision/20 text-slate-300 hover:text-white"
            style={{ background: 'rgba(2,8,16,0.8)', backdropFilter: 'blur(8px)' }}
            title="Regenerate"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
