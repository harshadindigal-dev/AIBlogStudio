import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import {
  PenTool, Users, Zap, Download, Plus, Loader2,
  ChevronRight, Sparkles, LayoutGrid, ImageIcon,
  Send, Trash2, Check,
} from 'lucide-react';
import { cn } from '../../utils';
import { BlogEditor } from './BlogEditor';
import { ImageGenerator } from './ImageGenerator';
import { ChatPanel } from './ChatPanel';
import { ContentCalendar } from './ContentCalendar';
import { ExportDialog } from './ExportDialog';
import type { BlogMode, BlogImage, ChatMessage, PlanEntry, ContentPlan } from '../../types';

const API = 'http://localhost:8000';

const modes: { id: BlogMode; label: string; desc: string; icon: any }[] = [
  { id: 'writer',    label: 'Writer',    desc: 'You write, AI generates images inline', icon: PenTool },
  { id: 'copilot',   label: 'Co-pilot',  desc: 'AI brainstorms, outlines & drafts with you', icon: Users },
  { id: 'autopilot', label: 'Autopilot', desc: 'Fully automated content planning & generation', icon: Zap },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BlogStudio() {
  const [mode, setMode] = useState<BlogMode>('writer');
  const [showExport, setShowExport] = useState(false);
  const [projectId, setProjectId] = useState<string>(
    () => localStorage.getItem('blog_project_id') || ''
  );

  // ── Writer state ──────────────────────────────────────────────────────
  const [editorContent, setEditorContent] = useState<string>(
    () => localStorage.getItem('blog_editor_content') || ''
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [images, setImages] = useState<BlogImage[]>(
    () => { try { return JSON.parse(localStorage.getItem('blog_images') || '[]'); } catch { return []; } }
  );

  // Persist to localStorage whenever these change
  useEffect(() => { localStorage.setItem('blog_editor_content', editorContent); }, [editorContent]);
  useEffect(() => { localStorage.setItem('blog_project_id', projectId); }, [projectId]);
  useEffect(() => { localStorage.setItem('blog_images', JSON.stringify(images)); }, [images]);

  // ── Copilot state ─────────────────────────────────────────────────────
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

  // ── Autopilot state ───────────────────────────────────────────────────
  const [autoForm, setAutoForm] = useState({
    company_name: '', company_description: '', topics: '', audience: '',
    posts_per_week: 2, weeks: 4, image_provider: 'openai' as 'openai' | 'gemini',
  });
  const [autoPlan, setAutoPlan] = useState<ContentPlan | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────

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

  const handleImageGenerated = (img: BlogImage) => {
    setImages(prev => [...prev, img]);
    const imgSrc = img.url || `data:image/png;base64,${img.b64}`;
    setEditorContent(prev => prev + `\n\n![${img.alt}](${imgSrc})\n\n`);
    setShowImageGen(false);
  };

  // ── Copilot: generate outline from chat context ────────────────────────

  const copilotGenerateOutline = async () => {
    const chatContext = chatMessages.map(m => `${m.role}: ${m.content}`).join('\n');
    setCopilotPhase('outline');
    try {
      const { data } = await axios.post(`${API}/api/blog/outline`, {
        topic: chatContext.slice(-2000),
        audience: '',
        tone: 'professional',
        num_sections: 5,
      });
      setCopilotOutline(data.outline);
    } catch {
      setCopilotOutline(null);
    }
  };

  // ── Copilot: outline editing helpers ────────────────────────────────────

  const updateOutlineSection = (idx: number, field: string, value: any) => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[idx] = { ...sections[idx], [field]: value };
      return { ...prev, sections };
    });
  };

  const updateBulletPoint = (sectionIdx: number, bulletIdx: number, value: string) => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || [])];
      bullets[bulletIdx] = value;
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });
  };

  const addBulletPoint = (sectionIdx: number) => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || []), ''];
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });
  };

  const removeBulletPoint = (sectionIdx: number, bulletIdx: number) => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const bullets = [...(sections[sectionIdx].bullet_points || [])];
      bullets.splice(bulletIdx, 1);
      sections[sectionIdx] = { ...sections[sectionIdx], bullet_points: bullets };
      return { ...prev, sections };
    });
  };

  const addOutlineSection = () => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: [...prev.sections, { heading: 'New Section', bullet_points: [''], image_suggestion: '' }],
      };
    });
  };

  const removeOutlineSection = (idx: number) => {
    setCopilotOutline((prev: any) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections.splice(idx, 1);
      return { ...prev, sections };
    });
  };

  const copilotRefineOutline = async () => {
    if (!outlineRefineInput.trim() || !copilotOutline) return;
    setOutlineRefining(true);
    try {
      const { data } = await axios.post(`${API}/api/blog/refine-outline`, {
        outline: copilotOutline,
        feedback: outlineRefineInput,
      });
      setCopilotOutline(data.outline);
      setOutlineRefineInput('');
    } catch {
      // keep existing outline on error
    } finally {
      setOutlineRefining(false);
    }
  };

  // ── Copilot: draft all sections + auto-generate images ─────────────────

  const copilotDraftAll = async () => {
    if (!copilotOutline) return;
    setCopilotPhase('drafting');
    setCopilotDrafting(true);
    const pid = await ensureProject();
    let fullContent = `# ${copilotOutline.title}\n\n`;
    if (copilotOutline.subtitle) fullContent += `*${copilotOutline.subtitle}*\n\n`;

    // ── Phase 1: stream all section text, leaving image placeholders ──────
    for (let i = 0; i < copilotOutline.sections.length; i++) {
      setCopilotSectionIdx(i);
      const section = copilotOutline.sections[i];
      fullContent += `## ${section.heading}\n\n`;

      const resp = await fetch(`${API}/api/blog/draft-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heading: section.heading,
          bullet_points: section.bullet_points || [],
          context: `Blog title: ${copilotOutline.title}`,
          tone: 'professional',
          word_count: 300,
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
              try {
                const { token } = JSON.parse(payload);
                fullContent += token;
                setEditorContent(fullContent);
              } catch {}
            }
          }
        }
      }
      fullContent += '\n\n';
      // Drop a placeholder where this section's image will go (never on the last section)
      const isLastSection = i === copilotOutline.sections.length - 1;
      if (section.image_suggestion && !isLastSection) {
        fullContent += `![Generating image for ${section.heading}...](IMG_PLACEHOLDER_${i})\n\n`;
      }
      setEditorContent(fullContent);
    }

    // ── Phase 2: generate all images in parallel ───────────────────────
    setCopilotImageIdx(0);
    const sectionsWithImages = copilotOutline.sections
      .map((s: any, i: number) => ({ section: s, idx: i }))
      .filter(({ section }: any) => section.image_suggestion);

    const imageResults = await Promise.allSettled(
      sectionsWithImages.map(({ section, idx }: any) =>
        axios.post(`${API}/api/blog/generate-image`, {
          prompt: section.image_suggestion,
          provider: 'openai',
          size: '1536x1024',
          quality: 'medium',
          blog_id: pid,
        }).then(({ data }) => ({ section, idx, data }))
      )
    );

    // ── Phase 3: replace placeholders with real image URLs ─────────────
    const generatedImages: BlogImage[] = [];
    for (const result of imageResults) {
      if (result.status === 'fulfilled') {
        const { section, idx, data } = result.value;
        const img: BlogImage = {
          id: data.image_id, prompt: data.prompt, provider: data.provider,
          b64: data.b64,
          url: `${API}/blog-assets/${pid}/${data.image_id}.png`,
          alt: section.heading,
        };
        generatedImages.push(img);
        fullContent = fullContent.replace(
          `![Generating image for ${section.heading}...](IMG_PLACEHOLDER_${idx})`,
          `![](${API}/blog-assets/${pid}/${data.image_id}.png)`
        );
      }
    }
    // Clean up any remaining placeholders from failed images
    fullContent = fullContent.replace(/!\[[^\]]*\]\(IMG_PLACEHOLDER_\d+\)\n\n/g, '');
    setImages(generatedImages);
    setEditorContent(fullContent);

    setCopilotDrafting(false);
    setCopilotImageIdx(null);
    setCopilotPhase('review');
    setShowPreview(true);
    saveProject(fullContent, generatedImages, pid);
  };

  // ── Autopilot: plan + generate ─────────────────────────────────────────

  const autoGeneratePlan = async () => {
    setAutoLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/blog/auto-plan`, {
        company_name: autoForm.company_name,
        company_description: autoForm.company_description,
        topics: autoForm.topics.split(',').map(t => t.trim()).filter(Boolean),
        audience: autoForm.audience,
        posts_per_week: autoForm.posts_per_week,
        weeks: autoForm.weeks,
      });
      setAutoPlan(data.plan);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to generate plan');
    } finally {
      setAutoLoading(false);
    }
  };

  const autoGeneratePost = async (entry: PlanEntry, index: number) => {
    if (!autoPlan) return;
    setGeneratingIdx(index);
    try {
      const { data } = await axios.post(`${API}/api/blog/auto-generate`, {
        entry,
        company_name: autoPlan.company_name,
        audience: autoForm.audience,
        image_provider: autoForm.image_provider,
      });
      // Update entry status
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
    } finally {
      setGeneratingIdx(null);
    }
  };

  const autoGenerateAll = async () => {
    if (!autoPlan) return;
    for (let i = 0; i < autoPlan.entries.length; i++) {
      if (autoPlan.entries[i].status === 'planned') {
        await autoGeneratePost(autoPlan.entries[i], i);
      }
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Sidebar: Mode Picker ────────────────────────────────────── */}
      <div className="w-56 border-r border-ink-650 bg-ink-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-ink-650">
          <h2 className="font-bold text-slate-200 flex items-center gap-2 text-sm">
            <PenTool size={16} className="text-cyan-precision" />
            Blog Studio
          </h2>
        </div>
        <div className="p-3 space-y-1">
          {modes.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center gap-2.5",
                  mode === m.id
                    ? "bg-cyan-precision/10 text-cyan-precision border border-cyan-precision/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-ink-800"
                )}
              >
                <Icon size={16} />
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-[10px] opacity-60">{m.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Image gallery (Writer + Copilot modes) */}
        {(mode === 'writer' || mode === 'copilot') && images.length > 0 && (
          <div className="mt-auto border-t border-ink-650 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <ImageIcon size={12} /> Generated Images ({images.length})
            </p>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-auto">
              {images.map(img => (
                <img key={img.id} src={`data:image/png;base64,${img.b64}`} alt={img.alt} className="w-full rounded border border-ink-650" />
              ))}
            </div>
          </div>
        )}

        {/* Export + Save */}
        {(mode === 'writer' || mode === 'copilot') && (
          <div className="p-3 border-t border-ink-650 space-y-2">
            <button
              onClick={() => {
                localStorage.removeItem('blog_editor_content');
                localStorage.removeItem('blog_project_id');
                localStorage.removeItem('blog_images');
                setEditorContent('');
                setProjectId('');
                setImages([]);
                setShowPreview(false);
                setCopilotPhase('brainstorm');
                setChatMessages([]);
                setCopilotOutline(null);
              }}
              className="w-full text-xs font-medium py-2 bg-ink-800 text-slate-400 border border-ink-650 rounded-lg hover:bg-ink-700 transition-colors"
            >
              New Post
            </button>
            <button
              onClick={async () => { const pid = await ensureProject(); saveProject(editorContent, images, pid); }}
              className="w-full text-xs font-medium py-2 bg-ink-800 text-slate-300 border border-ink-650 rounded-lg hover:bg-ink-700 transition-colors"
            >
              Save Draft
            </button>
            <button
              onClick={async () => { const pid = await ensureProject(); await saveProject(editorContent, images, pid); setShowExport(true); }}
              disabled={!editorContent.trim()}
              className="w-full text-xs font-medium py-2 bg-cyan-precision/10 text-cyan-precision border border-cyan-precision/30 rounded-lg hover:bg-cyan-precision/20 disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
            >
              <Download size={14} /> Export
            </button>
          </div>
        )}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────────── */}
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
              />
            </div>
            {showImageGen && (
              <div className="w-80 border-l border-ink-650 bg-ink-900 overflow-auto">
                <ImageGenerator blogId={projectId} onImageGenerated={handleImageGenerated} />
              </div>
            )}
          </div>
        )}

        {/* MODE 2: Copilot */}
        {mode === 'copilot' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {copilotPhase === 'brainstorm' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4 max-w-md">
                    <Sparkles size={40} className="text-cyan-precision mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-200">Brainstorm with AI</h3>
                    <p className="text-sm text-slate-400">
                      Use the chat panel on the right to discuss your blog topic.
                      When you're ready, click "Generate Outline" below.
                    </p>
                    <button
                      onClick={copilotGenerateOutline}
                      disabled={chatMessages.length < 2}
                      className="px-6 py-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 mx-auto"
                    >
                      <ChevronRight size={16} /> Generate Outline
                    </button>
                  </div>
                </div>
              )}

              {copilotPhase === 'outline' && copilotOutline && (
                <div className="flex-1 overflow-auto p-6 space-y-4">
                  {/* Editable title & subtitle */}
                  <input
                    value={copilotOutline.title}
                    onChange={e => setCopilotOutline((prev: any) => ({ ...prev, title: e.target.value }))}
                    className="w-full text-lg font-semibold text-slate-200 bg-transparent border-b border-ink-650 pb-1 outline-none focus:border-cyan-precision/50"
                  />
                  <input
                    value={copilotOutline.subtitle || ''}
                    onChange={e => setCopilotOutline((prev: any) => ({ ...prev, subtitle: e.target.value }))}
                    placeholder="Subtitle (optional)"
                    className="w-full text-sm text-slate-400 italic bg-transparent border-b border-ink-650 pb-1 outline-none focus:border-cyan-precision/50"
                  />

                  {/* Editable sections */}
                  <div className="space-y-3">
                    {copilotOutline.sections?.map((s: any, i: number) => (
                      <div key={i} className="border border-ink-650 rounded-lg p-4 bg-ink-850 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">§{i + 1}</span>
                          <input
                            value={s.heading}
                            onChange={e => updateOutlineSection(i, 'heading', e.target.value)}
                            className="flex-1 text-sm font-semibold text-slate-200 bg-ink-900 border border-ink-650 rounded px-2 py-1 outline-none focus:border-cyan-precision/50"
                          />
                          <button
                            onClick={() => removeOutlineSection(i)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove section"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Editable bullet points */}
                        <div className="space-y-1 pl-4">
                          {s.bullet_points?.map((b: string, j: number) => (
                            <div key={j} className="flex items-center gap-1.5">
                              <span className="text-slate-600 text-xs">•</span>
                              <input
                                value={b}
                                onChange={e => updateBulletPoint(i, j, e.target.value)}
                                className="flex-1 text-xs text-slate-400 bg-ink-900 border border-ink-650 rounded px-2 py-0.5 outline-none focus:border-cyan-precision/50"
                              />
                              <button onClick={() => removeBulletPoint(i, j)} className="text-slate-600 hover:text-red-400 transition-colors">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addBulletPoint(i)}
                            className="text-[10px] text-slate-500 hover:text-cyan-precision flex items-center gap-1 mt-1 transition-colors"
                          >
                            <Plus size={10} /> Add point
                          </button>
                        </div>

                        {/* Editable image suggestion */}
                        <div className="flex items-center gap-1.5 pl-4">
                          <ImageIcon size={10} className="text-cyan-precision/60 shrink-0" />
                          <input
                            value={s.image_suggestion || ''}
                            onChange={e => updateOutlineSection(i, 'image_suggestion', e.target.value)}
                            placeholder="Image suggestion for this section..."
                            className="flex-1 text-[11px] text-cyan-precision/80 bg-ink-900 border border-ink-650 rounded px-2 py-0.5 outline-none focus:border-cyan-precision/50 placeholder-slate-600"
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={addOutlineSection}
                      className="w-full py-2 border border-dashed border-ink-650 rounded-lg text-xs text-slate-500 hover:text-cyan-precision hover:border-cyan-precision/30 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus size={12} /> Add Section
                    </button>
                  </div>

                  {/* AI refinement input */}
                  <div className="border border-ink-650 rounded-lg p-3 bg-ink-900 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Sparkles size={10} /> Refine with AI
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={outlineRefineInput}
                        onChange={e => setOutlineRefineInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && copilotRefineOutline()}
                        placeholder="e.g. Make section 2 more technical, add a section about pricing..."
                        disabled={outlineRefining}
                        className="flex-1 bg-ink-950 border border-ink-650 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-precision/50"
                      />
                      <button
                        onClick={copilotRefineOutline}
                        disabled={outlineRefining || !outlineRefineInput.trim()}
                        className="px-3 py-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 rounded-lg transition-colors"
                      >
                        {outlineRefining ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={copilotDraftAll}
                    className="px-6 py-2 bg-cyan-precision hover:bg-cyan-200 text-ink-950 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                  >
                    <ChevronRight size={16} /> Draft All Sections + Generate Images
                  </button>
                </div>
              )}

              {(copilotPhase === 'drafting' || copilotPhase === 'review') && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {copilotDrafting && (
                    <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-800/30 flex items-center gap-2 text-xs text-amber-400 shrink-0">
                      <Loader2 size={14} className="animate-spin" />
                      {copilotImageIdx !== null ? (
                        <span className="flex items-center gap-1">
                          <ImageIcon size={12} /> Generating all images in parallel...
                        </span>
                      ) : (
                        <span>Drafting section {copilotSectionIdx + 1} of {copilotOutline?.sections?.length || 0}...</span>
                      )}
                    </div>
                  )}
                  {copilotPhase === 'review' && (
                    <div className="px-4 py-2 bg-emerald-950/30 border-b border-emerald-800/30 flex items-center gap-2 text-xs text-emerald-400 shrink-0">
                      <Check size={14} />
                      Blog post complete with {images.length} generated image{images.length !== 1 ? 's' : ''}. Review and edit below.
                    </div>
                  )}
                  <BlogEditor
                    value={editorContent}
                    onChange={setEditorContent}
                    showPreview={showPreview}
                    onTogglePreview={() => setShowPreview(!showPreview)}
                    onInsertImage={() => setShowImageGen(!showImageGen)}
                  />
                </div>
              )}

              {copilotPhase === 'outline' && !copilotOutline && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-cyan-precision" />
                </div>
              )}
            </div>

            {/* Right: Chat / Image gen */}
            <div className="w-80 border-l border-ink-650 bg-ink-900 flex flex-col overflow-hidden">
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <ImageIcon size={12} /> Generated Images ({images.length})
                    </p>
                    {copilotDrafting && images.length === 0 && (
                      <div className="text-center py-8 space-y-2">
                        <Loader2 size={20} className="animate-spin text-cyan-precision mx-auto" />
                        <p className="text-xs text-slate-500">Images will appear here as sections are drafted...</p>
                      </div>
                    )}
                    {images.map(img => (
                      <div key={img.id} className="space-y-1">
                        <img src={`data:image/png;base64,${img.b64}`} alt={img.alt} className="w-full rounded-lg border border-ink-650" />
                        <p className="text-[10px] text-slate-500 truncate">{img.alt}</p>
                      </div>
                    ))}
                    {copilotPhase === 'review' && (
                      <button
                        onClick={() => setShowImageGen(true)}
                        className="w-full text-xs py-2 border border-ink-650 text-slate-400 rounded-lg hover:bg-ink-800 flex items-center justify-center gap-1"
                      >
                        <Plus size={12} /> Add Image Manually
                      </button>
                    )}
                    {showImageGen && (
                      <ImageGenerator blogId={projectId} onImageGenerated={handleImageGenerated} compact />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE 3: Autopilot */}
        {mode === 'autopilot' && (
          <div className="flex-1 overflow-auto p-6">
            {!autoPlan ? (
              /* Onboarding form */
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2 mb-8">
                  <Zap size={36} className="text-cyan-precision mx-auto" />
                  <h3 className="text-xl font-bold text-slate-200">Autopilot Blog Generator</h3>
                  <p className="text-sm text-slate-400">Fill in your company details and we'll generate a full content calendar with polished blog posts.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Company Name</label>
                    <input type="text" value={autoForm.company_name} onChange={e => setAutoForm(p => ({ ...p, company_name: e.target.value }))}
                      className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-precision/50" placeholder="Acme Corp" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Target Audience</label>
                    <input type="text" value={autoForm.audience} onChange={e => setAutoForm(p => ({ ...p, audience: e.target.value }))}
                      className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-precision/50" placeholder="CTOs, tech leads, startup founders" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Company Description</label>
                  <textarea value={autoForm.company_description} onChange={e => setAutoForm(p => ({ ...p, company_description: e.target.value }))} rows={3}
                    className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-precision/50 resize-none" placeholder="We build developer tools that..." />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Blog Topics (comma-separated)</label>
                  <input type="text" value={autoForm.topics} onChange={e => setAutoForm(p => ({ ...p, topics: e.target.value }))}
                    className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-precision/50" placeholder="AI, developer experience, productivity, open source" />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Posts / Week</label>
                    <select value={autoForm.posts_per_week} onChange={e => setAutoForm(p => ({ ...p, posts_per_week: +e.target.value }))}
                      className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none">
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Weeks</label>
                    <select value={autoForm.weeks} onChange={e => setAutoForm(p => ({ ...p, weeks: +e.target.value }))}
                      className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none">
                      {[1,2,3,4,6,8].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">Image Provider</label>
                    <select value={autoForm.image_provider} onChange={e => setAutoForm(p => ({ ...p, image_provider: e.target.value as any }))}
                      className="w-full bg-ink-950 border border-ink-650 rounded-lg px-3 py-2.5 text-sm text-slate-200 outline-none">
                      <option value="openai">OpenAI</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={autoGeneratePlan}
                  disabled={autoLoading || !autoForm.company_name.trim() || !autoForm.topics.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 px-6 py-3 rounded-lg font-bold text-sm transition-colors"
                >
                  {autoLoading ? <Loader2 size={16} className="animate-spin" /> : <LayoutGrid size={16} />}
                  {autoLoading ? 'Generating Plan...' : 'Generate Content Plan'}
                </button>
              </div>
            ) : (
              /* Content Calendar */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                    <LayoutGrid size={20} className="text-cyan-precision" />
                    Content Calendar — {autoPlan.company_name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={autoGenerateAll}
                      disabled={generatingIdx !== null}
                      className="px-4 py-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 rounded-lg font-bold text-xs transition-colors flex items-center gap-1"
                    >
                      {generatingIdx !== null ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                      Generate All
                    </button>
                    <button
                      onClick={() => setAutoPlan(null)}
                      className="px-4 py-2 text-xs font-medium text-slate-400 border border-ink-650 rounded-lg hover:bg-ink-800"
                    >
                      New Plan
                    </button>
                  </div>
                </div>

                <ContentCalendar
                  entries={autoPlan.entries}
                  weeks={autoPlan.weeks}
                  onGeneratePost={autoGeneratePost}
                  onViewPost={(entry) => {
                    if (entry.blog_project_id) {
                      setProjectId(entry.blog_project_id);
                      setShowExport(true);
                    }
                  }}
                  generatingIndex={generatingIdx}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Dialog */}
      {showExport && projectId && (
        <ExportDialog projectId={projectId} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
