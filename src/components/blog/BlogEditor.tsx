import { useRef } from 'react';
import { Bold, Italic, Heading1, Heading2, List, ImagePlus, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils';

interface BlogEditorProps {
  value: string;
  onChange: (value: string) => void;
  showPreview: boolean;
  onTogglePreview: () => void;
  onInsertImage?: () => void;
  placeholder?: string;
}

/** Very small markdown→HTML for live preview (no external dep). */
function miniMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="display:block;margin:1rem 0"><img src="$2" alt="$1" style="width:100%;height:auto;display:block;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12)"/></a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hulo])/gm, '')
    .replace(/^(.+)$/gm, (line) => {
      if (line.startsWith('<')) return line;
      return line;
    })
    .split('\n').map(l => {
      if (!l.trim()) return '';
      if (l.startsWith('<')) return l;
      return `<p>${l}</p>`;
    }).join('\n');
}

export function BlogEditor({ value, onChange, showPreview, onTogglePreview, onInsertImage, placeholder }: BlogEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAt = (before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(newVal);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    }, 0);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-ink-650 bg-ink-900 shrink-0">
        <button onClick={() => insertAt('# ')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ink-700 rounded" title="Heading 1"><Heading1 size={16} /></button>
        <button onClick={() => insertAt('## ')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ink-700 rounded" title="Heading 2"><Heading2 size={16} /></button>
        <div className="w-px h-4 bg-ink-650 mx-1" />
        <button onClick={() => insertAt('**', '**')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ink-700 rounded" title="Bold"><Bold size={16} /></button>
        <button onClick={() => insertAt('*', '*')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ink-700 rounded" title="Italic"><Italic size={16} /></button>
        <button onClick={() => insertAt('- ')} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ink-700 rounded" title="List"><List size={16} /></button>
        <div className="w-px h-4 bg-ink-650 mx-1" />
        {onInsertImage && (
          <button onClick={onInsertImage} className="p-1.5 text-cyan-precision hover:bg-ink-700 rounded flex items-center gap-1 text-xs font-medium" title="Insert Image">
            <ImagePlus size={16} /> Image
          </button>
        )}
        <div className="flex-1" />
        <button onClick={onTogglePreview} className={cn("p-1.5 rounded flex items-center gap-1 text-xs font-medium", showPreview ? "text-cyan-precision bg-ink-700" : "text-slate-400 hover:text-slate-200 hover:bg-ink-700")} title="Toggle preview">
          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 flex overflow-hidden">
        {!showPreview ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Start writing your blog post in markdown...'}
            className="flex-1 bg-ink-950 text-slate-200 p-4 font-mono text-sm resize-none outline-none placeholder-slate-600 leading-relaxed"
            spellCheck
          />
        ) : (
          <div
            className="flex-1 overflow-auto p-6 bg-white text-gray-900 prose prose-lg max-w-none"
            style={{ fontFamily: 'Georgia, serif', lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: miniMarkdownToHtml(value) }}
          />
        )}
      </div>
    </div>
  );
}
