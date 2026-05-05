import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  PenTool, Users, Zap, Download, Plus, Loader2,
  ChevronRight, Sparkles, LayoutGrid, ImageIcon,
  Send, Trash2, Check, MessageSquare, AlignLeft, FileText, Eye,
} from 'lucide-react';
import { cn } from '../../utils';
import { BlogEditor } from './BlogEditor';
import { ImageGenerator } from './ImageGenerator';
import { ChatPanel } from './ChatPanel';
import { ContentCalendar } from './ContentCalendar';
import { ExportDialog } from './ExportDialog';
import { ModePickerSplash } from './ModePickerSplash';
import type { BlogMode, BlogImage, ChatMessage, PlanEntry, ContentPlan } from '../../types';

const API = 'http://localhost:8000';

const modes: { id: BlogMode; label: string; desc: string; icon: any; activeColor: string }[] = [
  { id: 'writer',    label: 'Writer',    desc: 'You write, AI generates images inline',        icon: PenTool, activeColor: 'text-cyan-precision' },
  { id: 'copilot',   label: 'Co-pilot',  desc: 'AI brainstorms, outlines & drafts with you',   icon: Users,   activeColor: 'text-plasma' },
  { id: 'autopilot', label: 'Autopilot', desc: 'Fully automated content planning & generation', icon: Zap,     activeColor: 'text-aurora' },
];

// ── Co-pilot phase stepper ────────────────────────────────────────────────────
const COPILOT_STEPS = [
  { key: 'brainstorm', label: 'Brainstorm', icon: MessageSquare },
  { key: 'outline',    label: 'Outline',    icon: AlignLeft },
  { key: 'drafting',   label: 'Draft',      icon: FileText },
  { key: 'review',     label: 'Review',     icon: Eye },
];

