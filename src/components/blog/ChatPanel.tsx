import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, ChevronRight } from 'lucide-react';
import type { ChatMessage, QuestionItem } from '../../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  systemPrompt?: string;
  placeholder?: string;
  /** Called when the assistant finishes a full reply. */
  onAssistantDone?: (fullReply: string) => void;
}

const API = 'http://localhost:8000';

export function ChatPanel({ messages, onMessagesChange, systemPrompt, placeholder, onAssistantDone }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  // Per-question answer state: { [questionId]: answerText }
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Suggestions for follow-up messages ────────────────────────────────────
  const fetchSuggestions = async (msgs: ChatMessage[]) => {
    setLoadingSuggestions(true);
    try {
      const resp = await fetch(`${API}/api/blog/chat-suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs.map(m => ({ role: m.role, content: m.content })),
          system: systemPrompt || null,
        }),
      });
      const data = await resp.json();
      const suggestions: string[] = data.suggestions || [];
      if (suggestions.length > 0) {
        onMessagesChange(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], suggestions };
          return copy;
        });
      }
    } catch { /* silently ignore */ }
    finally { setLoadingSuggestions(false); }
  };

  // ── First message → structured questionnaire ──────────────────────────────
  const sendInitialMessage = async (text: string) => {
    setLoadingQuestions(true);
    const userMsg: ChatMessage = { role: 'user', content: text };
    // Show user message + loading placeholder immediately
    onMessagesChange([userMsg, { role: 'assistant', content: '' }]);
    try {
      const resp = await fetch(`${API}/api/blog/chat-initial-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_idea: text }),
      });
      const data = await resp.json();
      onMessagesChange([
        userMsg,
        { role: 'assistant', content: data.intro || '', questions: data.questions || [] },
      ]);
    } catch {
      onMessagesChange([userMsg, { role: 'assistant', content: 'Error: Could not reach the server.' }]);
    } finally {
      setLoadingQuestions(false);
    }
  };

  // ── Subsequent turns → streaming chat ─────────────────────────────────────
  const sendChatMessage = async (text: string, currentMessages: ChatMessage[]) => {
    // Strip suggestion/question metadata before sending to keep history clean
    const history = currentMessages.map(m => ({ role: m.role, content: m.content } as ChatMessage));
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...history, userMsg];
    onMessagesChange([...updated, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      const resp = await fetch(`${API}/api/blog/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          system: systemPrompt || null,
        }),
      });

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';

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
                fullReply += token;
                onMessagesChange(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: fullReply };
                  return copy;
                });
              } catch { /* skip */ }
            }
          }
        }
      }
      onAssistantDone?.(fullReply);
      await fetchSuggestions([...updated, { role: 'assistant', content: fullReply }]);
    } catch {
      onMessagesChange(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: 'Error: Could not reach the server.' };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  // ── Dispatcher ─────────────────────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || streaming || loadingQuestions) return;
    setInput('');
    if (messages.length === 0) {
      await sendInitialMessage(messageText);
    } else {
      await sendChatMessage(messageText, messages);
    }
  };

  // ── Questionnaire submit ───────────────────────────────────────────────────
  const submitAnswers = async (questions: QuestionItem[]) => {
    const lines = questions.map((q, i) => {
      const answer = questionAnswers[q.id]?.trim() || '(not answered)';
      return `${i + 1}. ${q.question}\n   ${answer}`;
    });
    const formatted = `Here are my answers:\n\n${lines.join('\n\n')}`;
    setQuestionAnswers({});
    await sendChatMessage(formatted, messages);
  };

  const setAnswer = (id: string, value: string) =>
    setQuestionAnswers(prev => ({ ...prev, [id]: value }));

  // The questionnaire is "active" when the last assistant message has questions
  const lastMsg = messages[messages.length - 1];
  const questionnaireActive =
    lastMsg?.role === 'assistant' &&
    lastMsg.questions &&
    lastMsg.questions.length > 0 &&
    !streaming;

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8">
            Start a conversation to brainstorm your blog post...
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-cyan-precision/20 flex items-center justify-center shrink-0 mt-0.5">
                <Bot size={14} className="text-cyan-precision" />
              </div>
            )}

            <div className="flex flex-col gap-3 max-w-[85%]">
              {/* Bubble — always show for user; for assistant show when there's content or it's loading */}
              {(msg.role === 'user' || msg.content || (i === messages.length - 1 && (streaming || loadingQuestions))) && (
                <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-precision/20 text-slate-200'
                    : 'bg-ink-800 text-slate-300 border border-ink-650'
                }`}>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                  {msg.role === 'assistant' && i === messages.length - 1 && (streaming || loadingQuestions) && (
                    <span className="inline-block w-1.5 h-4 bg-cyan-precision animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              )}

              {/* ── Structured questionnaire ─────────────────────────────── */}
              {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (
                <div className="flex flex-col gap-3">
                  {msg.questions.map((q) => (
                    <div
                      key={q.id}
                      className="bg-ink-900 border border-ink-650 rounded-xl p-3 flex flex-col gap-2"
                    >
                      <p className="text-xs font-semibold text-slate-300">{q.question}</p>

                      {/* Suggestion chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {q.suggestions.map((s, si) => (
                          <button
                            key={si}
                            disabled={i !== messages.length - 1 || streaming}
                            onClick={() => setAnswer(q.id, s)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              questionAnswers[q.id] === s
                                ? 'border-cyan-precision bg-cyan-precision/20 text-cyan-precision'
                                : 'border-ink-600 bg-ink-800 text-slate-400 hover:border-cyan-precision/50 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {/* Free-text input */}
                      <input
                        type="text"
                        value={questionAnswers[q.id] || ''}
                        onChange={e => setAnswer(q.id, e.target.value)}
                        disabled={i !== messages.length - 1 || streaming}
                        placeholder="Or type your own answer..."
                        className="bg-ink-950 border border-ink-650 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-precision/50 disabled:opacity-40"
                      />
                    </div>
                  ))}

                  {/* Continue button — only on the latest questionnaire */}
                  {i === messages.length - 1 && !streaming && (
                    <button
                      onClick={() => submitAnswers(msg.questions!)}
                      className="self-start flex items-center gap-1.5 px-4 py-2 bg-cyan-precision hover:bg-cyan-200 text-ink-950 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Continue <ChevronRight size={13} />
                    </button>
                  )}
                </div>
              )}

              {/* ── Follow-up suggestion chips (non-questionnaire messages) ── */}
              {msg.role === 'assistant' && !msg.questions && i === messages.length - 1 && !streaming && (
                <div className="flex flex-col gap-1.5">
                  {loadingSuggestions ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 size={11} className="animate-spin" />
                      Generating suggestions...
                    </div>
                  ) : msg.suggestions && msg.suggestions.length > 0 ? (
                    <>
                      <span className="text-xs text-slate-500">Suggested responses</span>
                      {msg.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => sendMessage(s)}
                          className="text-left text-xs px-3 py-1.5 rounded-lg border border-cyan-precision/30 bg-cyan-precision/5 text-slate-300 hover:bg-cyan-precision/15 hover:border-cyan-precision/60 transition-colors leading-relaxed"
                        >
                          {s}
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <User size={14} className="text-slate-300" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Text input — hidden while the questionnaire is awaiting answers */}
      {!questionnaireActive && (
        <div className="border-t border-ink-650 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(undefined)}
              placeholder={placeholder || 'Type a message...'}
              disabled={streaming || loadingQuestions}
              className="flex-1 bg-ink-950 border border-ink-650 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-precision/50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={streaming || loadingQuestions || !input.trim()}
              className="px-3 py-2 bg-cyan-precision hover:bg-cyan-200 disabled:bg-ink-700 disabled:text-slate-500 text-ink-950 rounded-lg transition-colors"
            >
              {(streaming || loadingQuestions) ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
