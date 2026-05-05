import { useState } from 'react';
import { Download, FileText, Code, Archive, X } from 'lucide-react';
import { cn } from '../../utils';

interface ExportDialogProps {
  projectId: string;
  onClose: () => void;
}

const API = 'http://localhost:8000';

const formats = [
  { id: 'markdown', label: 'Markdown', desc: 'Copy-paste into Substack, Ghost, or any CMS', icon: FileText },
  { id: 'html',     label: 'HTML',     desc: 'Styled HTML ready for Medium or your own site', icon: Code },
  { id: 'zip',      label: 'Full Bundle', desc: 'Markdown + HTML + all images in a zip', icon: Archive },
] as const;

export function ExportDialog({ projectId, onClose }: ExportDialogProps) {
  const [selected, setSelected] = useState<string>('markdown');
  const [downloading, setDownloading] = useState(false);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const resp = await fetch(`${API}/api/blog/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, format: selected }),
      });
      const blob = await resp.blob();
      const ext = selected === 'zip' ? 'zip' : selected === 'html' ? 'html' : 'md';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blog-${projectId.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      alert('Export failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(2,8,16,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="glass border border-cyan-precision/15 rounded-2xl w-full max-w-md p-6 glow-cyan"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)' }}>
              <Download size={16} className="text-cyan-precision" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-200">Export Post</h3>
              <p className="text-[10px] text-slate-600">Choose your format</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-ink-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Format options */}
        <div className="space-y-2 mb-5">
          {formats.map(f => {
            const Icon = f.icon;
            const active = selected === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left',
                  active
                    ? 'border-cyan-precision/35 glow-cyan-sm'
                    : 'border-cyan-precision/8 hover:border-cyan-precision/18'
                )}
                style={{
                  background: active ? 'rgba(0,229,255,0.06)' : 'rgba(3,14,28,0.5)',
                }}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  active ? 'text-cyan-precision' : 'text-slate-600'
                )}
                style={{ background: active ? 'rgba(0,229,255,0.12)' : 'rgba(2,8,16,0.6)' }}>
                  <Icon size={16} />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold', active ? 'text-slate-100' : 'text-slate-400')}>{f.label}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{f.desc}</p>
                </div>
                {active && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-cyan-precision shrink-0 glow-cyan-sm" />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleExport}
          disabled={downloading}
          className="w-full btn-neon flex items-center justify-center gap-2 py-3 rounded-xl text-sm disabled:opacity-40"
        >
          <Download size={15} />
          {downloading ? 'Exporting...' : 'Download'}
        </button>
      </div>
    </div>
  );
}
