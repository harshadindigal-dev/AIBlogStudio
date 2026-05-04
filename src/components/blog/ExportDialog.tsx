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
  { id: 'html', label: 'HTML', desc: 'Styled HTML ready for Medium or your own site', icon: Code },
  { id: 'zip', label: 'Full Bundle', desc: 'Markdown + HTML + images in a zip', icon: Archive },
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
    } catch (e) {
      alert('Export failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ink-900 border border-ink-650 rounded-xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
            <Download size={20} className="text-cyan-precision" />
            Export Blog Post
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200"><X size={18} /></button>
        </div>

        <div className="space-y-2 mb-6">
          {formats.map(f => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                onClick={() => setSelected(f.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  selected === f.id
                    ? "border-cyan-precision/50 bg-cyan-precision/10"
                    : "border-ink-650 bg-ink-800 hover:border-ink-600"
                )}
              >
                <Icon size={18} className={selected === f.id ? "text-cyan-precision" : "text-slate-400"} />
                <div>
                  <p className="text-sm font-medium text-slate-200">{f.label}</p>
                  <p className="text-xs text-slate-500">{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleExport}
          disabled={downloading}
          className="w-full flex items-center justify-center gap-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 text-ink-950 font-bold py-2.5 rounded-lg transition-colors text-sm"
        >
          <Download size={16} />
          {downloading ? 'Exporting...' : 'Download'}
        </button>
      </div>
    </div>
  );
}
