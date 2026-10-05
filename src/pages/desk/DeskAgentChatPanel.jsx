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
  Paperclip,
  X,
  ShieldCheck,
  ShieldOff,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Circle,
  Files,
  ListChecks,
  CalendarClock,
  Mic,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { runChatTurn } from './runChatTurn';
import DeskFormattedText from './DeskFormattedText';
import DeskAvatar, { KaTuroAIAvatar } from './DeskAvatar';
import { getTeacherSalutationName } from '../../services/teacherProfileUtils';
import { getPersona } from '../../services/desk/personas';
import { QUICK_PROMPTS } from '../../services/desk/agent/fastRoute';
import { useVoiceInput } from './useVoiceInput';
import { VoiceButton, VoiceStatus } from './VoiceControls';

function StepIcon({ status }) {
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-emerald-600 flex-shrink-0" />;
  if (status === 'done') return <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />;
  if (status === 'error') return <XCircle size={12} className="text-red-500 flex-shrink-0" />;
  if (status === 'skipped') return <MinusCircle size={12} className="text-gray-400 flex-shrink-0" />;
  return <Circle size={12} className="text-gray-300 flex-shrink-0" />;
}

function StepList({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul className="mb-2 space-y-1 border border-gray-100 bg-gray-50/70 rounded-lg p-2">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-1.5 text-[11px] text-gray-700">
          <span className="mt-0.5">
            <StepIcon status={s.status} />
          </span>
          <span className="min-w-0">
            <span className={s.status === 'running' ? 'font-semibold' : ''}>{s.label}</span>
            {s.detail && <span className={`block text-[10px] ${s.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{s.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ArtifactIcon({ type }) {
  if (type === 'slides') return <Presentation size={14} className="text-amber-600" />;
  if (type === 'sheet' || type === 'table') return <FileSpreadsheet size={14} className="text-blue-600" />;
  if (type === 'files') return <Files size={14} className="text-gray-600" />;
  if (type === 'changes') return <ListChecks size={14} className="text-amber-600" />;
  if (type === 'voice_scores') return <Mic size={14} className="text-red-600" />;
  return <FileText size={14} className="text-emerald-600" />;
}

export default function DeskAgentChatPanel({
  user,
  profile,
  photoURL,
  onOpenCanvas,
  onSchedule,
  onToggleLeftPanel,
  showLeftPanel,
}) {
  const {
    messages,
    isGenerating,
    workspace,
    setActiveArtifact,
    clearConversation,
    attachedPaths,
    toggleAttachment,
    clearAttachments,
    importFiles,
    privacyMode,
    setPrivacyMode,
    persona,
  } = useDeskStore();
  const personaInfo = getPersona(persona);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  // Voice: the transcript is added to the message box for the teacher to check, never sent directly.
  const voice = useVoiceInput({
    onText: (text) => {
      setInputPrompt((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });

  const teacherSalutationName = getTeacherSalutationName(profile, user);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleImport = async (files) => {
    if (!files?.length) return;
    setImportError('');
    try {
      await importFiles(files);
    } catch (err) {
      setImportError(err.message);
    }
  };

  const handleSendPrompt = async (customText = null) => {
    const textToSend = (customText || inputPrompt).trim();
    if (!textToSend || isGenerating) return;

    const attachmentsForTurn = [...attachedPaths];
    setInputPrompt('');
    const outcome = await runChatTurn({ text: textToSend, attachments: attachmentsForTurn, user, profile, onOpenCanvas });
    if (outcome.status !== 'error' || outcome.files.length) clearAttachments();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      e.preventDefault();
      handleImport(files);
    }
  };


  return (
    <main
      className="flex-1 flex flex-col h-full bg-[#f8faf9] min-w-0 relative"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setIsDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleImport(e.dataTransfer?.files);
      }}
    >
      {isDragging && (
        <div className="absolute inset-0 z-30 bg-emerald-50/90 border-2 border-dashed border-emerald-500 rounded-lg flex flex-col items-center justify-center pointer-events-none">
          <Paperclip size={28} className="text-emerald-700 mb-2" />
          <p className="text-sm font-bold text-emerald-900">Drop files to import & attach</p>
          <p className="text-[11px] text-emerald-800">Copied into "KaTuro Imports" inside your classroom folder</p>
        </div>
      )}

      {/* KaTuro Teaching Assistant Header */}
      <header className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between gap-2 shadow-2xs z-10">
        <div className="flex items-center gap-3 min-w-0">
          {!showLeftPanel && onToggleLeftPanel && (
            <button
              onClick={onToggleLeftPanel}
              title="Open Classroom Folder Explorer"
              className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-md transition"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <KaTuroAIAvatar persona={persona} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">{personaInfo.name} <span className="font-medium text-gray-500 hidden xl:inline">· KaTuro Teaching Assistant</span></h1>
              <span className="hidden lg:inline px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                Co-Teacher Studio
              </span>
            </div>
            <p className="text-[11px] text-gray-500 truncate">
              Reads, analyzes & creates Word, Excel, PowerPoint & PDF files in your folder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            title={
              privacyMode
                ? 'Privacy mode ON: learner names in file text are replaced with codes (Learner 01…) before going to the AI, and restored in your files. Photos and scans are sent as they are.'
                : 'Privacy mode OFF: learner names are sent to the AI as written.'
            }
            className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 border transition ${
              privacyMode ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {privacyMode ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
            <span className="hidden xl:inline whitespace-nowrap">{privacyMode ? 'Names protected' : 'Names visible to AI'}</span>
          </button>
          <button
            onClick={clearConversation}
            title="Clear Chat History"
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition flex items-center gap-1 text-xs"
          >
            <Trash2 size={14} />
            <span className="hidden xl:inline">Clear</span>
          </button>
        </div>
      </header>

      {/* Conversation Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto w-full space-y-4">
          {messages.map((msg, idx) => {
            const isAssistant = msg.role === 'assistant';
            const showThinking = isAssistant && msg.isThinking && !msg.content && !msg.steps?.length;

            return (
              <div
                key={msg.id || idx}
                className={`flex gap-3 w-full ${isAssistant ? 'justify-start' : 'flex-row-reverse'}`}
              >
                <DeskAvatar role={msg.role} persona={persona} photoURL={photoURL || user?.photoURL} name={teacherSalutationName} size={32} />

                <div
                  className={`rounded-xl shadow-xs border min-w-0 max-w-[calc(100%-2.75rem)] md:max-w-[85%] ${
                    isAssistant ? 'bg-white border-gray-200 text-gray-800 px-3.5 py-3' : 'bg-[#2d6a4f] text-white border-emerald-800 px-3.5 py-2.5'
                  }`}
                >
                  {!isAssistant && msg.scheduled && (
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/90">
                      <CalendarClock size={10} /> Scheduled task · {msg.scheduled.name}
                    </div>
                  )}
                  {isAssistant && <StepList steps={msg.steps} />}

                  {showThinking ? (
                    <div className="flex items-center gap-2 py-1 text-gray-500 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-[11px] text-gray-400 italic">{personaInfo.thinking}</span>
                    </div>
                  ) : isAssistant ? (
                    msg.content && <DeskFormattedText text={msg.id === 'msg-welcome' ? personaInfo.welcome(teacherSalutationName) : msg.content} />
                  ) : (
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">{msg.content}</div>
                  )}

                  {!isAssistant && msg.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.attachments.map((p) => (
                        <span key={p} className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-[10px] text-emerald-50 flex items-center gap-1">
                          <Paperclip size={9} /> {p.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  )}

                  {isAssistant && msg.artifacts?.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap gap-2">
                      {msg.artifacts.map((art) => (
                        <button
                          key={art.id}
                          onClick={() => {
                            setActiveArtifact(art);
                            onOpenCanvas?.();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs max-w-full"
                        >
                          <ArtifactIcon type={art.type} />
                          <span className="truncate">{art.title}</span>
                          <ExternalLink size={11} className="opacity-60 flex-shrink-0" />
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

      {/* Quick prompts: a few starters, only until the teacher sends a first message. */}
      {!messages.some((m) => m.role === 'user') && (
      <div className="px-4 pt-2 bg-white/70">
        <div className="max-w-4xl mx-auto w-full flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 mr-0.5">Try:</span>
          {QUICK_PROMPTS.slice(0, 4).map((qp) => (
            <button
              key={qp.label}
              onClick={() => setInputPrompt(qp.prompt)}
              disabled={isGenerating}
              title={qp.prompt}
              className="px-2 py-0.5 text-gray-500 hover:text-emerald-800 hover:bg-emerald-50 text-[11px] rounded-md border border-gray-200 hover:border-emerald-300 transition whitespace-nowrap disabled:opacity-50"
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Bottom Prompt Input */}
      <div className="p-3 bg-white border-t border-gray-200 shadow-md">
        <div className="max-w-4xl mx-auto w-full">
          <VoiceStatus voice={voice} />
          {(attachedPaths.length > 0 || importError) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {attachedPaths.map((p) => (
                <span key={p} title={p} className="pl-2 pr-1 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-1 max-w-[240px]">
                  <Paperclip size={10} className="flex-shrink-0" />
                  <span className="truncate">{p.split('/').pop()}</span>
                  <button onClick={() => toggleAttachment(p)} className="p-0.5 hover:bg-emerald-100 rounded-full" title="Remove">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {importError && <span className="text-[11px] text-red-600">{importError}</span>}
            </div>
          )}
          <div className="relative flex items-center bg-gray-50 border border-gray-300 rounded-xl focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 focus-within:bg-white transition p-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              title="Attach files (Word, Excel, PowerPoint, PDF, photos)"
              className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition flex-shrink-0 disabled:opacity-40"
            >
              <Paperclip size={15} />
            </button>
            <VoiceButton voice={voice} disabled={isGenerating} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                handleImport(e.target.files);
                e.target.value = '';
              }}
            />
            <textarea
              ref={inputRef}
              rows={2}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={`Message ${personaInfo.name}…`}
              title="Enter to send, Shift+Enter for a new line. You can also paste photos."
              disabled={isGenerating}
              className="w-full bg-transparent text-gray-800 text-xs px-2 py-1 resize-none focus:outline-none placeholder-gray-400"
              // The global textarea style (index.css: manila box with its own border) would
              // draw a second box inside the composer; the composer frame is the box here.
              style={{ background: 'transparent', border: 'none', boxShadow: 'none', borderRadius: 0, padding: '6px 8px', fontSize: 13, lineHeight: 1.45 }}
            />
            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
              {onSchedule && (
                <button
                  onClick={() => onSchedule({
                    prompt: inputPrompt.trim(),
                    attachedPaths: [...attachedPaths],
                    // Once the task is saved, the request leaves the chat box.
                    onSaved: () => {
                      setInputPrompt('');
                      clearAttachments();
                    },
                  })}
                  disabled={!workspace?.handle}
                  title={workspace?.handle ? 'Schedule this request for a date and time' : 'Open your classroom folder first'}
                  className="p-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition flex items-center gap-1 text-xs font-medium disabled:opacity-40"
                >
                  <CalendarClock size={15} />
                  <span className="hidden lg:inline">Schedule</span>
                </button>
              )}
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
                    <span className="hidden sm:inline">Send</span>
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
