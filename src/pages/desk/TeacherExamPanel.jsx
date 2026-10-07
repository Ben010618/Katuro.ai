import { useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { EXAM_CASES, runTeacherExam } from '../../services/desk/agent/teacherExam';
import { loadRuleCards } from '../../services/desk/knowledge/ruleCards';

const OUTCOME_LABEL = { answer: 'Answered', ask: 'Asked', run: 'Ran', confirm: 'Asked to proceed', error: 'Error' };

/**
 * Admin only: runs the teacher exam (real planner, sample file names, nothing saved)
 * and shows which requests KaTuroDesk handles the way a teacher expects.
 */
export default function TeacherExamPanel() {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const stop = useRef(null);

  const start = async () => {
    setRows([]); setSummary(null); setError(''); setRunning(true);
    const ctrl = new AbortController();
    stop.current = ctrl;
    try {
      const cards = await loadRuleCards({ force: true });
      const result = await runTeacherExam({ cards, signal: ctrl.signal, onProgress: (row) => setRows((r) => [...r, row]) });
      setSummary(result);
    } catch (e) {
      setError(e?.message || 'The exam could not run.');
    } finally {
      setRunning(false);
      stop.current = null;
    }
  };

  return (
    <div className="p-5 overflow-y-auto space-y-3">
      <div>
        <h3 className="text-xs font-bold text-gray-800 mb-0.5">Teacher exam</h3>
        <p className="text-[11px] text-gray-500">
          {EXAM_CASES.length} real teacher requests, each with the right behavior: answer, ask for a missing detail, or run the right tool.
          Run it after changing the rule cards or updating KaTuroDesk. It uses about {EXAM_CASES.length} AI requests on your account, uses sample file names only, and runs or saves nothing.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {running ? (
          <button type="button" onClick={() => stop.current?.abort()} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-1.5">
            <Square size={12} /> Stop after this request
          </button>
        ) : (
          <button type="button" onClick={start} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5">
            <Play size={12} /> Run the exam
          </button>
        )}
        {running && <span className="text-[11px] text-gray-500">{rows.length} of {EXAM_CASES.length} done</span>}
        {summary && !running && (
          <span className={`text-xs font-bold ${summary.score >= 90 ? 'text-emerald-700' : summary.score >= 75 ? 'text-amber-700' : 'text-red-700'}`}>
            Score: {summary.passed} / {summary.total} ({summary.score}%)
          </span>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {rows.length > 0 && (
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-1 pr-2 font-semibold">Request</th>
              <th className="py-1 pr-2 font-semibold">KaTuroDesk</th>
              <th className="py-1 font-semibold">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 align-top">
                <td className="py-1.5 pr-2 text-gray-800">
                  <span className="text-gray-400">{r.topic}: </span>{r.prompt}
                </td>
                <td className="py-1.5 pr-2 text-gray-700 whitespace-nowrap">
                  {OUTCOME_LABEL[r.outcome] || r.outcome}{r.tools.length ? ` (${r.tools.join(', ')})` : ''}
                </td>
                <td className={`py-1.5 font-semibold ${r.pass ? 'text-emerald-700' : 'text-red-700'}`}>
                  {r.pass ? 'Pass' : 'Fail'}
                  {!r.pass && r.why && <span className="block font-normal text-gray-500">{r.why}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
