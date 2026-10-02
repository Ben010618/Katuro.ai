import { FileText, FileCode, FileSpreadsheet, FileImage, Presentation, File } from 'lucide-react';

export function getFileIcon(fileName, size = 15) {
  const lower = fileName.toLowerCase();
  if (/\.(docx?|dotx|rtf)$/.test(lower)) return <FileText size={size} className="text-blue-400 flex-shrink-0" />;
  if (/\.(pptx?)$/.test(lower)) return <Presentation size={size} className="text-amber-400 flex-shrink-0" />;
  if (/\.(xlsx|xlsm|xls|csv|tsv)$/.test(lower)) return <FileSpreadsheet size={size} className="text-emerald-400 flex-shrink-0" />;
  if (/\.pdf$/.test(lower)) return <FileText size={size} className="text-red-400 flex-shrink-0" />;
  if (/\.(png|jpe?g|webp|gif|bmp)$/.test(lower)) return <FileImage size={size} className="text-violet-300 flex-shrink-0" />;
  if (/\.(md|txt|json)$/.test(lower)) return <FileCode size={size} className="text-slate-400 flex-shrink-0" />;
  return <File size={size} className="text-gray-400 flex-shrink-0" />;
}
