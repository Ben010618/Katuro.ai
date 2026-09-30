import { useState } from 'react';
import { useFacultyStore, AVATAR_PRESETS } from '../store/facultyStore';
import { useAuth } from '../hooks/useAuth';
import {
  X,
  Sparkles,
  RefreshCw,
  Check,
  UserCheck,
  Palette,
  MessageSquare,
  Wand2,
} from 'lucide-react';

export default function FacultyCustomizerModal({ isOpen, onClose }) {
  const { faculty, updateCoTeacher, resetCoTeacher, saveToFirestore } = useFacultyStore();
  const { user } = useAuth();

  const [selectedId, setSelectedId] = useState('dll');
  const [editingName, setEditingName] = useState('');
  const [editingAvatar, setEditingAvatar] = useState('');
  const [editingTone, setEditingTone] = useState('');
  const [customSeed, setCustomSeed] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const currentAgent = faculty[selectedId];

  function handleSelectAgent(id) {
    setSelectedId(id);
    const target = faculty[id];
    setEditingName(target.customName || target.defaultName);
    setEditingAvatar(target.avatar);
    setEditingTone(target.tone);
    setSavedSuccess(false);
  }

  function handleSaveCurrent() {
    updateCoTeacher(selectedId, {
      customName: editingName,
      avatar: editingAvatar,
      tone: editingTone,
    });
    if (user?.uid) {
      saveToFirestore(user.uid);
    }
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  }

  function handleResetCurrent() {
    resetCoTeacher(selectedId);
    const def = faculty[selectedId];
    setEditingName(def.defaultName);
    setEditingAvatar(def.avatar);
    setEditingTone(def.tone);
    if (user?.uid) {
      saveToFirestore(user.uid);
    }
  }

  function handleRandomizeDiceBear() {
    const randomSeed = Math.random().toString(36).substring(2, 8);
    const styles = ['notionists', 'avataaars', 'bottts'];
    const style = selectedId === 'grader' ? 'bottts' : styles[Math.floor(Math.random() * 2)];
    const newUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${randomSeed}`;
    setEditingAvatar(newUrl);
    setCustomSeed(randomSeed);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: '860px',
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(226, 232, 240, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Sparkles size={22} color="#34d399" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px' }}>
                Customize Your kaTuro Faculty Room
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                Personalize the name, avatar, and style of your 5 Core AI Co-Teachers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'background 0.2s',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: '460px', overflow: 'hidden' }}>
          {/* Left Sidebar: 5 Co-Teachers Tabs */}
          <div
            style={{
              width: '280px',
              borderRight: '1px solid #e2e8f0',
              background: '#f8fafc',
              padding: '16px 12px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#64748b',
                padding: '4px 8px',
              }}
            >
              Core Faculty Members
            </span>
            {Object.values(faculty).map((agent) => {
              const active = agent.id === selectedId;
              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    border: active ? `2px solid ${agent.color}` : '1px solid #e2e8f0',
                    background: active ? '#ffffff' : 'transparent',
                    boxShadow: active ? '0 4px 12px rgba(0, 0, 0, 0.05)' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <img
                    src={agent.avatar}
                    alt={agent.customName}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#e2e8f0',
                      objectFit: 'cover',
                      border: `2px solid ${agent.color}`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      {agent.customName || agent.defaultName}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.role}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Editor Pane */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Live Card Preview */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                border: '1px solid #bbf7d0',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <img
                src={editingAvatar || currentAgent.avatar}
                alt="Preview"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: `3px solid ${currentAgent.color}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    {editingName || currentAgent.defaultName}
                  </h3>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      background: currentAgent.color,
                      color: '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '100px',
                    }}
                  >
                    {currentAgent.badge}
                  </span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857', marginTop: '2px' }}>
                  {currentAgent.role}
                </div>
                <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '4px' }}>
                  "{currentAgent.tagline}"
                </div>
              </div>
            </div>

            {/* Rename Input */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <UserCheck size={14} color="#059669" />
                Co-Teacher Nickname or Title:
              </label>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder={currentAgent.defaultName}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                Tip: Name them after your real department head, partner teacher, or favorite mentor!
              </span>
            </div>

            {/* Avatar Selector */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#334155',
                  }}
                >
                  <Palette size={14} color="#059669" />
                  Select Avatar Look:
                </label>
                <button
                  type="button"
                  onClick={handleRandomizeDiceBear}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#059669',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                >
                  <Wand2 size={12} />
                  Randomize New Look
                </button>
              </div>

              {/* Presets Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '8px',
                  maxHeight: '130px',
                  overflowY: 'auto',
                  padding: '4px',
                  border: '1px solid #f1f5f9',
                  borderRadius: '10px',
                  background: '#f8fafc',
                }}
              >
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = editingAvatar === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setEditingAvatar(preset.url)}
                      title={preset.label}
                      style={{
                        padding: '4px',
                        borderRadius: '10px',
                        border: isSelected ? '2px solid #059669' : '1px solid #e2e8f0',
                        background: isSelected ? '#ecfdf5' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tone of Voice */}
            <div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: '6px',
                }}
              >
                <MessageSquare size={14} color="#059669" />
                Teaching Tone & Personality:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['DepEd Official & Practical', 'Warm & Encouraging', 'Concise & Bullet Points'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditingTone(t)}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: editingTone === t ? '2px solid #059669' : '1px solid #cbd5e1',
                      background: editingTone === t ? '#ecfdf5' : '#ffffff',
                      color: editingTone === t ? '#065f46' : '#475569',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div
              style={{
                marginTop: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '16px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                onClick={handleResetCurrent}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#64748b',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                Reset to Default
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveCurrent}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: savedSuccess ? '#10b981' : '#059669',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                    transition: 'all 0.2s',
                  }}
                >
                  {savedSuccess ? (
                    <>
                      <Check size={16} /> Saved!
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
