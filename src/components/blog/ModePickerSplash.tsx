import { Rocket, Users, Zap, ArrowRight, PenTool } from 'lucide-react';
import type { BlogMode } from '../../types';

interface ModePickerSplashProps {
  onSelect: (mode: BlogMode) => void;
}

const cards = [
  {
    id: 'writer' as BlogMode,
    label: 'Writer',
    tagline: 'You write, AI assists',
    description: 'A distraction-free markdown editor. You author every word; AI generates contextual images on demand.',
    bestFor: 'Writers with a strong point of view',
    icon: PenTool,
    iconColor: '#00e5ff',
    iconBg: 'rgba(0,229,255,0.08)',
    iconBorder: 'rgba(0,229,255,0.22)',
    accentColor: '#00e5ff',
    hoverGlow: '0 0 40px rgba(0,229,255,0.1)',
    borderHover: 'rgba(0,229,255,0.28)',
  },
  {
    id: 'copilot' as BlogMode,
    label: 'Co-pilot',
    tagline: 'Write together with AI',
    description: 'AI brainstorms with you, builds a structured outline, then drafts each section while you guide and refine.',
    bestFor: 'Quality content with less effort',
    icon: Users,
    iconColor: '#a855f7',
    iconBg: 'rgba(168,85,247,0.08)',
    iconBorder: 'rgba(168,85,247,0.22)',
    accentColor: '#a855f7',
    hoverGlow: '0 0 40px rgba(168,85,247,0.1)',
    borderHover: 'rgba(168,85,247,0.28)',
  },
  {
    id: 'autopilot' as BlogMode,
    label: 'Autopilot',
    tagline: 'Set it and let it run',
    description: 'Give Autopilot your company details and topics. It generates a full multi-week content calendar and writes every post end-to-end.',
    bestFor: 'Content teams that need volume at scale',
    icon: Zap,
    iconColor: '#10b981',
    iconBg: 'rgba(16,185,129,0.08)',
    iconBorder: 'rgba(16,185,129,0.22)',
    accentColor: '#10b981',
    hoverGlow: '0 0 40px rgba(16,185,129,0.1)',
    borderHover: 'rgba(16,185,129,0.28)',
  },
];

export function ModePickerSplash({ onSelect }: ModePickerSplashProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8"
      style={{ background: 'rgba(2,8,16,0.97)', backdropFilter: 'blur(24px)' }}
    >
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-96 h-96 rounded-full blur-[120px] opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 rounded-full blur-[120px] opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)' }} />
      </div>

      {/* Header */}
      <div className="relative text-center mb-12 splash-enter" style={{ animationDelay: '0ms' }}>
        <div className="flex items-center justify-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center neon-breathe"
            style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)' }}>
            <Rocket size={20} className="text-cyan-precision" />
          </div>
          <span className="gradient-text text-2xl font-black tracking-tight">AI Blog Studio</span>
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-3">How do you want to work today?</h1>
        <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
          Pick a mode to get started. You can switch anytime from the sidebar.
        </p>
      </div>

      {/* Mode cards */}
      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className="group glass-card p-6 flex flex-col gap-4 text-left transition-all duration-300 splash-enter"
              style={{
                animationDelay: `${80 + i * 80}ms`,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = card.hoverGlow;
                (e.currentTarget as HTMLElement).style.borderColor = card.borderHover;
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '';
                (e.currentTarget as HTMLElement).style.borderColor = '';
                (e.currentTarget as HTMLElement).style.transform = '';
              }}
            >
              {/* Icon + arrow */}
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{ background: card.iconBg, border: `1px solid ${card.iconBorder}` }}>
                  <Icon size={22} style={{ color: card.iconColor }} />
                </div>
                <ArrowRight size={15} className="mt-1 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-200" />
              </div>

              {/* Text */}
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-100 mb-1">{card.label}</h3>
                <p className="text-xs font-semibold mb-2.5" style={{ color: card.accentColor }}>{card.tagline}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
              </div>

              {/* Best for */}
              <div className="pt-3 border-t" style={{ borderColor: 'rgba(0,229,255,0.06)' }}>
                <p className="text-[9px] uppercase tracking-widest font-bold text-slate-700 mb-0.5">Best for</p>
                <p className="text-xs text-slate-500">{card.bestFor}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
