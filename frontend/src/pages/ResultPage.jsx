import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Navbar from '../components/Navbar';
import ModeBanner from '../components/ModeBanner';
import FilterBar from '../components/FilterBar';
import QuestionCard from '../components/QuestionCard';
import TopicInsightsPanel from '../components/TopicInsightsPanel';
import StudySchedulePanel from '../components/StudySchedulePanel';
import FeedbackSection from '../components/FeedbackSection';
import { useViewport } from '../hooks/useViewport';
import { track } from '../utils/analytics';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function ArrowRightIcon({ size = 16, color = '#6C63FF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.33 8H12.67M12.67 8L8.67 4M12.67 8L8.67 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionStats({ questions }) {
  if (!questions || questions.length === 0) return null;

  const must = questions.filter(q => q.priority === 'must').length;
  const should = questions.filter(q => q.priority === 'should').length;
  const optional = questions.filter(q => q.priority === 'optional').length;
  const avgProb = questions.reduce((sum, q) => sum + (q.probability || 0), 0) / questions.length;

  const stats = [
    { label: 'Must Do', value: must, color: '#E8341C', icon: '🔴' },
    { label: 'Should Do', value: should, color: '#D4910A', icon: '🟡' },
    { label: 'Optional', value: optional, color: '#6B6B80', icon: '⚪' },
    { label: 'Avg Probability', value: `${Math.round(avgProb * 100)}%`, color: '#6C63FF', icon: '📊' },
  ];

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.08 }}
          style={{
            flex: '1 1 120px',
            minWidth: 0,
            background: '#FFFFFF',
            border: '1.5px solid #E0E0E8',
            borderRadius: 12,
            padding: '14px 12px',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>{s.icon}</span>
          <span
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: 24,
              color: s.color,
              display: 'block',
              letterSpacing: '-0.02em',
            }}
          >
            {s.value}
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6B6B80', letterSpacing: '0.06em' }}>
            {s.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const getStoredData = () => {
    try {
      return JSON.parse(localStorage.getItem('prepzo_last_result') || '{}');
    } catch {
      return {};
    }
  };

  const rawState = location.state;
  const stored = getStoredData();

  const plan = rawState?.plan || stored?.plan || null;
  const subject = rawState?.subject || stored?.subject || '';
  const examDate = rawState?.examDate || stored?.examDate || '';

  useEffect(() => {
    if (!plan) navigate('/input', { replace: true });
    else track.modeSelected(plan.mode);
  }, [navigate, plan]);

  const [filters, setFilters] = useState({
    priority: [],
    difficulty: [],
    type: [],
  });

  const filteredQuestions = useMemo(() => {
    if (!plan?.questions) return [];
    return plan.questions.filter((q) => {
      const pMatch = filters.priority.length === 0 || filters.priority.includes(q.priority);
      const dMatch = filters.difficulty.length === 0 || filters.difficulty.includes(q.difficulty);
      const tMatch = filters.type.length === 0 || filters.type.includes(q.type);
      return pMatch && dMatch && tMatch;
    });
  }, [plan, filters]);

  if (!plan) return null;

  const modeColor = plan.mode === 'survival' ? '#E8341C' : plan.mode === 'balanced' ? '#D4910A' : '#0D9E6E';

  const handleOpenChat = () => {
    track.chatbotOpened();
    navigate('/chat', { state: { plan, subject, examDate } });
  };

  const handleDownloadPlan = () => {
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.text(`Prepzo Plan: ${subject}`, 14, 20);

    doc.setFontSize(12);
    doc.text(`Mode: ${plan.mode ? plan.mode.toUpperCase() : 'UNKNOWN'} | Exam Date: ${examDate}`, 14, 30);

    doc.setFontSize(16);
    doc.text('Strategy', 14, 45);
    doc.setFontSize(11);
    const splitStrategy = doc.splitTextToSize(plan.strategy || '', 180);
    doc.text(splitStrategy, 14, 55);

    let currentY = 55 + (splitStrategy.length * 5) + 10;

    if (plan.focusTopics && plan.focusTopics.length > 0) {
      doc.setFontSize(16);
      doc.text('Focus Topics', 14, currentY);
      currentY += 10;
      doc.setFontSize(11);
      const topicsText = plan.focusTopics.join(', ');
      const splitTopics = doc.splitTextToSize(topicsText, 180);
      doc.text(splitTopics, 14, currentY);
      currentY += (splitTopics.length * 5) + 10;
    }

    if (plan.questions && plan.questions.length > 0) {
      const tableData = plan.questions.map((q, index) => [
        index + 1,
        q.topic || '-',
        q.question || '',
        q.solution || '',
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Topic', 'Question', 'Solution']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [108, 99, 255] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 30 },
          2: { cellWidth: 70 },
          3: { cellWidth: 70 },
        },
        styles: { fontSize: 9, overflow: 'linebreak' },
      });
    }

    track.planDownloaded();
    doc.save(`prepzo-plan-${subject.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      style={{ background: '#F5F5F5', minHeight: '100vh' }}
    >
      <Navbar />

      <div
        style={{
          paddingTop: 100,
          paddingBottom: 80,
          maxWidth: 800,
          margin: '0 auto',
          paddingLeft: isMobile ? 16 : 24,
          paddingRight: isMobile ? 16 : 24,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div>
            <h1
              style={{
                fontFamily: "'Sora', sans-serif",
                fontWeight: 600,
                fontSize: isMobile ? 26 : 40,
                color: '#0A0A0F',
                letterSpacing: '-0.03em',
                marginBottom: 8,
              }}
            >
              Your <span style={{ color: modeColor, textTransform: 'capitalize' }}>{plan.mode}</span> Plan
            </h1>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#6B6B80' }}>
              {subject} · {examDate}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
            <button
              onClick={() => {
                document.getElementById('feedback-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#6C63FF',
                border: '1.5px solid #6C63FF',
                borderRadius: 999,
                padding: '8px 16px',
                fontFamily: "'Sora', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#FFFFFF',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#5A52D5';
                e.currentTarget.style.borderColor = '#5A52D5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#6C63FF';
                e.currentTarget.style.borderColor = '#6C63FF';
              }}
            >
              ⭐ Give Feedback!
            </button>
            <button
              onClick={handleDownloadPlan}
              title="Download plan as PDF"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#FFFFFF',
                border: '1.5px solid #E0E0E8',
                borderRadius: 999,
                padding: '8px 16px',
                fontFamily: "'Sora', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#6B6B80',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6C63FF';
                e.currentTarget.style.color = '#6C63FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#E0E0E8';
                e.currentTarget.style.color = '#6B6B80';
              }}
            >
              ↓ Download PDF
            </button>
          </div>
        </div>

        <ModeBanner mode={plan.mode} />

        {/* Strategy + Focus Topics */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1.5px solid #E0E0E8',
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 32,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: '#6B6B80',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 12,
              }}
            >
              Strategy
            </span>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 15, color: '#0A0A0F', lineHeight: 1.7 }}>
              {plan.strategy}
            </p>
          </div>

          <div>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                color: '#6B6B80',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 12,
              }}
            >
              Focus Topics
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {plan.focusTopics?.map((t, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: '#EEEDFF',
                    border: '1px solid #C8C4FF',
                    color: '#4A44AA',
                    borderRadius: 999,
                    padding: '5px 14px',
                    fontFamily: "'Sora', sans-serif",
                    fontSize: 13,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <QuestionStats questions={plan.questions} />

        {/* Study Schedule */}
        <StudySchedulePanel schedule={plan.studySchedule} />

        {/* Topic Insights */}
        <TopicInsightsPanel topicInsights={plan.topicInsights} />

        {/* Filters */}
        <FilterBar filters={filters} setFilters={handleFilterChange} />

        <div
          style={{
            borderTop: '1px solid #E0E0E8',
            paddingTop: 16,
            marginBottom: 24,
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            color: '#6B6B80',
          }}
        >
          Showing {filteredQuestions.length} of {plan.questions?.length || 0} questions
        </div>

        {/* Question Cards */}
        <div>
          {filteredQuestions.map((q, i) => (
            <QuestionCard key={i} question={q} index={i} />
          ))}
          {filteredQuestions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6B6B80', fontFamily: "'Sora', sans-serif" }}>
              No questions match the current filters.
            </div>
          )}
        </div>

        {/* Chat CTA */}
        <div
          style={{
            background: '#1A1626',
            borderRadius: 20,
            padding: '28px 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 40,
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'Sora', sans-serif",
                fontWeight: 600,
                fontSize: 18,
                color: '#F0F0FF',
                letterSpacing: '-0.02em',
                marginBottom: 4,
              }}
            >
              Questions about your plan?
            </p>
            <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: 'rgba(240,240,255,0.55)' }}>
              Ask Prepzo to explain, simplify, or go deeper.
            </p>
          </div>
          <button
            onClick={handleOpenChat}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              background: '#FFFFFF',
              color: '#0A0A0F',
              fontSize: 15,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 500,
              paddingLeft: 24,
              paddingRight: 6,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 999,
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EEEDFF')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
          >
            Open Chat
            <span
              style={{
                background: '#F0EEFF',
                borderRadius: '50%',
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowRightIcon size={16} />
            </span>
          </button>
        </div>

        {/* Feedback Section */}
        <div id="feedback-section">
          <FeedbackSection />
        </div>
      </div>
    </motion.div>
  );
}