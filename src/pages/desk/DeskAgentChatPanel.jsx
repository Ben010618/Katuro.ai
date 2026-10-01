import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Loader2,
  FileText,
  FileSpreadsheet,
  Presentation,
  Trash2,
  ExternalLink,
  PanelLeftOpen,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { runDeskAgentTurn } from '../../services/deskAgentAI';
import DeskFormattedText from './DeskFormattedText';
import DeskAvatar, { KaTuroAIAvatar } from './DeskAvatar';
import { getTeacherSalutationName } from '../../services/teacherProfileUtils';

export default function DeskAgentChatPanel({
  user,
  profile,
  photoURL,
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
  const messagesEndRef = useRef(null);

  const teacherSalutationName = getTeacherSalutationName(profile, user);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSendPrompt = async (customText = null) => {
    const textToSend = customText || inputPrompt;
    if (!textToSend.trim() || isGenerating) return;

    setInputPrompt('');

    // 1. Add User Message
    addMessage({
      role: 'user',
      content: textToSend.trim(),
    });

    // 2. Add Placeholder Assistant Message with thinking state
    const assistantMsgId = `msg-assistant-${messages.length + 1}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      agentId: 'katuro_assistant',
      content: '',
      isThinking: true,
    });

    setIsGenerating(true);

    try {
      const result = await runDeskAgentTurn({
        prompt: textToSend.trim(),
        agentId: 'katuro_assistant',
        workspace,
        activeFile,
        user,
        profile,
        tokenBalance,
        freeMode,
      });

      // Update assistant message with response and artifacts
      updateLastAssistantMessage({
        content: result.content,
        isThinking: false,
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
          isThinking: false,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('kt-zero-tokens'));
        }
      } else {
        updateLastAssistantMessage({
          content: `⚠️ Naka-encounter ng error: ${err.message || 'Unknown network error'}. Subukan muling magpadala ng mensahe.`,
          isThinking: false,
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
          <KaTuroAIAvatar size={36} />
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
          {messages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant';
            const showThinking =
              isAssistant &&
              (!msg.content || msg.isThinking || (isGenerating && idx === messages.length - 1 && !msg.content));

            return (
              <div
                key={msg.id || idx}
                className={`flex gap-3 max-w-3xl ${
                  isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
                }`}
              >
                {/* Assistant Avatar vs User Avatar */}
                <DeskAvatar
                  role={msg.role}
                  photoURL={photoURL || user?.photoURL}
                  name={teacherSalutationName}
                  size={32}
                />

                {/* Message Content Container */}
                <div
                  className={`flex-1 rounded-xl p-3.5 shadow-xs border ${
                    isAssistant
                      ? 'bg-white border-gray-200 text-gray-800'
                      : 'bg-[#2d6a4f] text-white border-emerald-800'
                  }`}
                >
                  {/* Message Body */}
                  {showThinking ? (
                    <div className="flex items-center gap-2 py-1 text-gray-500 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[11px] text-gray-400 italic">...</span>
                    </div>
                  ) : isAssistant ? (
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
              placeholder="Message your Co-Teacher... (Press Enter to send)"
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
