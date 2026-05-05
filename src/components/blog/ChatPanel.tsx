import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, ChevronRight } from 'lucide-react';
import type { ChatMessage, QuestionItem } from '../../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  systemPrompt?: string;
  placeholder?: string;
  onAssistantDone?: (fullReply: string) => void;
}

const API = 'http://localhost:8000';

export function ChatPanel({ messages, onMessagesChange, systemPrompt, placeholder, onAssistantDone }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    } catch { }
    finally { setLoadingSuggestions(false); }
  };

  const sendInitialMessage = async (text: string) => {
    setLoadingQuestions(true);
    const userMsg: ChatMessage = { role: 'user', content: text };
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

  const sendChatMessage = async (text: string, currentMessages: ChatMessage[]) => {
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
              } catch { }
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

  const lastMsg = messages[messages.length - 1];
  const questionnaireActive =
    lastMsg?.role === 'assistant' &&
    lastMsg.questions &&
    lastMsg.questions.length > 0 &&
    !streaming;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cyan-precision/10 shrink-0">
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
          <Bot size={10} className="text-cyan-precision/50" /> AI Assistant
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.12)' }}>
              <Bot size={18} className="text-cyan-precision/50" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">Describe your blog idea to get started...</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.18)' }}>
                <Bot size={13} className="text-cyan-precision" />
              </div>
            )}

            <div className="flex flex-col gap-2.5 max-w-[85%]">
              {(msg.role === 'user' || msg.content || (i === messages.length - 1 && (streaming || loadingQuestions))) && (
                <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-slate-100 border border-cyan-precision/20'
                    : 'glass-card text-slate-300'
                }`}
                style={msg.role === 'user' ? { background: 'rgba(0,229,255,0.08)' } : {}}>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                  {msg.role === 'assistant' && i === messages.length - 1 && (streaming || loadingQuestions) && (
                    <span className="cursor-blink" />
                  )}
                </div>
              )}

              {/* Questionnaire */}
              {msg.role === 'assistant' && msg.questions && msg.questions.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {msg.questions.map((q) => (
                    <div key={q.id} className="glass-card p-3 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-slate-300">{q.question}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.suggestions.map((s, si) => (
                          <button
                            key={si}
                            disabled={i !== messages.length - 1 || streaming}
                            onClick={() => setAnswer(q.id, s)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                              questionAnswers[q.id] === s
                                ? 'border-cyan-precision/50 text-cyan-precision glow-cyan-sm'
                                : 'border-ink-700 text-slate-500 hover:border-cyan-precision/25 hover:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed'
                            }`}
                            style={questionAnswers[q.id] === s ? { background: 'rgba(0,229,255,0.08)' } : { background: 'rgba(2,8,16,0.5)' }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={questionAnswers[q.id] || ''}
                        onChange={e => setAnswer(q.id, e.target.value)}
                        disabled={i !== messages.length - 1 || streaming}
                        placeholder="Or type your own answer..."
                        className="input-neon rounded-lg px-3 py-1.5 text-xs text-slate-200 w-full disabled:opacity-40"
                      />
                    </div>
                  ))}

                  {i === messages.length - 1 && !streaming && (
                    <button
                      onClick={() => submitAnswers(msg.questions!)}
                      className="self-start btn-neon flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs"
                    >
                      Continue <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Follow-up chips */}
              {msg.role === 'assistant' && !msg.questions && i === messages.length - 1 && !streaming && (
                <div className="flex flex-col gap-1.5">
                  {loadingSuggestions ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Loader2 size={10} className="animate-spin" />
                      Generating suggestions...
                    </div>
                  ) : msg.suggestions && msg.suggestions.length > 0 ? (
                    <>
                      <span className="text-[9px] uppercase tracking-widest text-slate-700 font-bold">Suggested</span>
                      {msg.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => sendMessage(s)}
                          className="text-left text-xs px-3 py-2 rounded-xl border border-cyan-precision/12 text-slate-400 hover:text-slate-200 hover:border-cyan-precision/28 transition-all leading-relaxed"
                          style={{ background: 'rgba(0,229,255,0.03)' }}
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
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-ink-700 border border-ink-600">
                <User size={12} className="text-slate-400" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!questionnaireActive && (
        <div className="border-t border-cyan-precision/10 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(undefined)}
              placeholder={placeholder || 'Type a message...'}
              disabled={streaming || loadingQuestions}
              className="flex-1 input-neon rounded-xl px-3 py-2 text-sm text-slate-200"
            />
            <button
              onClick={() => sendMessage()}
              disabled={streaming || loadingQuestions || !input.trim()}
              className="px-3 py-2 btn-neon rounded-xl disabled:opacity-40"
            >
              {(streaming || loadingQuestions) ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
