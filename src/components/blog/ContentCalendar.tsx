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

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  planned:    { color: 'text-slate-400 bg-ink-800 border-ink-650', icon: Calendar, label: 'Planned' },
  generating: { color: 'text-amber-400 bg-amber-950/40 border-amber-800/40', icon: Loader2, label: 'Generating' },
  done:       { color: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40', icon: Check, label: 'Done' },
  error:      { color: 'text-red-400 bg-red-950/40 border-red-800/40', icon: AlertCircle, label: 'Error' },
};

export function ContentCalendar({ entries, weeks, onGeneratePost, onViewPost, generatingIndex }: ContentCalendarProps) {
  const weekGroups: PlanEntry[][] = [];
  for (let w = 1; w <= weeks; w++) {
    weekGroups.push(entries.filter(e => e.week === w));
  }

  return (
    <div className="space-y-4">
      {weekGroups.map((group, wi) => (
        <div key={wi}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <Calendar size={14} />
            Week {wi + 1}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((entry, ei) => {
              const globalIdx = entries.indexOf(entry);
              const status = generatingIndex === globalIdx ? 'generating' : entry.status;
              const cfg = statusConfig[status] || statusConfig.planned;
              const Icon = cfg.icon;

              return (
                <div
                  key={ei}
                  className={cn("border rounded-lg p-3 flex flex-col gap-2 transition-all", cfg.color)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{entry.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{entry.day_of_week} · {entry.topic_area}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Icon size={14} className={status === 'generating' ? 'animate-spin' : ''} />
                      <span className="text-[10px] font-medium uppercase">{cfg.label}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">{entry.outline_summary}</p>

                  <div className="flex gap-2 mt-auto pt-1">
                    {status === 'planned' && (
                      <button
                        onClick={() => onGeneratePost(entry, globalIdx)}
                        className="flex-1 text-xs font-medium py-1.5 bg-cyan-precision/10 text-cyan-precision border border-cyan-precision/30 rounded-md hover:bg-cyan-precision/20 transition-colors"
                      >
                        Generate Post
                      </button>
                    )}
                    {status === 'done' && (
                      <button
                        onClick={() => onViewPost(entry)}
                        className="flex-1 text-xs font-medium py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1"
                      >
                        <FileText size={12} /> View Post
                      </button>
                    )}
                    {status === 'generating' && (
                      <div className="flex-1 text-xs text-center py-1.5 text-amber-400">
                        Generating content & images...
                      </div>
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
