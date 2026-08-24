import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { isHTMLCaption, sanitizeHTML, renderPlainCaption } from '../utils/captionUtils';

/**
 * Full-screen photo lightbox with keyboard and dot navigation.
 */
export function PhotoLightbox({ urls, initialIndex, caption, onClose }) {
  const [idx, setIdx] = useState(initialIndex ?? 0);

  const captionIsHTML = useMemo(() => isHTMLCaption(caption || ''), [caption]);
  const safeHTML      = useMemo(() => (captionIsHTML ? sanitizeHTML(caption) : ''), [captionIsHTML, caption]);

  const prev = useCallback(() => setIdx(i => (i - 1 + urls.length) % urls.length), [urls.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % urls.length), [urls.length]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prev, next]);

  return (
    <div className="sh-lightbox" onClick={onClose}>

      <button className="sh-lightbox-close" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>

      {urls.length > 1 && (
        <button
          className="sh-lightbox-nav sh-lightbox-nav--prev"
          onClick={e => { e.stopPropagation(); prev(); }}
          aria-label="Previous"
        >
          <ChevronLeft size={22} />
        </button>
      )}

      <div className="sh-lightbox-img-wrap" onClick={e => e.stopPropagation()}>
        <img
          src={urls[idx]}
          alt={`Photo ${idx + 1} of ${urls.length}`}
          className="sh-lightbox-img"
          draggable={false}
        />
      </div>

      {urls.length > 1 && (
        <button
          className="sh-lightbox-nav sh-lightbox-nav--next"
          onClick={e => { e.stopPropagation(); next(); }}
          aria-label="Next"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {urls.length > 1 && (
        <div className="sh-lightbox-dots">
          {urls.map((_, i) => (
            <button
              key={i}
              className={`sh-lightbox-dot ${i === idx ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); setIdx(i); }}
              aria-label={`Photo ${i + 1}`}
            />
          ))}
        </div>
      )}

      {caption && (
        <div className="sh-lightbox-caption" onClick={e => e.stopPropagation()}>
          {captionIsHTML ? (
            <div className="sh-lightbox-caption-rich" dangerouslySetInnerHTML={{ __html: safeHTML }} />
          ) : (
            renderPlainCaption(caption)
          )}
        </div>
      )}
    </div>
  );
}

PhotoLightbox.propTypes = {
  urls:         PropTypes.arrayOf(PropTypes.string).isRequired,
  initialIndex: PropTypes.number,
  caption:      PropTypes.string,
  onClose:      PropTypes.func.isRequired,
};

PhotoLightbox.defaultProps = { initialIndex: 0 };
