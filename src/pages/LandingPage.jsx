import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useFacultyStore } from '../store/facultyStore';
import ktLogo from '../assets/KT-Favicon.webp';
import {
  Sparkles,
  CheckCircle2,
  FileText,
  TableProperties,
  Camera,
  Presentation,
  GraduationCap,
  ArrowRight,
  Zap,
  Palette,
} from 'lucide-react';

export default function LandingPage() {
  const { faculty } = useFacultyStore();
  const [activeTab, setActiveTab] = useState('dll');
  const [socialProof, setSocialProof] = useState(null);
  const canvasRef = useRef(null);

  // ── Background Canvas Blueprint Grid ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    }

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const CELL = 56;

      ctx.strokeStyle = 'rgba(52, 211, 153, 0.08)';
      ctx.lineWidth = 0.7;
      for (let x = 0; x <= W; x += CELL) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += CELL) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.03)';
      ctx.lineWidth = 0.4;
      const sub = CELL / 2;
      for (let x = sub; x <= W; x += CELL) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = sub; y <= H; y += CELL) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  // ── Social Proof Ticker (Filipino Teachers & Divisions) ───────────────────────
  useEffect(() => {
    const teachers = [
      { name: 'Teacher Maria', school: 'Batangas Division', action: 'generated a Grade 5 Math DLL' },
      { name: 'Sir Noel', school: 'Cebu City Division', action: 'created a 50-item balanced TOS' },
      { name: "Ma'am Carmela", school: 'Pangasinan II', action: 'unlocked all 5 Co-Teachers' },
      { name: 'Sir Kenneth', school: 'Davao del Sur', action: 'scanned & graded 45 test sheets' },
      { name: 'Teacher Juvy', school: 'Quezon City Division', action: 'exported a Science PPTX deck' },
      { name: 'Sir Raymond', school: 'Iloilo Division', action: 'started Action Research Phase 1' },
      { name: "Ma'am Rowena", school: 'Cavite Province', action: 'customized her Faculty Room' },
    ];
    const times = ['just now', '1 min ago', '2 mins ago', '4 mins ago'];

    let timer;
    function cycleToast() {
      const t = teachers[Math.floor(Math.random() * teachers.length)];
      const time = times[Math.floor(Math.random() * times.length)];
      setSocialProof({ ...t, time });
      timer = setTimeout(() => {
        setSocialProof(null);
        timer = setTimeout(cycleToast, Math.floor(Math.random() * 6000) + 4000);
      }, 5500);
    }

    timer = setTimeout(cycleToast, 3000);
    return () => clearTimeout(timer);
  }, []);

  const agentsList = Object.values(faculty);
  const currentAgent = faculty[activeTab] || agentsList[0];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #064e3b 0%, #022c22 45%, #0f172a 100%)',
        color: '#ffffff',
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Floating Ambient Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '450px',
          background: 'radial-gradient(circle, rgba(16,185,129,0.22) 0%, rgba(6,78,59,0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── Top Navigation ──────────────────────────────────────────────────────── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          background: 'rgba(6, 78, 59, 0.75)',
          borderBottom: '1px solid rgba(52, 211, 153, 0.2)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={ktLogo}
            alt="kaTuro AI"
            style={{ width: '34px', height: '34px', borderRadius: '8px', objectFit: 'cover' }}
          />
          <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>
            kaTuro <span style={{ color: '#34d399' }}>AI</span>
          </span>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              background: 'rgba(52, 211, 153, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              padding: '2px 8px',
              borderRadius: '100px',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
            }}
          >
            Faculty Pack
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/login"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#d1fae5',
              textDecoration: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              transition: 'color 0.2s',
            }}
          >
            Sign In
          </Link>
          <a
            href="#get-started"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 800,
              color: '#064e3b',
              background: '#34d399',
              textDecoration: 'none',
              padding: '8px 20px',
              borderRadius: '100px',
              boxShadow: '0 0 24px rgba(52, 211, 153, 0.45)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '60px 20px 40px',
          textAlign: 'center',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1.4px',
            color: '#a7f3d0',
            background: 'rgba(52, 211, 153, 0.12)',
            border: '1px solid rgba(52, 211, 153, 0.25)',
            borderRadius: '100px',
            padding: '6px 18px',
            marginBottom: '20px',
          }}
        >
          <Sparkles size={13} color="#34d399" />
          5 Specialized AI Co-Teachers · DepEd Aligned
        </div>

        {/* Main Headline */}
        <h1
          style={{
            fontSize: 'clamp(32px, 5.5vw, 62px)',
            fontWeight: 900,
            letterSpacing: '-1.5px',
            lineHeight: 1.1,
            margin: '0 0 16px',
            color: '#ffffff',
          }}
        >
          Never Stay Late at School Again.
          <br />
          <span
            style={{
              background: 'linear-gradient(90deg, #34d399 0%, #6ee7b7 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Meet Your 5-in-1 AI Co-Teacher Faculty.
          </span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 19px)',
            color: '#cbd5e1',
            maxWidth: '720px',
            margin: '0 auto 28px',
            lineHeight: 1.5,
          }}
        >
          Generate DepEd-ready Daily Lesson Logs in Word, calculate balanced TOS exams, scan and grade test papers with your camera, and build PowerPoint decks in minutes.
        </p>

        {/* CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <a
            href="#get-started"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '18px',
              fontWeight: 800,
              color: '#064e3b',
              background: '#34d399',
              padding: '16px 44px',
              borderRadius: '100px',
              textDecoration: 'none',
              boxShadow: '0 0 40px rgba(52, 211, 153, 0.4), 0 8px 24px rgba(0, 0, 0, 0.25)',
              transition: 'transform 0.2s',
            }}
          >
            Unlock Your 5 AI Co-Teachers
            <ArrowRight size={20} />
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#a7f3d0', marginTop: '6px' }}>
            <span>✓ DepEd & MATATAG Aligned</span>
            <span>·</span>
            <span>✓ 100% Word & PPTX Downloads</span>
          </div>
        </div>
      </header>

      {/* ── Interactive Faculty Stage ──────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '1020px',
          margin: '0 auto 60px',
          padding: '0 20px',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.1)',
          }}
        >
          {/* Agent Selection Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              borderBottom: '1px solid rgba(52, 211, 153, 0.2)',
              background: 'rgba(6, 78, 59, 0.4)',
            }}
          >
            {agentsList.map((agent) => {
              const active = agent.id === activeTab;
              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveTab(agent.id)}
                  style={{
                    padding: '16px 8px',
                    border: 'none',
                    borderBottom: active ? `3px solid ${agent.color || '#34d399'}` : '3px solid transparent',
                    background: active ? 'rgba(52, 211, 153, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                  }}
                >
                  <img
                    src={agent.avatar}
                    alt={agent.customName}
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      border: active ? `2px solid #34d399` : '1px solid rgba(255,255,255,0.2)',
                      background: '#1e293b',
                    }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: active ? '#ffffff' : '#94a3b8' }}>
                    {agent.customName || agent.defaultName}
                  </span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      color: agent.color || '#34d399',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                    }}
                  >
                    {agent.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Agent Showcase Pane */}
          <div style={{ padding: '36px 32px', display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 360px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#34d399',
                  background: 'rgba(52, 211, 153, 0.15)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  marginBottom: '10px',
                }}
              >
                <Zap size={12} />
                Specialist Co-Teacher #
                {agentsList.findIndex((a) => a.id === currentAgent.id) + 1}
              </div>
              <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>
                {currentAgent.customName || currentAgent.defaultName}
              </h2>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#6ee7b7', marginBottom: '14px' }}>
                {currentAgent.role}
              </div>
              <p style={{ fontSize: '15px', color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 20px' }}>
                {currentAgent.description}
              </p>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(52, 211, 153, 0.08)',
                  border: '1px solid rgba(52, 211, 153, 0.2)',
                  fontStyle: 'italic',
                  fontSize: '13px',
                  color: '#a7f3d0',
                }}
              >
                "{currentAgent.tagline}"
              </div>
            </div>

            {/* Visual Output Mockup */}
            <div
              style={{
                flex: '1 1 400px',
                background: '#090d16',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '24px',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
              }}
            >
              {currentAgent.id === 'dll' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', marginBottom: '12px' }}>
                    <FileText size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>DepEd Daily Lesson Log (Word .docx)</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, background: '#131b2e', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#fff', fontWeight: 700 }}>I. OBJECTIVES</div>
                    <div>• Content Standards: Demonstrates understanding of energy forms</div>
                    <div>• Performance Standards: Applies energy transformations in daily life</div>
                    <div style={{ color: '#fff', fontWeight: 700, marginTop: '8px' }}>II. 4As PROCEDURE</div>
                    <div>1. Activity: Hands-on battery circuit demo</div>
                    <div>2. Analysis: Guide questions on heat vs electrical energy</div>
                    <div style={{ color: '#34d399', fontWeight: 700, marginTop: '10px' }}>✓ Ready to export as formatted Word (.docx) file!</div>
                  </div>
                </div>
              )}

              {currentAgent.id === 'tos' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', marginBottom: '12px' }}>
                    <TableProperties size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>Table of Specifications Matrix</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, background: '#131b2e', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', fontWeight: 700, color: '#fff', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
                      <span>Competency</span>
                      <span>Rem/Und</span>
                      <span>App/Ana</span>
                      <span>Total</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '4px 0' }}>
                      <span>Fractions Addition</span>
                      <span>Item 1-4</span>
                      <span>Item 5-8</span>
                      <span>8 items</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '4px 0' }}>
                      <span>Decimals Conversion</span>
                      <span>Item 9-12</span>
                      <span>Item 13-16</span>
                      <span>8 items</span>
                    </div>
                    <div style={{ color: '#60a5fa', fontWeight: 700, marginTop: '10px' }}>✓ 100% computed percentages + Answer Key included!</div>
                  </div>
                </div>
              )}

              {currentAgent.id === 'grader' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', marginBottom: '12px' }}>
                    <Camera size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>Optical Camera Paper Grading</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, background: '#131b2e', padding: '18px', borderRadius: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#34d399' }}>48 / 50</div>
                    <div style={{ color: '#e2e8f0', fontWeight: 700, marginTop: '4px' }}>Learner: Juan Dela Cruz</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Score tallied automatically in 1.8 seconds</div>
                    <div style={{ color: '#38bdf8', fontWeight: 700, marginTop: '10px' }}>✓ Recorded directly to digital class record!</div>
                  </div>
                </div>
              )}

              {currentAgent.id === 'slides' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', marginBottom: '12px' }}>
                    <Presentation size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>PowerPoint Presentation Deck (.pptx)</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, background: '#131b2e', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700 }}>Slide 1: Title & Essential Question</div>
                    <div style={{ color: '#fff', fontWeight: 700 }}>Slide 2: Prior Knowledge Check (Quiz)</div>
                    <div style={{ color: '#fff', fontWeight: 700 }}>Slide 3–6: Interactive Core Concepts</div>
                    <div style={{ color: '#fff', fontWeight: 700 }}>Slide 7: Group Challenge & Formative Exit Ticket</div>
                    <div style={{ color: '#fbbf24', fontWeight: 700, marginTop: '10px' }}>✓ Fully editable .pptx with classroom formatting!</div>
                  </div>
                </div>
              )}

              {currentAgent.id === 'research' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', marginBottom: '12px' }}>
                    <GraduationCap size={18} />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>6-Phase Classroom Action Research (CAR)</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, background: '#131b2e', padding: '14px', borderRadius: '10px' }}>
                    <div style={{ color: '#c084fc', fontWeight: 700 }}>Phase 1: Context & Rationale</div>
                    <div style={{ color: '#fff' }}>Phase 2: Innovation, Intervention & Strategy (IIS)</div>
                    <div style={{ color: '#fff' }}>Phase 3: Action Research Questions</div>
                    <div style={{ color: '#fff' }}>Phase 4–6: Methods, Work Plan & Cost Estimates</div>
                    <div style={{ color: '#c084fc', fontWeight: 700, marginTop: '10px' }}>✓ Compliant with DepEd BERF submission standards!</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Killer Feature: Custom Faculty Room ─────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '960px',
          margin: '0 auto 80px',
          padding: '0 20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            padding: '40px 32px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(6,78,59,0.5) 0%, rgba(15,23,42,0.8) 100%)',
            border: '1px solid rgba(52, 211, 153, 0.25)',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'rgba(52, 211, 153, 0.15)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Palette size={26} color="#34d399" />
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 10px', color: '#fff' }}>
            ✨ Build Your Own Dream Faculty Room
          </h2>
          <p style={{ fontSize: '15px', color: '#cbd5e1', maxWidth: '640px', margin: '0 auto 24px', lineHeight: 1.5 }}>
            Don't settle for robotic AI. In kaTuro, you can <strong>rename each co-teacher</strong> (e.g. name them after your favorite partner teacher or mentor), choose their cartoon avatar, and pick their teaching style!
          </p>
          <div style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '6px 14px', borderRadius: '100px' }}>
              ✓ Rename any bot anytime
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '6px 14px', borderRadius: '100px' }}>
              ✓ 12+ Teacher Avatar Presets
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '6px 14px', borderRadius: '100px' }}>
              ✓ 1-Click DiceBear Randomizer
            </span>
          </div>
        </div>
      </section>

      {/* ── Get Started Section ────────────────────────────────────────────────── */}
      <section
        id="get-started"
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '560px',
          margin: '0 auto 80px',
          padding: '0 20px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
            border: '2px solid #34d399',
            borderRadius: '24px',
            padding: '36px 30px',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 50px rgba(52, 211, 153, 0.25)',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              background: '#34d399',
              color: '#064e3b',
              padding: '4px 14px',
              borderRadius: '100px',
            }}
          >
            Everything Included
          </span>

          <h3 style={{ fontSize: '28px', fontWeight: 900, margin: '18px 0 6px', color: '#fff' }}>
            kaTuro AI Faculty Pack
          </h3>
          <p style={{ fontSize: '13px', color: '#a7f3d0', margin: '0 0 20px' }}>
            All 5 Core AI Co-Teachers + Full Platform Access
          </p>

          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px', margin: '0 0 24px' }}>
            {[
              'Sir Dan: Daily Lesson Log (DLL & DLP) with Word .docx',
              'Ma’am Joy: DepEd Table of Specifications (TOS) & Exam Builder',
              'GraderBot: Camera Paper Checker for instant exam grading',
              'SlideCraft: Classroom PowerPoint Presentation (.pptx) generator',
              'Dr. Ben: 6-Phase Classroom Action Research (CAR) Advisor',
              'Custom Faculty Room: Rename & redesign avatars anytime',
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#ecfdf5' }}>
                <CheckCircle2 size={16} color="#34d399" style={{ flexShrink: 0 }} />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <Link
            to="/login"
            style={{
              display: 'block',
              width: '100%',
              padding: '16px',
              borderRadius: '100px',
              background: '#34d399',
              color: '#064e3b',
              fontSize: '17px',
              fontWeight: 900,
              textDecoration: 'none',
              textAlign: 'center',
              boxShadow: '0 0 30px rgba(52, 211, 153, 0.5)',
              boxSizing: 'border-box',
              transition: 'transform 0.2s',
            }}
          >
            Get Started Now
          </Link>

        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: '1px solid rgba(52, 211, 153, 0.15)',
          padding: '24px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <p style={{ margin: '0 0 6px' }}>© {new Date().getFullYear()} kaTuro AI · Para sa bawat Gurong Pilipino 🇵🇭</p>
        <p style={{ margin: 0, fontSize: '11px' }}>
          Built with love to empower teachers and bring balance back to educators' lives.
        </p>
      </footer>

      {/* ── Social Proof Toast Ticker ─────────────────────────────────────────── */}
      {socialProof && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '20px',
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #34d399',
            borderRadius: '14px',
            padding: '12px 18px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '360px',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#059669',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={20} color="#ffffff" />
          </div>
          <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700, color: '#ffffff' }}>
              {socialProof.name} ({socialProof.school})
            </div>
            <div style={{ color: '#a7f3d0' }}>{socialProof.action}</div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{socialProof.time}</div>
          </div>
        </div>
      )}
    </div>
  );
}
