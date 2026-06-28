import { useState } from 'react';
import PropTypes from 'prop-types';

function PhotoItem({ url, alt, index, onPhotoClick }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className="sh-photo-item"
      onClick={e => { e.stopPropagation(); onPhotoClick?.(index); }}
      role="button"
      tabIndex={0}
      aria-label={alt}
      onKeyDown={e => { if (e.key === 'Enter') onPhotoClick?.(index); }}
    >
      {/* Shimmer skeleton — fades out when image loads */}
      <div className={`sh-photo-skeleton ${loaded ? 'sh-skeleton-done' : ''}`} />

      <img
        src={url}
        alt={alt}
        className={`sh-photo-img ${loaded ? 'sh-img-loaded' : ''}`}
        onLoad={() => setLoaded(true)}
        decoding="async"
        loading={index === 0 ? 'eager' : 'lazy'}
        fetchPriority={index === 0 ? 'high' : 'auto'}
        draggable={false}
      />
    </div>
  );
}

/**
 * Responsive photo grid: 1 = full-width, 2 = side-by-side, 3 = top full + 2 below, 4 = 2×2.
 */
export function PhotoGrid({ urls, onPhotoClick }) {
  const count = Math.min(urls.length, 4);
  if (!count) return null;

  return (
    <div
      className={`sh-photo-grid sh-photo-grid--${count}`}
      role="group"
      aria-label={`${count} photo${count > 1 ? 's' : ''}`}
    >
      {urls.slice(0, 4).map((url, i) => (
        <PhotoItem
          key={i}
          url={url}
          alt={`Post photo ${i + 1} of ${count}`}
          index={i}
          onPhotoClick={onPhotoClick}
        />
      ))}
    </div>
  );
}

PhotoGrid.propTypes = {
  urls:         PropTypes.arrayOf(PropTypes.string).isRequired,
  onPhotoClick: PropTypes.func,
};
