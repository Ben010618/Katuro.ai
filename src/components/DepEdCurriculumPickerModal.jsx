import { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Check,
  Clock,
} from 'lucide-react';
import {
  getAvailableDepEdSubjects,
  getAvailableDepEdGrades,
  queryDepEdCompetencies,
  balanceCompetencyDays,
} from '../data/depedMatatagCurriculum';

export default function DepEdCurriculumPickerModal({
  isOpen,
  onClose,
  onSelectCompetencies,
  defaultSubject = 'Science',
  defaultGrade = 'Grade 7',
  defaultQuarter = 'Quarter 1',
  targetTotalDays = 45,
  singleSelect = false,
}) {
  const [selectedSubject, setSelectedSubject] = useState(defaultSubject);
  const [selectedGrade, setSelectedGrade] = useState(defaultGrade);
  const [selectedQuarter, setSelectedQuarter] = useState(
    defaultQuarter.startsWith('Term ') ? defaultQuarter.replace('Term ', 'Quarter ') : defaultQuarter
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [autoBalanceDays, setAutoBalanceDays] = useState(true);

  // Sync defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs picker defaults from props each time the modal opens
      if (defaultSubject) setSelectedSubject(defaultSubject);
      if (defaultGrade) setSelectedGrade(defaultGrade);
      if (defaultQuarter) {
        setSelectedQuarter(
          defaultQuarter.startsWith('Term ') ? defaultQuarter.replace('Term ', 'Quarter ') : defaultQuarter
        );
      }
      setSelectedItems([]);
      setSearchQuery('');
    }
  }, [isOpen, defaultSubject, defaultGrade, defaultQuarter]);

  const availableSubjects = useMemo(() => getAvailableDepEdSubjects(), []);
  const availableGrades = useMemo(() => getAvailableDepEdGrades(selectedSubject), [selectedSubject]);

  const competencies = useMemo(() => {
    return queryDepEdCompetencies({
      subject: selectedSubject,
      gradeLevel: selectedGrade,
      quarter: selectedQuarter,
      keyword: searchQuery,
    });
  }, [selectedSubject, selectedGrade, selectedQuarter, searchQuery]);

  if (!isOpen) return null;

  function toggleItem(comp) {
    if (singleSelect) {
      setSelectedItems([comp]);
      return;
    }
    const exists = selectedItems.some((item) => item.id === comp.id);
    if (exists) {
      setSelectedItems(selectedItems.filter((item) => item.id !== comp.id));
    } else {
      setSelectedItems([...selectedItems, comp]);
    }
  }

  function handleSelectAllInQuarter() {
    if (selectedItems.length === competencies.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems([...competencies]);
    }
  }

  function handleConfirm() {
    if (selectedItems.length === 0) return;

    let finalItems = selectedItems.map((item) => ({
      id: item.id || `comp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      code: item.code,
      text: `${item.code ? `[${item.code}] ` : ''}${item.text}`,
      rawText: item.text,
      days: item.days || 5,
      domain: item.domain,
      bloomLevel: item.bloomLevel,
      source: item.source,
      contentStandard: item.contentStandard,
      performanceStandard: item.performanceStandard,
    }));

    // If auto-balance is active and targetTotalDays is set
    if (autoBalanceDays && targetTotalDays && finalItems.length > 0 && !singleSelect) {
      finalItems = balanceCompetencyDays(finalItems, targetTotalDays);
    }

    onSelectCompetencies(finalItems);
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(226, 232, 240, 0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                border: '1px solid rgba(255, 255, 255, 0.25)',
              }}
            >
              <ShieldCheck size={26} color="#34d399" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    background: 'rgba(52, 211, 153, 0.2)',
                    color: '#6ee7b7',
                    padding: '2px 8px',
                    borderRadius: 100,
                    border: '1px solid rgba(52, 211, 153, 0.3)',
                  }}
                >
                  ✓ DepEd MATATAG & MELCs Verified
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
                  DO 10 & 13, s. 2024 Standards
                </span>
              </div>
              <h2 style={{ margin: '4px 0 2px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.2px' }}>
                1-Click Official Curriculum Auto-Load
              </h2>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255, 255, 255, 0.85)' }}>
                Select authentic DepEd Philippines learning competencies without manual typing or PDF hunting.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              color: '#ffffff',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div
          style={{
            padding: '14px 24px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Top Selectors Row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Subject Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Subject:</span>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Grade Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Grade:</span>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {availableGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Input */}
            <div
              style={{
                flex: 1,
                minWidth: '220px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '6px 12px',
              }}
            >
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search competency, topic, or code (e.g. S7MT, cell, fraction)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: 12,
                  color: '#1e293b',
                  width: '100%',
                  background: 'transparent',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Quarter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4'].map((q) => {
                const isActive = selectedQuarter === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSelectedQuarter(q)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 100,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isActive ? '1px solid #059669' : '1px solid #e2e8f0',
                      background: isActive ? '#059669' : '#ffffff',
                      color: isActive ? '#ffffff' : '#64748b',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {q}
                  </button>
                );
              })}
            </div>

            {!singleSelect && competencies.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllInQuarter}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: '#059669',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Check size={13} strokeWidth={3} />
                {selectedItems.length === competencies.length ? 'Deselect All' : 'Select All for This Quarter'}
              </button>
            )}
          </div>
        </div>

        {/* Competencies Scrollable List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: '#ffffff',
          }}
        >
          {competencies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
              <BookOpen size={32} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>
                No competencies found for this filter.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Try selecting another quarter or adjusting your search term.
              </p>
            </div>
          ) : (
            competencies.map((comp) => {
              const isSelected = selectedItems.some((item) => item.id === comp.id);
              return (
                <div
                  key={comp.id}
                  onClick={() => toggleItem(comp)}
                  style={{
                    border: isSelected ? '1.5px solid #059669' : '1px solid #e2e8f0',
                    background: isSelected ? '#ecfdf5' : '#ffffff',
                    borderRadius: 14,
                    padding: '14px 18px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(5, 150, 105, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = '#e2e8f0';
                  }}
                >
                  {/* Selection Indicator */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: singleSelect ? '50%' : 6,
                      border: isSelected ? '2px solid #059669' : '2px solid #cbd5e1',
                      background: isSelected ? '#059669' : '#ffffff',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {isSelected && <Check size={13} color="#ffffff" strokeWidth={3} />}
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top Meta Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      {comp.code && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            fontFamily: '"DM Mono", monospace',
                            color: '#047857',
                            background: '#d1fae5',
                            padding: '2px 8px',
                            borderRadius: 6,
                            letterSpacing: '0.4px',
                          }}
                        >
                          {comp.code}
                        </span>
                      )}

                      {comp.bloomLevel && (
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: '#1d4ed8',
                            background: '#dbeafe',
                            padding: '2px 8px',
                            borderRadius: 100,
                          }}
                        >
                          {comp.bloomLevel}
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#64748b',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Clock size={11} /> {comp.days || 5} instructional days
                      </span>
                    </div>

                    {/* Competency Text */}
                    <p
                      style={{
                        margin: '0 0 6px',
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: isSelected ? '#064e3b' : '#1e293b',
                        lineHeight: 1.55,
                      }}
                    >
                      {comp.text}
                    </p>

                    {/* Domain & Source */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 11.5 }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>
                        Domain: <span style={{ color: '#0f172a' }}>{comp.domain}</span>
                      </span>
                      <span style={{ color: '#94a3b8' }}>·</span>
                      <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                        Source: {comp.source}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Action Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Left info & Auto-balance toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {selectedItems.length} {selectedItems.length === 1 ? 'competency' : 'competencies'} selected
            </span>

            {!singleSelect && selectedItems.length > 0 && (
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '4px 8px',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoBalanceDays}
                  onChange={(e) => setAutoBalanceDays(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Auto-balance to {targetTotalDays} days budget
              </label>
            )}
          </div>

          {/* Right Action Buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedItems.length === 0}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: selectedItems.length > 0 ? 'linear-gradient(135deg, #059669, #047857)' : '#cbd5e1',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 700,
                cursor: selectedItems.length > 0 ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: selectedItems.length > 0 ? '0 4px 14px rgba(5, 150, 105, 0.3)' : 'none',
              }}
            >
              <Sparkles size={14} />
              <span>Load Selected into Form</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
