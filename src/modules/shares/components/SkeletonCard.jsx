export function SkeletonCard() {
  return (
    <div className="sh-card" style={{ pointerEvents: 'none' }}>
      <div className="sh-card-header">
        <div className="sh-skeleton sh-skeleton-avatar sh-avatar sh-avatar--md" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="sh-skeleton" style={{ height: 13, width: '45%' }} />
          <div className="sh-skeleton" style={{ height: 11, width: '65%' }} />
        </div>
      </div>
      <div className="sh-skeleton sh-skeleton-photo" />
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="sh-skeleton" style={{ height: 12, width: '80%' }} />
        <div className="sh-skeleton" style={{ height: 12, width: '60%' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sh-skeleton" style={{ height: 30, width: 60, borderRadius: 20 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
