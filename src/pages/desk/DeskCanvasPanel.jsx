import { useState, useRef } from 'react';
import {
  Save,
  Download,
  Printer,
  Edit3,
  Eye,
  Check,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  PanelRightClose,
} from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';

export default function DeskCanvasPanel({ onCollapse }) {
  const { activeArtifact, saveCurrentArtifactToDisk, workspace } = useDeskStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const printRef = useRef(null);

  const artifactText = editedText || activeArtifact?.rawText || '';

  const handleSaveToFolder = async () => {
    setIsSaving(true);
    try {
      await saveCurrentArtifactToDisk();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving to folder:', err);
      alert('Could not save directly to folder: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadDoc = () => {
    if (!activeArtifact) return;
    const blob = new Blob([artifactText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeArtifact.filename || `${activeArtifact.title || 'DepEd_Lesson'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // If no artifact is loaded yet
  if (!activeArtifact) {
    return (
      <aside className="w-80 lg:w-96 xl:w-[460px] flex-shrink-0 flex flex-col h-full bg-[#f1f5f3] border-l border-gray-200 select-none">
        <div className="p-2.5 bg-white border-b border-gray-200 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
            <Sparkles size={12} className="text-emerald-600" />
            Document Canvas
          </span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Minimize Canvas"
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
            >
              <PanelRightClose size={13} />
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100/60 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-3 shadow-xs">
            <FileText size={28} />
          </div>
          <h2 className="text-xs font-bold text-gray-800 mb-1">
            DepEd Document Studio
          </h2>
          <p className="text-[11px] text-gray-500 max-w-xs leading-relaxed mb-5">
            Ask your Co-Teacher to generate a lesson plan, quiz, or remedial worksheet to view the live layout here.
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-gray-200 text-[10.5px] font-medium text-emerald-800 shadow-2xs">
            <Sparkles size={11} className="text-emerald-600" />
            DepEd Long Bond Paper (8.5" × 13")
          </div>
        </div>
      </aside>
    );
  }

  const isSlideType = activeArtifact.type === 'slides';

  return (
    <aside className="w-80 lg:w-96 xl:w-[460px] flex-shrink-0 flex flex-col h-full bg-[#e8ecea] border-l border-gray-300">
      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #deped-print-canvas, #deped-print-canvas * {
            visibility: visible;
          }
          #deped-print-canvas {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* Canvas Action Bar */}
      <div className="p-2.5 bg-white border-b border-gray-200 flex items-center justify-between shadow-2xs z-10">
        <div className="min-w-0 mr-2">
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
              {activeArtifact.type.toUpperCase()}
            </span>
            <h2 className="text-xs font-bold text-gray-900 truncate" title={activeArtifact.title}>
              {activeArtifact.title}
            </h2>
          </div>
          <p className="text-[9.5px] text-gray-500 truncate">
            {activeArtifact.subtitle || 'DepEd MATATAG Verified Layout'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsEditing(!isEditing)}
            title={isEditing ? 'View Rendered Layout' : 'Edit Text Content'}
            className="p-1.5 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-gray-200 transition text-xs flex items-center gap-1"
          >
            {isEditing ? <Eye size={12} /> : <Edit3 size={12} />}
          </button>

          <button
            onClick={handleSaveToFolder}
            disabled={isSaving}
            title={`Direct Save to "${workspace?.name || 'Classroom Folder'}"`}
            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition shadow-2xs ${
              saveSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
          >
            {saveSuccess ? <Check size={12} /> : <Save size={12} />}
            <span className="hidden sm:inline">
              {saveSuccess ? 'Saved!' : 'Save'}
            </span>
          </button>

          <button
            onClick={handleDownloadDoc}
            title="Download Document"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-200 transition"
          >
            <Download size={13} />
          </button>

          <button
            onClick={handlePrint}
            title="Print Official DepEd Layout"
            className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-200 transition"
          >
            <Printer size={13} />
          </button>

          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Minimize Canvas (give full room to Chat)"
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded border border-gray-200 transition ml-0.5"
            >
              <PanelRightClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Canvas Paper Viewport */}
      <div className="flex-1 overflow-y-auto p-4 flex justify-center custom-scrollbar">
        {isEditing ? (
          <div className="w-full h-full flex flex-col">
            <label className="text-[11px] font-bold text-gray-600 mb-1 flex items-center justify-between">
              <span>Edit Document Content</span>
              <span className="text-[10px] text-gray-400">Markdown format</span>
            </label>
            <textarea
              value={artifactText}
              onChange={(e) => setEditedText(e.target.value)}
              className="flex-1 w-full p-4 bg-white border border-gray-300 rounded-lg text-xs font-mono leading-relaxed focus:outline-none focus:border-emerald-600 resize-none shadow-inner"
            />
          </div>
        ) : isSlideType ? (
          /* Slide Presentation View */
          <div className="w-full max-w-lg flex flex-col items-center">
            <div className="w-full aspect-[16/9] bg-gradient-to-br from-emerald-900 to-[#14281e] text-white rounded-xl shadow-lg p-6 flex flex-col justify-between border border-emerald-700/50">
              <div className="flex items-center justify-between border-b border-emerald-700/40 pb-2">
                <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-300">
                  DepEd MATATAG Classroom Deck
                </span>
                <span className="text-[10px] bg-emerald-800/80 px-2 py-0.5 rounded text-emerald-200">
                  Slide {currentSlideIndex + 1} of 5
                </span>
              </div>

              <div className="my-auto py-2">
                <h3 className="text-lg font-bold text-white mb-2 leading-tight">
                  {activeArtifact.title}
                </h3>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  {activeArtifact.subtitle || 'Essential competencies and guided exploratory activities.'}
                </p>
              </div>

              <div className="flex items-center justify-between text-[10px] text-emerald-400/80 pt-2 border-t border-emerald-700/40">
                <span>Republic of the Philippines · Department of Education</span>
                <span>KaTuroDesk</span>
              </div>
            </div>

            {/* Slide Navigation */}
            <div className="flex items-center gap-3 mt-4">
              <button
                disabled={currentSlideIndex === 0}
                onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
                className="p-1.5 rounded-full bg-white border border-gray-300 shadow-2xs hover:bg-gray-50 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-semibold text-gray-700">
                Slide {currentSlideIndex + 1} / 5
              </span>
              <button
                disabled={currentSlideIndex === 4}
                onClick={() => setCurrentSlideIndex((prev) => Math.min(4, prev + 1))}
                className="p-1.5 rounded-full bg-white border border-gray-300 shadow-2xs hover:bg-gray-50 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* DepEd Long Bond Paper Sheet (8.5" x 13" proportion) */
          <div
            id="deped-print-canvas"
            ref={printRef}
            className="w-full max-w-xl bg-white shadow-md border border-gray-300 rounded-sm p-8 text-gray-900 font-serif"
            style={{ minHeight: '800px' }}
          >
            {/* Official DepEd Header */}
            <div className="text-center border-b-2 border-black pb-3 mb-6">
              <p className="text-[11px] uppercase tracking-wider text-gray-700 font-sans">
                Republic of the Philippines
              </p>
              <h2 className="text-sm font-bold uppercase tracking-wide text-black font-sans my-0.5">
                Department of Education
              </h2>
              <p className="text-[10px] text-gray-600 font-sans">
                Curriculum Implementation Division · Lesson Planning & Assessment Office
              </p>
            </div>

            {/* Document Content */}
            <div className="prose prose-sm max-w-none text-xs leading-normal font-sans space-y-3">
              <div className="bg-gray-50 border border-gray-200 p-2.5 rounded text-[11px] font-sans flex items-center justify-between">
                <div>
                  <span className="font-bold">Learning Area:</span> {activeArtifact.data?.subject || 'Science'}
                </div>
                <div>
                  <span className="font-bold">Grade Level:</span> {activeArtifact.data?.gradeLevel || 'Grade 7'}
                </div>
                <div>
                  <span className="font-bold">Code:</span> {activeArtifact.data?.code || 'MATATAG'}
                </div>
              </div>

              <div className="whitespace-pre-wrap font-sans text-xs text-gray-800 leading-relaxed pt-2">
                {artifactText}
              </div>
            </div>

            {/* Official Footer / Sign-off */}
            <div className="mt-12 pt-4 border-t border-gray-300 grid grid-cols-2 gap-4 text-[10px] font-sans text-gray-600">
              <div>
                <p className="font-semibold text-gray-800">Prepared by:</p>
                <div className="mt-6 border-b border-gray-400 w-36"></div>
                <p className="mt-1">Classroom Teacher</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">Checked & Verified:</p>
                <div className="mt-6 border-b border-gray-400 w-36 ml-auto"></div>
                <p className="mt-1">Master Teacher / Head Teacher</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