function CopilotStepper({ phase }: { phase: string }) {
  const activeIdx = COPILOT_STEPS.findIndex(s => s.key === phase);
  return (
    <div className="flex items-center px-6 py-3 border-b border-cyan-precision/10 glass shrink-0">
      {COPILOT_STEPS.map((step, i) => {
        const done   = i < activeIdx;
        const active = i === activeIdx;
        const Icon   = step.icon;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300',
                done   ? 'bg-aurora/15 border border-aurora/35' :
                active ? 'bg-cyan-precision/12 border border-cyan-precision/40 glow-cyan-sm' :
                         'bg-ink-800 border border-ink-700'
              )}>
                {done
                  ? <Check size={10} className="text-aurora" />
                  : <Icon size={10} className={active ? 'text-cyan-precision' : 'text-slate-700'} />
                }
              </div>
              <span className={cn(
                'text-[10px] font-semibold whitespace-nowrap',
                active ? 'text-cyan-precision' : done ? 'text-aurora/70' : 'text-slate-700'
              )}>
                {step.label}
              </span>
            </div>
            {i < COPILOT_STEPS.length - 1 && (
              <div className="flex-1 mx-2 h-px transition-colors duration-500"
                style={{ background: i < activeIdx ? 'rgba(16,185,129,0.35)' : 'rgba(0,229,255,0.07)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BlogStudio() {
  // ── Mode + first-run picker ───────────────────────────────────────────────
  const [hasChosenMode, setHasChosenMode] = useState<boolean>(
    () => !!localStorage.getItem('aiblogstudio_mode_chosen')
  );
  const [mode, setMode] = useState<BlogMode>('writer');

  const handleModeSelect = (selected: BlogMode) => {
    setMode(selected);
    setHasChosenMode(true);
    localStorage.setItem('aiblogstudio_mode_chosen', '1');
  };

  // ── Export dialog ─────────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);

  // ── Project ───────────────────────────────────────────────────────────────
  const [projectId, setProjectId] = useState<string>(
    () => localStorage.getItem('blog_project_id') || ''
  );

  // ── Writer / Copilot shared state ─────────────────────────────────────────
  const [editorContent, setEditorContent] = useState<string>(
    () => localStorage.getItem('blog_editor_content') || ''
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [images, setImages] = useState<BlogImage[]>(
    () => { try { return JSON.parse(localStorage.getItem('blog_images') || '[]'); } catch { return []; } }
  );

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Persist to localStorage ───────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('blog_editor_content', editorContent); }, [editorContent]);
  useEffect(() => { localStorage.setItem('blog_project_id', projectId); }, [projectId]);
  useEffect(() => { localStorage.setItem('blog_images', JSON.stringify(images)); }, [images]);

  // ── Copilot state ─────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [copilotPhase, setCopilotPhase] = useState<'brainstorm' | 'outline' | 'drafting' | 'review'>(
    () => (localStorage.getItem('blog_editor_content') ? 'review' : 'brainstorm')
  );
  const [copilotOutline, setCopilotOutline] = useState<any>(null);
  const [copilotDrafting, setCopilotDrafting] = useState(false);
  const [copilotSectionIdx, setCopilotSectionIdx] = useState(0);
  const [copilotImageIdx, setCopilotImageIdx] = useState<number | null>(null);
  const [outlineRefineInput, setOutlineRefineInput] = useState('');
  const [outlineRefining, setOutlineRefining] = useState(false);

  // ── Autopilot state ───────────────────────────────────────────────────────
  const [autoForm, setAutoForm] = useState({
    company_name: '', company_description: '', topics: '', audience: '',
    posts_per_week: 2, weeks: 4, image_provider: 'openai' as 'openai' | 'gemini',
  });
  const [autoPlan, setAutoPlan] = useState<ContentPlan | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const saveProject = useCallback(async (content: string, imgs: BlogImage[], pId?: string) => {
    const id = pId || projectId;
    if (!id) return;
    await axios.put(`${API}/api/blog/projects/${id}`, {
      sections: [{ id: 'main', heading: 'Content', content, imageIds: imgs.map(i => i.id), order: 0 }],
      images: imgs,
    }).catch(() => {});
  }, [projectId]);

  const ensureProject = useCallback(async (): Promise<string> => {
    if (projectId) return projectId;
    const { data } = await axios.post(`${API}/api/blog/projects`);
    setProjectId(data.project.id);
    return data.project.id;
  }, [projectId]);

  // ── Debounced auto-save ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editorContent.trim()) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');
      ensureProject()
        .then(pid => saveProject(editorContent, images, pid))
        .then(() => {
          setSaveStatus('saved');
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
        })
        .catch(() => setSaveStatus('idle'));
    }, 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent]);

  // ── ⌘E floating export shortcut ──────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e' && editorContent.trim()) {
        e.preventDefault();
        handleFloatingExport();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent, projectId]);

  const handleFloatingExport = async () => {
    const pid = await ensureProject();
    await saveProject(editorContent, images, pid);
    setShowExport(true);
  };

  const handleImageGenerated = (img: BlogImage) => {
    setImages(prev => [...prev, img]);
    const imgSrc = img.url || `data:image/png;base64,${img.b64}`;
    setEditorContent(prev => prev + `\n\n![${img.alt}](${imgSrc})\n\n`);
    setShowImageGen(false);
  };

  // ── Copilot ───────────────────────────────────────────────────────────────

  const copilotGenerateOutline = async () => {
    const chatContext = chatMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    setCopilotPhase('outline');
    try {
      const { data } = await axios.post(`${API}/api/blog/outline`, {
        topic: chatContext.slice(-2000), audience: '', tone: 'professional', num_sections: 5,
      });
      setCopilotOutline(data.outline);
    } catch { setCopilotOutline(null); }
  };

  const updateOutlineSection = (idx: number, field: string, value: any) =>
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[idx] = { ...sections[idx], [field]: value };
      return { ...prev, sections };
    });

  const updateBulletPoint = (sectionIdx: number, bulletIdx: number, value: string) =>
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || [])];
      bullets[bulletIdx] = value;
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });

  const addBulletPoint = (sectionIdx: number) =>
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || []), ''];
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });

  const removeBulletPoint = (sectionIdx: number, bulletIdx: number) =>
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || [])];
      bullets.splice(bulletIdx, 1);
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });

  const addOutlineSection = () =>
    setCopilotOutline((prev: any) => prev ? {
      ...prev,
      sections: [...prev.sections, { heading: 'New Section', bullet_points: [''], image_suggestion: '' }],
    } : prev);

  const removeOutlineSection = (idx: number) =>
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections.splice(idx, 1);
      return { ...prev, sections };
    });

  const copilotRefineOutline = async () => {
    if (!outlineRefineInput.trim() || !copilotOutline) return;
    setOutlineRefining(true);
    try {
      const { data } = await axios.post(`${API}/api/blog/refine-outline`, {
        outline: copilotOutline, feedback: outlineRefineInput,
      });
      setCopilotOutline(data.outline);
      setOutlineRefineInput('');
    } catch { }
    finally { setOutlineRefining(false); }
  };

  const copilotDraftAll = async () => {
    if (!copilotOutline) return;
    setCopilotPhase('drafting');
    setCopilotDrafting(true);
    const pid = await ensureProject();
    let fullContent = `# ${copilotOutline.title}\n\n`;
    if (copilotOutline.subtitle) fullContent += `*${copilotOutline.subtitle}*\n\n`;

    for (let i = 0; i < copilotOutline.sections.length; i++) {
      setCopilotSectionIdx(i);
      const section = copilotOutline.sections[i];
      fullContent += `## ${section.heading}\n\n`;
      const resp = await fetch(`${API}/api/blog/draft-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: section.heading, bullet_points: section.bullet_points || [],
          context: `Blog title: ${copilotOutline.title}`, tone: 'professional', word_count: 300,
        }),
      });
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const payload = line.slice(6);
              if (payload === '[DONE]') break;
              try { const { token } = JSON.parse(payload); fullContent += token; setEditorContent(fullContent); }
              catch {}
            }
          }
        }
      }
      fullContent += '\n\n';
      const isLastSection = i === copilotOutline.sections.length - 1;
      if (section.image_suggestion && !isLastSection) {
        fullContent += `![Generating image for ${section.heading}...](IMG_PLACEHOLDER_${i})\n\n`;
      }
      setEditorContent(fullContent);
    }

    setCopilotImageIdx(0);
    const sectionsWithImages = copilotOutline.sections
      .map((s: any, i: number) => ({ section: s, idx: i }))
      .filter(({ section }: any) => section.image_suggestion);

    const imageResults = await Promise.allSettled(
      sectionsWithImages.map(({ section, idx }: any) =>
        axios.post(`${API}/api/blog/generate-image`, {
          prompt: section.image_suggestion, provider: 'openai',
          size: '1536x1024', quality: 'medium', blog_id: pid,
        }).then(({ data }) => ({ section, idx, data }))
      )
    );

    const generatedImages: BlogImage[] = [];
    for (const result of imageResults) {
      if (result.status === 'fulfilled') {
        const { section, idx, data } = result.value;
        const img: BlogImage = {
          id: data.image_id, prompt: data.prompt, provider: data.provider, b64: data.b64,
          url: `${API}/blog-assets/${pid}/${data.image_id}.png`, alt: section.heading,
        };
        generatedImages.push(img);
        fullContent = fullContent.replace(
          `![Generating image for ${section.heading}...](IMG_PLACEHOLDER_${idx})`,
          `![](${API}/blog-assets/${pid}/${data.image_id}.png)`
        );
      }
    }
    fullContent = fullContent.replace(/!\[[^\]]*\]\(IMG_PLACEHOLDER_\d+\)\n\n/g, '');
    setImages(generatedImages);
    setEditorContent(fullContent);
    setCopilotDrafting(false);
    setCopilotImageIdx(null);
    setCopilotPhase('review');
    setShowPreview(true);
    saveProject(fullContent, generatedImages, pid);
  };

  // ── Autopilot ─────────────────────────────────────────────────────────────

  const autoGeneratePlan = async () => {
    setAutoLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/blog/auto-plan`, {
        company_name: autoForm.company_name, company_description: autoForm.company_description,
        topics: autoForm.topics.split(',').map(t => t.trim()).filter(Boolean),
        audience: autoForm.audience, posts_per_week: autoForm.posts_per_week, weeks: autoForm.weeks,
      });
      setAutoPlan(data.plan);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to generate plan');
    } finally { setAutoLoading(false); }
  };

  const autoGeneratePost = async (entry: PlanEntry, index: number) => {
    if (!autoPlan) return;
    setGeneratingIdx(index);
    try {
      const { data } = await axios.post(`${API}/api/blog/auto-generate`, {
        entry, company_name: autoPlan.company_name,
        audience: autoForm.audience, image_provider: autoForm.image_provider,
      });
      setAutoPlan(prev => {
        if (!prev) return prev;
        const updated = { ...prev, entries: [...prev.entries] };
        updated.entries[index] = { ...updated.entries[index], status: 'done', blog_project_id: data.project.id };
        return updated;
      });
    } catch {
      setAutoPlan(prev => {
        if (!prev) return prev;
        const updated = { ...prev, entries: [...prev.entries] };
        updated.entries[index] = { ...updated.entries[index], status: 'error' };
        return updated;
      });
    } finally { setGeneratingIdx(null); }
  };

  const autoGenerateAll = async () => {
    if (!autoPlan) return;
    for (let i = 0; i < autoPlan.entries.length; i++) {
      if (autoPlan.entries[i].status === 'planned') await autoGeneratePost(autoPlan.entries[i], i);
    }
  };

  // ── Shared class shorthands ───────────────────────────────────────────────
  const inputCls  = 'w-full input-neon rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none';
  const selectCls = 'w-full input-neon rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none';
  const showFloatingExport = (mode === 'writer' || mode === 'copilot') && !!editorContent.trim();

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      {/* First-run mode picker overlay */}
      {!hasChosenMode && <ModePickerSplash onSelect={handleModeSelect} />}

      <div className="flex h-full overflow-hidden">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <div className="w-60 border-r border-cyan-precision/10 glass flex flex-col shrink-0">

          {/* Logo */}
          <div className="px-5 py-4 border-b border-cyan-precision/10">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center neon-breathe"
                style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)' }}>
                <PenTool size={14} className="text-cyan-precision" />
              </div>
              <span className="gradient-text font-bold text-sm tracking-wide">AI Blog Studio</span>
            </div>
          </div>

          {/* Mode picker */}
          <div className="p-3 space-y-1.5 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-600 px-2 mb-2">Mode</p>
            {modes.map(m => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-3',
                    active ? 'active-neon' : 'hover-neon border border-transparent text-slate-500 hover:text-slate-300'
                  )}
                >
                  <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', active ? 'bg-cyan-precision/15' : 'bg-ink-700')}>
                    <Icon size={13} className={active ? 'text-cyan-precision' : m.activeColor + ' opacity-50'} />
                  </div>
                  <div>
                    <p className={cn('text-xs font-semibold', active ? 'text-cyan-precision' : 'text-slate-400')}>{m.label}</p>
                    <p className="text-[9px] text-slate-600 mt-0.5 leading-tight">{m.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Image gallery */}
          {(mode === 'writer' || mode === 'copilot') && images.length > 0 && (
            <div className="border-t border-cyan-precision/8 p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-2 flex items-center gap-1.5">
                <ImageIcon size={10} className="text-cyan-precision/50" /> Images ({images.length})
              </p>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-auto">
                {images.map(img => (
                  <img key={img.id} src={`data:image/png;base64,${img.b64}`} alt={img.alt}
                    className="w-full rounded-lg border border-cyan-precision/10 opacity-80 hover:opacity-100 transition-opacity" />
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {(mode === 'writer' || mode === 'copilot') && (
            <div className="p-3 border-t border-cyan-precision/8 space-y-2">
              <button
                onClick={() => {
                  localStorage.removeItem('blog_editor_content');
                  localStorage.removeItem('blog_project_id');
                  localStorage.removeItem('blog_images');
                  setEditorContent(''); setProjectId(''); setImages([]); setShowPreview(false);
                  setCopilotPhase('brainstorm'); setChatMessages([]); setCopilotOutline(null);
                  setSaveStatus('idle');
                }}
                className="w-full btn-ghost rounded-xl text-xs font-medium py-2"
              >
                New Post
              </button>
              <button
                onClick={async () => { const pid = await ensureProject(); saveProject(editorContent, images, pid); }}
                className="w-full btn-ghost rounded-xl text-xs font-medium py-2 text-slate-300"
              >
                Save Draft
              </button>
            </div>
          )}
        </div>

        {/* ── Main area ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* MODE 1: Writer */}
          {mode === 'writer' && (
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                <BlogEditor
                  value={editorContent}
                  onChange={setEditorContent}
                  showPreview={showPreview}
                  onTogglePreview={() => setShowPreview(!showPreview)}
                  onInsertImage={() => setShowImageGen(!showImageGen)}
                  saveStatus={saveStatus}
                />
              </div>
              {showImageGen && (
                <div className="w-80 border-l border-cyan-precision/10 glass overflow-auto">
                  <ImageGenerator blogId={projectId} onImageGenerated={handleImageGenerated} />
                </div>
              )}
            </div>
          )}

          {/* MODE 2: Copilot */}
          {mode === 'copilot' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Phase stepper */}
              <CopilotStepper phase={copilotPhase} />

              <div className="flex-1 flex overflow-hidden">
                {/* Left: editor / outline */}
                <div className="flex-1 flex flex-col overflow-hidden">

                  {copilotPhase === 'brainstorm' && (
                    <div className="flex-1 flex items-center justify-center p-8">
                      <div className="text-center space-y-5 max-w-sm">
                        <div className="relative mx-auto w-16 h-16">
                          <div className="absolute inset-0 rounded-2xl neon-breathe"
                            style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }} />
                          <div className="relative w-full h-full flex items-center justify-center">
                            <Sparkles size={28} className="text-plasma" />
                          </div>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold gradient-text-warm">Brainstorm with AI</h3>
                          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                            Chat with the AI on the right to explore your topic. When ready, generate your structured outline.
                          </p>
                        </div>
                        <button
                          onClick={copilotGenerateOutline}
                          disabled={chatMessages.length < 2}
                          className="btn-neon px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 mx-auto disabled:opacity-40"
                        >
                          <ChevronRight size={15} /> Generate Outline
                        </button>
                      </div>
                    </div>
                  )}

                  {copilotPhase === 'outline' && copilotOutline && (
                    <div className="flex-1 overflow-auto p-5 space-y-4">
                      <div className="space-y-2">
                        <input
                          value={copilotOutline.title}
                          onChange={e => setCopilotOutline((prev: any) => ({ ...prev, title: e.target.value }))}
                          className="w-full text-lg font-semibold text-slate-100 bg-transparent border-b border-cyan-precision/15 pb-2 outline-none focus:border-cyan-precision/40 transition-colors"
                        />
                        <input
                          value={copilotOutline.subtitle || ''}
                          onChange={e => setCopilotOutline((prev: any) => ({ ...prev, subtitle: e.target.value }))}
                          placeholder="Subtitle (optional)"
                          className="w-full text-sm text-slate-500 italic bg-transparent border-b border-ink-700 pb-1.5 outline-none focus:border-cyan-precision/30 transition-colors placeholder-slate-700"
                        />
                      </div>

                      <div className="space-y-2.5">
                        {copilotOutline.sections?.map((s: any, i: number) => (
                          <div key={i} className="glass-card p-4 space-y-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-black text-cyan-precision/40 uppercase tracking-widest shrink-0 w-5">§{i+1}</span>
                              <input
                                value={s.heading}
                                onChange={e => updateOutlineSection(i, 'heading', e.target.value)}
                                className="flex-1 text-sm font-semibold text-slate-200 input-neon rounded-lg px-2.5 py-1.5"
                              />
                              <button onClick={() => removeOutlineSection(i)}
                                className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <div className="space-y-1.5 pl-7">
                              {s.bullet_points?.map((b: string, j: number) => (
                                <div key={j} className="flex items-center gap-1.5">
                                  <span className="text-cyan-precision/30 text-xs">▸</span>
                                  <input value={b} onChange={e => updateBulletPoint(i, j, e.target.value)}
                                    className="flex-1 text-xs text-slate-400 input-neon rounded-lg px-2 py-1" />
                                  <button onClick={() => removeBulletPoint(i, j)} className="text-slate-700 hover:text-red-400 transition-colors">
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                              <button onClick={() => addBulletPoint(i)}
                                className="text-[10px] text-slate-600 hover:text-cyan-precision flex items-center gap-1 mt-1 transition-colors">
                                <Plus size={10} /> Add point
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 pl-7">
                              <ImageIcon size={10} className="text-cyan-precision/40 shrink-0" />
                              <input value={s.image_suggestion || ''}
                                onChange={e => updateOutlineSection(i, 'image_suggestion', e.target.value)}
                                placeholder="Image prompt for this section..."
                                className="flex-1 text-[11px] text-cyan-precision/70 input-neon rounded-lg px-2 py-1 placeholder-slate-700" />
                            </div>
                          </div>
                        ))}
                        <button onClick={addOutlineSection}
                          className="w-full py-2.5 rounded-xl border border-dashed border-cyan-precision/15 text-xs text-slate-600 hover:text-cyan-precision hover:border-cyan-precision/30 flex items-center justify-center gap-1.5 transition-all">
                          <Plus size={12} /> Add Section
                        </button>
                      </div>

                      <div className="glass-card p-3.5 space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                          <Sparkles size={9} className="text-plasma/60" /> Refine with AI
                        </p>
                        <div className="flex gap-2">
                          <input value={outlineRefineInput} onChange={e => setOutlineRefineInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && copilotRefineOutline()}
                            placeholder="e.g. Make section 2 more technical..." disabled={outlineRefining}
                            className="flex-1 input-neon rounded-xl px-3 py-2 text-sm text-slate-200" />
                          <button onClick={copilotRefineOutline} disabled={outlineRefining || !outlineRefineInput.trim()}
                            className="px-3 py-2 btn-neon rounded-xl disabled:opacity-40">
                            {outlineRefining ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                          </button>
                        </div>
                      </div>

                      <button onClick={copilotDraftAll}
                        className="btn-neon px-6 py-2.5 rounded-xl text-sm flex items-center gap-2 w-full justify-center">
                        <Sparkles size={15} /> Draft All Sections + Generate Images
                      </button>
                    </div>
                  )}

                  {copilotPhase === 'outline' && !copilotOutline && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 size={28} className="animate-spin text-cyan-precision" />
                        <p className="text-xs text-slate-500">Building your outline...</p>
                      </div>
                    </div>
                  )}

                  {(copilotPhase === 'drafting' || copilotPhase === 'review') && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {copilotDrafting && (
                        <div className="px-4 py-2.5 border-b border-amber-500/15 flex items-center gap-2.5 text-xs text-amber-400 shrink-0"
                          style={{ background: 'rgba(245,158,11,0.05)' }}>
                          <Loader2 size={13} className="animate-spin" />
                          {copilotImageIdx !== null
                            ? <span className="flex items-center gap-1.5"><ImageIcon size={12} /> Generating all images in parallel...</span>
                            : <span>Drafting section {copilotSectionIdx + 1} of {copilotOutline?.sections?.length || 0}...</span>
                          }
                        </div>
                      )}
                      {copilotPhase === 'review' && (
                        <div className="px-4 py-2.5 border-b border-aurora/15 flex items-center gap-2.5 text-xs text-aurora shrink-0"
                          style={{ background: 'rgba(16,185,129,0.05)' }}>
                          <Check size={13} />
                          Complete — {images.length} image{images.length !== 1 ? 's' : ''} generated. Review and edit below.
                        </div>
                      )}
                      <BlogEditor
                        value={editorContent}
                        onChange={setEditorContent}
                        showPreview={showPreview}
                        onTogglePreview={() => setShowPreview(!showPreview)}
                        onInsertImage={() => setShowImageGen(!showImageGen)}
                        saveStatus={saveStatus}
                      />
                    </div>
                  )}
                </div>

                {/* Right: Chat / Images */}
                <div className="w-80 border-l border-cyan-precision/10 glass flex flex-col overflow-hidden">
                  {(copilotPhase === 'brainstorm' || copilotPhase === 'outline') && (
                    <ChatPanel
                      messages={chatMessages}
                      onMessagesChange={setChatMessages}
                      systemPrompt="You are a creative blog content strategist. Help the user brainstorm blog post ideas. Ask clarifying questions about their topic, audience, tone, and key points they want to cover. Be concise and helpful."
                      placeholder="Describe your blog idea..."
                    />
                  )}
                  {(copilotPhase === 'review' || copilotPhase === 'drafting') && (
                    <div className="flex-1 overflow-auto">
                      <div className="p-4 space-y-3">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                          <ImageIcon size={10} className="text-cyan-precision/50" /> Generated Images ({images.length})
                        </p>
                        {copilotDrafting && images.length === 0 && (
                          <div className="text-center py-10 space-y-3">
                            <Loader2 size={18} className="animate-spin text-cyan-precision mx-auto" />
                            <p className="text-xs text-slate-600">Images will appear as sections complete...</p>
                          </div>
                        )}
                        {images.map(img => (
                          <div key={img.id} className="space-y-1">
                            <img src={`data:image/png;base64,${img.b64}`} alt={img.alt}
                              className="w-full rounded-xl border border-cyan-precision/10" />
                            <p className="text-[10px] text-slate-600 truncate">{img.alt}</p>
                          </div>
                        ))}
                        {copilotPhase === 'review' && (
                          <button onClick={() => setShowImageGen(true)}
                            className="w-full text-xs py-2 rounded-xl border border-cyan-precision/12 text-slate-500 hover:text-cyan-precision hover:border-cyan-precision/25 flex items-center justify-center gap-1.5 transition-all">
                            <Plus size={12} /> Add Image Manually
                          </button>
                        )}
                        {showImageGen && <ImageGenerator blogId={projectId} onImageGenerated={handleImageGenerated} compact />}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MODE 3: Autopilot */}
          {mode === 'autopilot' && (
            <div className="flex-1 overflow-auto p-6">
              {!autoPlan ? (
                <div className="max-w-2xl mx-auto space-y-5">
                  <div className="text-center space-y-3 mb-8">
                    <div className="relative mx-auto w-16 h-16">
                      <div className="absolute inset-0 rounded-2xl neon-breathe"
                        style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }} />
                      <div className="relative w-full h-full flex items-center justify-center">
                        <Zap size={28} className="text-aurora" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold gradient-text">Autopilot Blog Generator</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Fill in your company details and we'll generate a full content calendar with polished blog posts.</p>
                  </div>

                  <div className="glass-card p-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Company Name</label>
                        <input type="text" value={autoForm.company_name} onChange={e => setAutoForm(p => ({ ...p, company_name: e.target.value }))}
                          className={inputCls} placeholder="Acme Corp" />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Target Audience</label>
                        <input type="text" value={autoForm.audience} onChange={e => setAutoForm(p => ({ ...p, audience: e.target.value }))}
                          className={inputCls} placeholder="CTOs, tech leads, startup founders" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Company Description</label>
                      <textarea value={autoForm.company_description} onChange={e => setAutoForm(p => ({ ...p, company_description: e.target.value }))} rows={3}
                        className={cn(inputCls, 'resize-none')} placeholder="We build developer tools that..." />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Blog Topics (comma-separated)</label>
                      <input type="text" value={autoForm.topics} onChange={e => setAutoForm(p => ({ ...p, topics: e.target.value }))}
                        className={inputCls} placeholder="AI, developer experience, productivity, open source" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Posts / Week</label>
                        <select value={autoForm.posts_per_week} onChange={e => setAutoForm(p => ({ ...p, posts_per_week: +e.target.value }))} className={selectCls}>
                          {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Weeks</label>
                        <select value={autoForm.weeks} onChange={e => setAutoForm(p => ({ ...p, weeks: +e.target.value }))} className={selectCls}>
                          {[1,2,3,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1.5 block">Image Provider</label>
                        <select value={autoForm.image_provider} onChange={e => setAutoForm(p => ({ ...p, image_provider: e.target.value as any }))} className={selectCls}>
                          <option value="openai">OpenAI</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <button onClick={autoGeneratePlan} disabled={autoLoading || !autoForm.company_name.trim() || !autoForm.topics.trim()}
                    className="w-full btn-neon flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-sm disabled:opacity-40">
                    {autoLoading ? <Loader2 size={16} className="animate-spin" /> : <LayoutGrid size={16} />}
                    {autoLoading ? 'Generating Plan...' : 'Generate Content Plan'}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold gradient-text flex items-center gap-2"><LayoutGrid size={18} /> Content Calendar</h3>
                      <p className="text-xs text-slate-600 mt-0.5">{autoPlan.company_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={autoGenerateAll} disabled={generatingIdx !== null}
                        className="px-4 py-2 btn-neon rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40">
                        {generatingIdx !== null ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                        Generate All
                      </button>
                      <button onClick={() => setAutoPlan(null)} className="px-4 py-2 text-xs btn-ghost rounded-xl">
                        New Plan
                      </button>
                    </div>
                  </div>
                  <ContentCalendar
                    entries={autoPlan.entries} weeks={autoPlan.weeks}
                    onGeneratePost={autoGeneratePost}
                    onViewPost={(entry) => { if (entry.blog_project_id) { setProjectId(entry.blog_project_id); setShowExport(true); } }}
                    generatingIndex={generatingIdx}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Export Button ────────────────────────────────────────── */}
      <div
        className="fixed bottom-6 right-6 z-40 transition-all duration-300"
        style={{
          opacity: showFloatingExport ? 1 : 0,
          transform: showFloatingExport ? 'translateY(0)' : 'translateY(12px)',
          pointerEvents: showFloatingExport ? 'auto' : 'none',
        }}
      >
        <button
          onClick={handleFloatingExport}
          className="btn-neon flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-bold"
          style={{ boxShadow: '0 0 32px rgba(0,229,255,0.28), 0 8px 24px rgba(0,0,0,0.4)' }}
          title="Export post (⌘E)"
        >
          <Download size={16} />
          Export
          <span className="text-[10px] font-mono opacity-50 ml-0.5">⌘E</span>
        </button>
      </div>

      {/* Export Dialog */}
      {showExport && projectId && (
        <ExportDialog projectId={projectId} onClose={() => setShowExport(false)} />
      )}
    </>
  );
}
