import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  FileSpreadsheet,
  Presentation,
  Trash2,
  Bot,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { useFacultyStore } from '../../store/facultyStore';
import { runDeskAgentTurn } from '../../services/deskAgentAI';

export default function DeskAgentChatPanel({ user, tokenBalance = 0, freeMode = false }) {
  const {
    messages,
    addMessage,
    updateLastAssistantMessage,
    isGenerating,
    setIsGenerating,
    activeAgentId,
    setActiveAgent,
    workspace,
    activeFile,
    setActiveArtifact,
    clearConversation,
  } = useDeskStore();

  const { faculty } = useFacultyStore();
  const currentAgent = faculty[activeAgentId] || faculty.dll;

  const [inputPrompt, setInputPrompt] = useState('');
  const [expandedSteps, setExpandedSteps] = useState({});
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const toggleSteps = (msgId) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleSendPrompt = async (customText = null) => {
    const textToSend = customText || inputPrompt;
    if (!textToSend.trim() || isGenerating) return;

    setInputPrompt('');

    // 1. Add User Message
    addMessage({
      role: 'user',
      content: textToSend.trim(),
    });

    // 2. Add Placeholder Assistant Message
    const assistantMsgId = `msg-assistant-${Date.now()}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      agentId: activeAgentId,
      content: 'Nagsisimulang maghanda ang iyong Co-Teacher...',
      steps: [{ text: 'Initiating request...', status: 'running' }],
    });

    setIsGenerating(true);

    try {
      const result = await runDeskAgentTurn({
        prompt: textToSend.trim(),
        agentId: activeAgentId,
        workspace,
        activeFile,
        user,
        tokenBalance,
        freeMode,
        onStepUpdate: (updatedSteps) => {
          updateLastAssistantMessage({ steps: updatedSteps });
        },
      });

      // Update assistant message with response and artifacts
      updateLastAssistantMessage({
        content: result.content,
        steps: result.steps,
        artifacts: result.artifact ? [result.artifact] : [],
      });

      // Automatically display artifact on canvas panel
      if (result.artifact) {
        setActiveArtifact(result.artifact);
      }
    } catch (err) {
      console.error('Agent execution error:', err);
      if (err.message === 'INSUFFICIENT_TOKENS') {
        updateLastAssistantMessage({
          content: '⚠️ Paumanhin Teacher, kinakailangan ng hindi bababa sa **2 tokens** upang maisagawa ang gawaing ito sa iyong classroom folder.\n\nPaki-click ang **Top-up / GCash** button sa kaliwa upang magpatuloy!',
          steps: [{ text: 'Insufficient token balance', status: 'error' }],
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('kt-zero-tokens'));
        }
      } else {
        updateLastAssistantMessage({
          content: `⚠️ Naka-encounter ng error: ${err.message || 'Unknown network error'}. Subukan muling magpadala ng mensahe.`,
          steps: [{ text: 'Execution halted with error', status: 'error' }],
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  const QUICK_PROMPTS = [
    { label: '✨ Week 1 DLL (Science 7)', prompt: 'Create Week 1 Daily Lesson Log for Grade 7 Science Quarter 1 based on DepEd MATATAG standards.' },
    { label: '📝 10-Item Formative Quiz', prompt: 'Generate a 10-item multiple choice formative assessment for Grade 7 Science with answer key.' },
    { label: '📊 Table of Specifications (TOS)', prompt: 'Build a DepEd-standard Table of Specifications (TOS) matrix with 60% Easy, 30% Average, 10% Difficult distribution.' },
    { label: '🖥️ 5-Slide Classroom Deck', prompt: 'Create a 5-slide classroom presentation outline about Cell Structure and Functions.' },
  ];

  return (
    <main className="flex-1 flex flex-col h-full bg-[#f8faf9] min-w-0">
      {/* Co-Teacher Header & Persona Switcher */}
      <header className="px-4 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={currentAgent.avatar}
              alt={currentAgent.customName || currentAgent.defaultName}
              className="w-10 h-10 rounded-full border-2 border-emerald-500 shadow-sm object-cover bg-emerald-50"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-gray-900">
                {currentAgent.customName || currentAgent.defaultName}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {currentAgent.role}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate max-w-sm">
              {currentAgent.tagline || 'AI Co-Teacher ready to assist in your classroom folder'}
            </p>
          </div>
        </div>

        {/* Persona quick buttons */}
        <div className="flex items-center gap-1.5">
          <div className="hidden lg:flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200">
            {Object.values(faculty).slice(0, 4).map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveAgent(f.id)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                  activeAgentId === f.id
                    ? 'bg-white text-emerald-800 shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {f.customName || f.defaultName}
              </button>
            ))}
          </div>

          <button
            onClick={clearConversation}
            title="Clear Chat History"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* Conversation Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const msgAgent = faculty[msg.agentId] || currentAgent;
          const isStepsOpen = expandedSteps[msg.id] ?? (isGenerating && isAssistant);

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${
                isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
              }`}
            >
              {/* Avatar */}
              {isAssistant ? (
                <img
                  src={msgAgent.avatar}
                  alt={msgAgent.customName || msgAgent.defaultName}
                  className="w-8 h-8 rounded-full border border-emerald-300 shadow-xs flex-shrink-0 bg-emerald-50"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : 'T'}
                </div>
              )}

              {/* Message Content Container */}
              <div
                className={`flex-1 rounded-xl p-3.5 shadow-xs border ${
                  isAssistant
                    ? 'bg-white border-gray-200 text-gray-800'
                    : 'bg-[#2d6a4f] text-white border-emerald-800'
                }`}
              >
                {/* Antigravity Step Progression Card for Assistant */}
                {isAssistant && msg.steps && msg.steps.length > 0 && (
                  <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50/80 overflow-hidden text-xs">
                    <button
                      onClick={() => toggleSteps(msg.id)}
                      className="w-full px-3 py-2 flex items-center justify-between text-gray-600 hover:bg-gray-100/80 transition font-medium"
                    >
                      <div className="flex items-center gap-2">
                        {isGenerating && msg.steps.some((s) => s.status === 'running') ? (
                          <Loader2 size={13} className="animate-spin text-emerald-600" />
                        ) : (
                          <CheckCircle2 size={13} className="text-emerald-600" />
                        )}
                        <span>
                          {msg.steps.filter((s) => s.status === 'done').length} of {msg.steps.length} steps completed
                        </span>
                      </div>
                      {isStepsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {isStepsOpen && (
                      <div className="px-3 pb-2.5 pt-1 border-t border-gray-200/60 space-y-1.5">
                        {msg.steps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[11px] text-gray-600">
                            {step.status === 'done' ? (
                              <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />
                            ) : step.status === 'error' ? (
                              <AlertCircle size={12} className="text-rose-500 flex-shrink-0" />
                            ) : (
                              <Loader2 size={12} className="animate-spin text-amber-500 flex-shrink-0" />
                            )}
                            <span className={step.status === 'running' ? 'font-medium text-gray-900' : ''}>
                              {step.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Body */}
                <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {msg.content}
                </div>

                {/* Artifact Action Pills */}
                {isAssistant && msg.artifacts && msg.artifacts.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-2">
                    {msg.artifacts.map((art) => (
                      <button
                        key={art.id}
                        onClick={() => setActiveArtifact(art)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                      >
                        {art.type === 'slides' ? (
                          <Presentation size={14} className="text-amber-600" />
                        ) : art.type === 'quiz' ? (
                          <FileSpreadsheet size={14} className="text-blue-600" />
                        ) : (
                          <FileText size={14} className="text-emerald-600" />
                        )}
                        <span>{art.title}</span>
                        <ExternalLink size={11} className="opacity-60" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Pills */}
      <div className="px-4 py-2 border-t border-gray-100 bg-white/70 overflow-x-auto flex items-center gap-2">
        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-600 flex-shrink-0">
          Suggested:
        </span>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSendPrompt(qp.prompt)}
            disabled={isGenerating}
            className="px-2.5 py-1 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-800 text-gray-600 text-[11px] font-medium rounded-full border border-gray-200 hover:border-emerald-300 transition whitespace-nowrap flex-shrink-0 disabled:opacity-50"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Bottom Prompt Input */}
      <div className="p-3 bg-white border-t border-gray-200 shadow-md">
        <div className="relative flex items-center bg-gray-50 border border-gray-300 rounded-xl focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 focus-within:bg-white transition p-1.5">
          <textarea
            rows={2}
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${currentAgent.customName || currentAgent.defaultName} to create a lesson, quiz, or update a file... (Enter to send)`}
            disabled={isGenerating}
            className="w-full bg-transparent text-gray-800 text-xs px-2 py-1 resize-none focus:outline-none placeholder-gray-400"
          />

          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            <button
              onClick={() => handleSendPrompt()}
              disabled={isGenerating || !inputPrompt.trim()}
              className="p-2 bg-[#2d6a4f] hover:bg-[#235841] text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center gap-1.5 font-medium text-xs"
            >
              {isGenerating ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  <Send size={14} />
                  <span className="hidden sm:inline">Send · 2🪙</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
