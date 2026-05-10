import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import TopicChip from '../components/TopicChip';
import SkeletonInsights from '../components/SkeletonInsights';
import ErrorState from '../components/ErrorState';
import { generatePlan, uploadPdf } from '../services/api';
import { useViewport } from '../hooks/useViewport';
import { useUser } from '@clerk/react';
import { savePlan } from '../services/supabase';
import { track } from '../utils/analytics';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

function ArrowRightIcon({ size = 16, color = '#000000' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.33 8H12.67M12.67 8L8.67 4M12.67 8L8.67 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function calculateDaysRemaining(dateString) {
  if (!dateString) return null;
  const examDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = examDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export default function InputPage() {
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const { user } = useUser();
  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [currentTopic, setCurrentTopic] = useState('');
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [pdfName, setPdfName] = useState(null);
  const fileInputRef = useRef(null);

  const [pdfText, setPdfText] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [clustering, setClustering] = useState(null);
  const [patternAnalysis, setPatternAnalysis] = useState(null);
  const [planRetry, setPlanRetry] = useState(null);

  const location = useLocation();

  useEffect(() => {
    if (location.state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (location.state.addedTopics) setTopics(location.state.addedTopics);
      if (location.state.subject) setSubject(location.state.subject);
      if (location.state.examDate) setExamDate(location.state.examDate);
      if (location.state.clustering) setClustering(location.state.clustering);
      if (location.state.patternAnalysis) setPatternAnalysis(location.state.patternAnalysis);
      if (location.state.pdfName) setPdfName(location.state.pdfName);

      if (location.state.autoGenerate) {
        window.history.replaceState({}, document.title);
        setTimeout(() => document.getElementById('generateBtn')?.click(), 100);
      }
    }
  }, [location.state]);

  const daysRemaining = useMemo(() => calculateDaysRemaining(examDate), [examDate]);

  const handleAddTopic = () => {
    const trimmed = currentTopic.trim();
    if (trimmed && !topics.includes(trimmed)) {
      setTopics([...topics, trimmed]);
      setCurrentTopic('');
      track.topicChipSelected(trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTopic();
    }
  };

  const handleRemoveTopic = (topicToRemove) => {
    setTopics(topics.filter((t) => t !== topicToRemove));
  };

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      return;
    }
    if (file.size > MAX_PDF_SIZE) {
      setError('File too large. Please upload a PDF under 10 MB.');
      return;
    }
    setPdfName(file.name);
    setError('');
    setPdfLoading(true);

    try {
      const response = await uploadPdf(file);
      setPdfText(response.data.extracted_text_preview || '');
      if (response.data.detectedTopics && response.data.detectedTopics.length > 0) {
        setTopics((prev) => [...new Set([...prev, ...response.data.detectedTopics])]);
      }
      if (response.data.clustering) {
        setClustering(response.data.clustering);
      }
      if (response.data.patternAnalysis) {
        setPatternAnalysis(response.data.patternAnalysis);
      }
      track.pdfUploaded(subject, Math.round(file.size / 1024));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to process PDF.';
      setError(msg);
      setPdfName(null);
      track.errorOccurred('pdf_upload', msg);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!subject.trim()) return setError('Please enter a subject.');
    if (!examDate) return setError('Please select an exam date.');
    if (topics.length === 0) return setError('Please add at least one topic or upload a syllabus.');

    setLoading(true);
    setError('');
    setPlanRetry(null);

    try {
      const response = await generatePlan({
        subject,
        examDate,
        topics,
        pdfText,
      });
      localStorage.setItem(
        'prepzo_last_result',
        JSON.stringify({ plan: response.data, subject, examDate, patternAnalysis })
      );
      if (user?.id) {
        savePlan(user.id, subject, examDate, response.data).catch(console.error);
      }
      track.studyPlanGenerated(subject, response.data.mode, topics.length, response.data.questions?.length || 0);
      navigate('/result', { state: { plan: response.data, subject, examDate } });
    } catch (err) {
      const msg = err.response?.data?.detail || 'Failed to generate plan. Please try again.';
      setError(msg);
      track.errorOccurred('plan_generation', msg);
      setPlanRetry(() => handleGeneratePlan);
      setLoading(false);
    }
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
          position: 'relative',
          zIndex: 10,
          paddingTop: 100,
          paddingBottom: 80,
          maxWidth: 560,
          margin: '0 auto',
          paddingLeft: isMobile ? 16 : 24,
          paddingRight: isMobile ? 16 : 24,
        }}
      >
        <div style={{ marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: isMobile ? 30 : 44,
              color: '#0A0A0F',
              letterSpacing: isMobile ? '-0.02em' : '-0.04em',
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            Prepare smarter.<br />Not harder.
          </h1>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#6B6B80',
            }}
          >
            Fill in your exam details and let Prepzo build your study plan.
          </p>
        </div>

        {error && <ErrorState message={error} onRetry={planRetry} />}

        {/* Subject */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6B6B80',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            Subject
          </label>
          <input
            type="text"
            placeholder="e.g. Software Engineering & System Design"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{
              width: '100%',
              background: '#FFFFFF',
              border: '1.5px solid #E0E0E8',
              borderRadius: 12,
              padding: '14px 16px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#0A0A0F',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#6C63FF';
              e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.12)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E0E0E8';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Exam Date */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6B6B80',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            Exam Date
          </label>
          <input
            type="date"
            min={new Date().toISOString().split('T')[0]}
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            style={{
              width: '100%',
              background: '#FFFFFF',
              border: '1.5px solid #E0E0E8',
              borderRadius: 12,
              padding: '14px 16px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              color: '#0A0A0F',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#6C63FF';
              e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.12)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E0E0E8';
              e.target.style.boxShadow = 'none';
            }}
          />

          <AnimatePresence>
            {daysRemaining !== null && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{ marginTop: 12 }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    background: daysRemaining <= 3 ? '#FFF0EE' : daysRemaining <= 7 ? '#FFF8E7' : '#EEFAF5',
                    border: `1px solid ${daysRemaining <= 3 ? '#E8341C' : daysRemaining <= 7 ? '#D4910A' : '#0D9E6E'}`,
                    borderRadius: 999,
                    padding: '4px 14px',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 13,
                    color: daysRemaining <= 3 ? '#E8341C' : daysRemaining <= 7 ? '#D4910A' : '#0D9E6E',
                  }}
                >
                  ⏳ {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Topics */}
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6B6B80',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            Topics
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Enter a topic..."
              value={currentTopic}
              onChange={(e) => setCurrentTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                flex: 1,
                background: '#FFFFFF',
                border: '1.5px solid #E0E0E8',
                borderRadius: 12,
                padding: '14px 16px',
                fontFamily: "'Sora', sans-serif",
                fontSize: 15,
                color: '#0A0A0F',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#6C63FF';
                e.target.style.boxShadow = '0 0 0 3px rgba(108,99,255,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E0E0E8';
                e.target.style.boxShadow = 'none';
              }}
            />
            <button
              type="button"
              onClick={handleAddTopic}
              style={{
                background: '#6C63FF',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontFamily: "'Sora', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#5B54E6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#6C63FF')}
            >
              + Add
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <AnimatePresence>
              {topics.map((topic, index) => (
                <motion.div
                  key={topic}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <TopicChip label={topic} onRemove={() => handleRemoveTopic(topic)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* PDF Upload */}
        <div style={{ marginBottom: 32 }}>
          <label
            style={{
              display: 'block',
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6B6B80',
              letterSpacing: '0.08em',
              marginBottom: 8,
              textTransform: 'uppercase',
            }}
          >
            Syllabus PDF (Optional)
          </label>
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: dragActive ? '#EEEDFF' : '#FFFFFF',
              border: `1.5px dashed ${dragActive ? '#6C63FF' : '#C8C4FF'}`,
              borderRadius: 16,
              minHeight: 120,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <input
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {pdfLoading ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 24, height: 24, border: '3px solid #E0E0E8',
                  borderTopColor: '#6C63FF', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                }} />
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6B6B80' }}>
                  Processing PDF...
                </p>
              </div>
            ) : pdfName ? (
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 24, marginBottom: 8, display: 'block' }}>✅</span>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#0D9E6E', fontWeight: 500 }}>
                  {pdfName} loaded
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="#C8C4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20" stroke="#C8C4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6B6B80' }}>
                  Drop PDF here or click to browse
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Skeleton while PDF loads */}
        {pdfLoading && <SkeletonInsights />}

        {/* PDF Analysis Badge */}
        {!pdfLoading && (clustering || patternAnalysis) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: '#FFFFFF',
              border: '1.5px solid #E0E0E8',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🧠</span>
              <div>
                <span style={{ display: 'block', fontFamily: "'Sora', sans-serif", fontSize: 14, fontWeight: 600, color: '#0A0A0F', marginBottom: 2 }}>
                  PDF Analysis Complete
                </span>
                <span style={{ display: 'block', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6B6B80' }}>
                  {clustering?.clusters?.length || 0} clusters, {patternAnalysis?.totalQuestionsAnalyzed || 0} patterns found
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate('/insights', { state: { clustering, patternAnalysis, topics, subject, examDate, pdfName } })}
              style={{
                background: '#EEEDFF',
                color: '#6C63FF',
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                fontFamily: "'Sora', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#DFDDFF')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#EEEDFF')}
            >
              View Full Analysis →
            </button>
          </motion.div>
        )}

        {/* Generate Button */}
        <button
          id="generateBtn"
          onClick={handleGeneratePlan}
          disabled={loading}
          style={{
            width: '100%',
            height: 52,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#0A0A0F',
            color: '#FFFFFF',
            fontSize: 16,
            fontFamily: "'Sora', sans-serif",
            fontWeight: 500,
            paddingLeft: 28,
            paddingRight: 8,
            borderRadius: 999,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            border: 'none',
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#1A1626'; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = '#0A0A0F'; }}
        >
          {loading ? (
            <>
              <div style={{
                width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#FFFFFF', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Analyzing...
            </>
          ) : (
            <>
              Generate My Plan
              <span style={{
                background: '#FFFFFF',
                borderRadius: '50%',
                padding: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ArrowRightIcon size={16} color="#0A0A0F" />
              </span>
            </>
          )}
        </button>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </motion.div>
  );
}