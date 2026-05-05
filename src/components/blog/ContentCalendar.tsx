import { Calendar, Loader2, Check, AlertCircle, FileText } from 'lucide-react';
import { cn } from '../../utils';
import type { PlanEntry } from '../../types';

interface ContentCalendarProps {
  entries: PlanEntry[];
  weeks: number;
  onGeneratePost: (entry: PlanEntry, index: number) => void;
  onViewPost: (entry: PlanEntry) => void;
  generatingIndex: number | null;
}

const statusConfig: Record<string, { border: string; bg: string; text: string; icon: any; label: string }> = {
  planned: {
    border: 'border-cyan-precision/12',
    bg: 'rgba(0,229,255,0.02)',
    text: 'text-slate-500',
    icon: Calendar,
    label: 'Planned',
  },
  generating: {
    border: 'border-amber-500/25',
    bg: 'rgba(245,158,11,0.04)',
    text: 'text-amber-400',
    icon: Loader2,
    label: 'Generating',
  },
  done: {
    border: 'border-aurora/25',
    bg: 'rgba(16,185,129,0.04)',
    text: 'text-aurora',
    icon: Check,
    label: 'Done',
  },
  error: {
    border: 'border-red-500/25',
    bg: 'rgba(239,68,68,0.04)',
    text: 'text-red-400',
    icon: AlertCircle,
    label: 'Error',
  },
};

export function ContentCalendar({ entries, weeks, onGeneratePost, onViewPost, generatingIndex }: ContentCalendarProps) {
  const weekGroups: PlanEntry[][] = [];
  for (let w = 1; w <= weeks; w++) {
    weekGroups.push(entries.filter(e => e.week === w));
  }

  return (
    <div className="space-y-6">
      {weekGroups.map((group, wi) => (
        <div key={wi}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-precision/60" />
              <h3 className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Week {wi + 1}</h3>
            </div>
            <div className="flex-1 h-px" style={{ background: 'rgba(0,229,255,0.06)' }} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((entry, ei) => {
              const globalIdx = entries.indexOf(entry);
              const status = generatingIndex === globalIdx ? 'generating' : entry.status;
              const cfg = statusConfig[status] || statusConfig.planned;
              const Icon = cfg.icon;

              return (
                <div
                  key={ei}
                  className={cn('glass-card border rounded-xl p-4 flex flex-col gap-2.5 transition-all hover-neon', cfg.border)}
                  style={{ background: cfg.bg }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 leading-snug line-clamp-2">{entry.title}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{entry.day_of_week} · {entry.topic_area}</p>
                    </div>
                    <div className={cn('flex items-center gap-1 shrink-0 px-2 py-1 rounded-full border text-[9px] font-bold uppercase tracking-wide', cfg.text, cfg.border)}
                      style={{ background: 'rgba(2,8,16,0.5)' }}>
                      <Icon size={10} className={status === 'generating' ? 'animate-spin' : ''} />
                      {cfg.label}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{entry.outline_summary}</p>

                  <div className="mt-auto pt-1">
                    {status === 'planned' && (
                      <button
                        onClick={() => onGeneratePost(entry, globalIdx)}
                        className="w-full text-xs font-semibold py-2 rounded-lg border border-cyan-precision/20 text-cyan-precision hover:border-cyan-precision/40 transition-all"
                        style={{ background: 'rgba(0,229,255,0.04)' }}
                      >
                        Generate Post
                      </button>
                    )}
                    {status === 'done' && (
                      <button
                        onClick={() => onViewPost(entry)}
                        className="w-full text-xs font-semibold py-2 rounded-lg border border-aurora/25 text-aurora hover:border-aurora/45 transition-all flex items-center justify-center gap-1.5"
                        style={{ background: 'rgba(16,185,129,0.04)' }}
                      >
                        <FileText size={11} /> View Post
                      </button>
                    )}
                    {status === 'generating' && (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 py-1">
                        <Loader2 size={11} className="animate-spin" />
                        Generating content & images...
                      </div>
                    )}
                    {status === 'error' && (
                      <div className="text-xs text-center py-1 text-red-400">Generation failed</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
