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

function miniMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="display:block;margin:1.5rem 0"><img src="$2" alt="$1" style="width:100%;height:auto;display:block;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.18)"/></a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#00e5ff;text-decoration:underline">$1</a>')
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

  const toolbarBtn = 'p-1.5 rounded-lg text-slate-500 hover:text-cyan-precision hover:bg-cyan-precision/8 transition-all';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-cyan-precision/10 glass shrink-0">
        <button onClick={() => insertAt('# ')} className={toolbarBtn} title="Heading 1"><Heading1 size={15} /></button>
        <button onClick={() => insertAt('## ')} className={toolbarBtn} title="Heading 2"><Heading2 size={15} /></button>
        <div className="w-px h-4 mx-1.5" style={{ background: 'rgba(0,229,255,0.1)' }} />
        <button onClick={() => insertAt('**', '**')} className={toolbarBtn} title="Bold"><Bold size={15} /></button>
        <button onClick={() => insertAt('*', '*')} className={toolbarBtn} title="Italic"><Italic size={15} /></button>
        <button onClick={() => insertAt('- ')} className={toolbarBtn} title="List"><List size={15} /></button>
        <div className="w-px h-4 mx-1.5" style={{ background: 'rgba(0,229,255,0.1)' }} />
        {onInsertImage && (
          <button
            onClick={onInsertImage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cyan-precision hover:bg-cyan-precision/10 transition-all border border-cyan-precision/20 hover:border-cyan-precision/40"
            title="Insert Image"
          >
            <ImagePlus size={13} /> Image
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onTogglePreview}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
            showPreview
              ? 'text-cyan-precision bg-cyan-precision/10 border border-cyan-precision/30'
              : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-cyan-precision/15'
          )}
        >
          {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
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
            className="flex-1 text-slate-200 p-6 font-mono text-sm resize-none outline-none leading-relaxed placeholder-slate-700"
            style={{
              background: 'rgba(2,8,16,0.55)',
              caretColor: '#00e5ff',
            }}
            spellCheck
          />
        ) : (
          <div
            className="flex-1 overflow-auto p-8 bg-white text-gray-900 prose prose-lg max-w-none"
            style={{ fontFamily: 'Georgia, serif', lineHeight: 1.85 }}
            dangerouslySetInnerHTML={{ __html: miniMarkdownToHtml(value) }}
          />
        )}
      </div>
    </div>
  );
}
