import { useState, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { X, ImagePlus, Loader2, Plus } from 'lucide-react';
import { usePost } from '../hooks/usePost';
import { validateImageFile, createPreviewUrl } from '../services/storageService';
import { RichTextEditor } from './RichTextEditor';

const WORD_LIMIT = 250;

function stripHTML(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(text) {
  const plain = stripHTML(text);
  return plain === '' ? 0 : plain.split(/\s+/).length;
}

export function PostComposer({ uid, school: defaultSchool, gradeLevel: defaultGrade, subject: defaultSubject, onSuccess, onClose }) {
  const { uploading, progress, error: postError, publish } = usePost(uid);

  const [files,       setFiles]       = useState([]);
  const [previews,    setPreviews]    = useState([]);
  const [title,       setTitle]       = useState('');
  const [caption,     setCaption]     = useState('');
  const [school,      setSchool]      = useState(defaultSchool   || '');
  const [gradeLevel,  setGradeLevel]  = useState(defaultGrade    || '');
  const [subject,     setSubject]     = useState(defaultSubject  || '');
  const [dragover,    setDragover]    = useState(false);
  const [fileError,   setFileError]   = useState('');

  const inputRef = useRef(null);

  const addFiles = useCallback((incoming) => {
    const remaining = 4 - files.length;
    if (remaining <= 0) { setFileError('Maximum 4 photos per post.'); return; }
    const toAdd = Array.from(incoming).slice(0, remaining);
    for (const f of toAdd) {
      const err = validateImageFile(f);
      if (err) { setFileError(err); return; }
    }
    setFileError('');
    const newPreviews = toAdd.map(createPreviewUrl);
    setFiles(prev => [...prev, ...toAdd]);
    setPreviews(prev => [...prev, ...newPreviews]);
  }, [files.length]);

  function removeFile(i) {
    URL.revokeObjectURL(previews[i]);
    setFiles(prev    => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragover(false);
    addFiles(e.dataTransfer.files);
  }

  async function handlePost() {
    if (!files.length) { setFileError('Please add at least one photo.'); return; }
    const postId = await publish({ files, title, caption, school, gradeLevel, subject });
    if (postId) {
      previews.forEach(URL.revokeObjectURL);
      onSuccess?.(postId);
      onClose();
    }
  }

  const wordCount  = countWords(caption);
  const wordsLeft  = WORD_LIMIT - wordCount;
  const isOverLimit = wordCount > WORD_LIMIT;
  const canPost    = files.length > 0 && !uploading && !isOverLimit;

  return (
    <div className="sh-composer-overlay" onClick={onClose}>
      <div className="sh-composer" onClick={e => e.stopPropagation()}>

        <div className="sh-composer-header">
          <span className="sh-composer-title">New Post</span>
          <button className="sh-composer-close" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sh-composer-body">

          {/* Photo area */}
          {files.length === 0 ? (
            <div
              className={`sh-drop-zone ${dragover ? 'dragover' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <div className="sh-drop-zone-icon"><ImagePlus size={40} /></div>
              <div className="sh-drop-zone-text">Drop photos here or click to browse</div>
              <div className="sh-drop-zone-hint">JPEG, PNG, WebP · Max 4 photos · 1 MB each after compression</div>
            </div>
          ) : (
            <div className="sh-preview-grid" style={{ marginBottom: 14 }}>
              {previews.map((url, i) => (
                <div key={i} className="sh-preview-item">
                  <img src={url} alt={`Preview ${i + 1}`} className="sh-preview-img" />
                  <button className="sh-preview-remove" onClick={() => removeFile(i)} type="button" aria-label="Remove">
                    <X size={11} />
                  </button>
                </div>
              ))}
              {files.length < 4 && (
                <button className="sh-add-more-btn" onClick={() => inputRef.current?.click()} type="button" aria-label="Add more">
                  <Plus size={22} />
                </button>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {(fileError || postError) && (
            <p style={{ color: '#ef4444', fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>
              {fileError || postError}
            </p>
          )}

          {/* Title (optional) */}
          <div className="sh-composer-field">
            <input
              className="sh-composer-title-input"
              type="text"
              placeholder="Add a title (optional)…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          {/* Rich text editor */}
          <div className="sh-composer-field">
            <label className="sh-composer-label">Share Your Thoughts!</label>
            <RichTextEditor
              onChange={html => {
                if (countWords(html) <= WORD_LIMIT) {
                  setCaption(html);
                } else if (html.length < caption.length) {
                  setCaption(html);
                }
              }}
              placeholder="What's happening in your classroom? #DLL #MELC"
              initialValue=""
            />
          </div>

          <div className="sh-composer-footer">
            <span className={`sh-char-count ${isOverLimit ? 'over' : wordsLeft <= 20 ? 'warn' : ''}`}>
              {wordCount} / {WORD_LIMIT} words{wordsLeft <= 20 && !isOverLimit ? ` (${wordsLeft} left)` : ''}
              {isOverLimit ? ` — ${-wordsLeft} over limit` : ''}
            </span>
            <button className="sh-post-btn" onClick={handlePost} disabled={!canPost} type="button">
              {uploading
                ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Posting {progress.uploaded}/{progress.total}…</>
                : 'Post'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

PostComposer.propTypes = {
  uid:             PropTypes.string.isRequired,
  school:          PropTypes.string,
  gradeLevel:      PropTypes.string,
  subject:         PropTypes.string,
  onSuccess:       PropTypes.func,
  onClose:         PropTypes.func.isRequired,
};
