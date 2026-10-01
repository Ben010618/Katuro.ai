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
  AlertCircle,
  ExternalLink,
  PanelLeftOpen,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { runDeskAgentTurn } from '../../services/deskAgentAI';
import DeskFormattedText from './DeskFormattedText';

export default function DeskAgentChatPanel({
  user,
  tokenBalance = 0,
  freeMode = false,
  onOpenCanvas,
  onToggleLeftPanel,
  showLeftPanel,
}) {
  const {
    messages,
    addMessage,
    updateLastAssistantMessage,
    isGenerating,
    setIsGenerating,
    workspace,
    activeFile,
    setActiveArtifact,
    clearConversation,
  } = useDeskStore();

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
    const assistantMsgId = `msg-assistant-${messages.length + 1}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      agentId: 'katuro_assistant',
      content: 'Nagsisimulang magsuri at maghanda ang iyong KaTuro Assistant...',
      steps: [{ text: 'Initiating request...', status: 'running' }],
    });

    setIsGenerating(true);

    try {
      const result = await runDeskAgentTurn({
        prompt: textToSend.trim(),
        agentId: 'katuro_assistant',
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
        onOpenCanvas?.();
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
    {
      label: '📊 Quiz Item Analysis & LMC',
      prompt: "Analyze our latest quiz scores. Identify the Least Mastered Competencies (LMC), calculate the mastery percentage, and generate the official DepEd Item Analysis remarks.",
    },
    {
      label: '🎯 Remediation & Re-test Slip',
      prompt: "For the learners who scored below 75% on our recent assessment, create a 1-page Remedial Practice Slip and a 5-item Quick Re-test ready for 2-up printing.",
    },
    {
      label: '📑 Encode to e-Class Record',
      prompt: "Interpret these recent formative and summative scores and map them into the DepEd e-Class Record format (Written Works & Performance Tasks) with transmutation.",
    },
    {
      label: '🚨 Check Attendance & SARDO',
      prompt: "Review the attendance records in this folder. Flag any students with 3 or more consecutive absences and generate a DepEd Home Visitation Notice for them.",
    },
    {
      label: '📁 Synthesize Docs into Subfolder',
      prompt: "Study 'Week 1 - Cell Theory.docx' and 'Q1_Summative_Test_1_with_TOS.docx', create a new subfolder named 'Remediation_Week1', and generate the differentiated remedial package inside it.",
    },
  ];

  return (
    <main className="flex-1 flex flex-col h-full bg-[#f8faf9] min-w-0">
      {/* KaTuro Teaching Assistant Header */}
      <header className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between shadow-2xs z-10">
        <div className="flex items-center gap-3">
          {!showLeftPanel && onToggleLeftPanel && (
            <button
              onClick={onToggleLeftPanel}
              title="Open Classroom Folder Explorer"
              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-md transition"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-xs">
            <Sparkles size={18} className="text-emerald-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-gray-900">
                KaTuro Teaching Assistant
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Co-Teacher Studio
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate max-w-md">
              Manipulate, analyze, encode & check classroom documents across your active folder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={clearConversation}
            title="Clear Chat History"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition flex items-center gap-1 text-xs"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        </div>
      </header>

      {/* Conversation Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto w-full space-y-4">
          {messages.map((msg) => {
            const isAssistant = msg.role === 'assistant';
            const isStepsOpen = expandedSteps[msg.id] ?? (isGenerating && isAssistant);

            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
                }`}
              >
                {/* Assistant Badge vs User Avatar */}
                {isAssistant ? (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center flex-shrink-0 shadow-xs border border-emerald-600">
                    <Sparkles size={14} className="text-emerald-200" />
                  </div>
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
                  {isAssistant ? (
                    <DeskFormattedText text={msg.content} />
                  ) : (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.content}
                    </div>
                  )}

                  {/* Artifact Action Pills */}
                  {isAssistant && msg.artifacts && msg.artifacts.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-2">
                      {msg.artifacts.map((art) => (
                        <button
                          key={art.id}
                          onClick={() => {
                            setActiveArtifact(art);
                            onOpenCanvas?.();
                          }}
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
      </div>

      {/* Quick Prompt Pills */}
      <div className="px-4 py-2 border-t border-gray-100 bg-white/70 overflow-x-auto flex items-center gap-2">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-2 overflow-x-auto py-0.5">
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
      </div>

      {/* Bottom Prompt Input */}
      <div className="p-3 bg-white border-t border-gray-200 shadow-md">
        <div className="max-w-4xl mx-auto w-full">
          <div className="relative flex items-center bg-gray-50 border border-gray-300 rounded-xl focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 focus-within:bg-white transition p-1.5">
            <textarea
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask KaTuro Assistant to analyze quiz scores, create remediation slips, encode into e-Class Record, or synthesize docs... (Enter to send)"
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
      </div>

    </main>
  );
}
