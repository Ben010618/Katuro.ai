import PropTypes from 'prop-types';

/**
 * Responsive photo grid: 1 = full-width, 2 = side-by-side, 3 = first full then 2, 4 = 2x2.
 */
export function PhotoGrid({ urls, onPhotoClick }) {
  const count = Math.min(urls.length, 4);
  if (!count) return null;

  return (
    <div
      className={`sh-photo-grid sh-photo-grid--${count}`}
      onClick={() => onPhotoClick?.(0)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onPhotoClick?.(0); }}
    >
      {urls.slice(0, 4).map((url, i) => (
        <div
          key={i}
          className="sh-photo-item"
          onClick={e => { e.stopPropagation(); onPhotoClick?.(i); }}
          role="button"
          tabIndex={0}
          aria-label={`View photo ${i + 1}`}
          onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onPhotoClick?.(i); } }}
        >
          <img
            src={url}
            alt={`Post photo ${i + 1}`}
            className="sh-photo-img"
            loading="lazy"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

PhotoGrid.propTypes = {
  urls:         PropTypes.arrayOf(PropTypes.string).isRequired,
  onPhotoClick: PropTypes.func,
};
