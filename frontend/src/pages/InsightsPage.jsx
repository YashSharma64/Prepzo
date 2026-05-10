import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import { track } from '../utils/analytics';
import { useViewport } from '../hooks/useViewport';
import ClusteringPanel from '../components/ClusteringPanel';
import PatternAnalysisPanel from '../components/PatternAnalysisPanel';

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

export default function InsightsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const clustering = location.state?.clustering || null;
  const patternAnalysis = location.state?.patternAnalysis || null;
  const topics = location.state?.topics || [];
  const subject = location.state?.subject || '';
  const examDate = location.state?.examDate || '';
  const pdfName = location.state?.pdfName || 'your PDF';

  const handleAddTopic = (topic) => {
    track.topicChipSelected(topic);
    const updatedTopics = topics.includes(topic) ? topics : [...topics, topic];
    navigate('/input', {
      state: {
        addedTopics: updatedTopics,
        subject,
        examDate,
        clustering,
        patternAnalysis,
        pdfName,
      },
    });
  };

  const hasData = clustering?.clusters?.length > 0 || patternAnalysis?.totalQuestionsAnalyzed > 0;

  if (!hasData) {
    return (
      <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.4 }}>
        <Navbar />
        <div style={{ paddingTop: 120, textAlign: 'center', maxWidth: 500, margin: '0 auto', padding: '0 24px' }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>📄</span>
          <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: 24, color: '#0A0A0F', marginBottom: 12 }}>
            No PDF Analysis Available
          </h2>
          <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6B6B80', marginBottom: 24 }}>
            Upload a syllabus or past paper PDF on the input page to see ML-powered insights.
          </p>
          <button
            onClick={() => navigate('/input')}
            style={{
              background: '#0A0A0F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 999,
              padding: '12px 28px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ← Back to Input
          </button>
        </div>
      </motion.div>
    );
  }

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
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => navigate('/input')}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#6B6B80',
              cursor: 'pointer',
              padding: 0,
              marginBottom: 16,
              display: 'block',
            }}
            onMouseEnter={(e) => (e.target.style.color = '#6C63FF')}
            onMouseLeave={(e) => (e.target.style.color = '#6B6B80')}
          >
            ← Back to Input
          </button>

          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: isMobile ? 26 : 40,
              color: '#0A0A0F',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              marginBottom: 8,
            }}
          >
            PDF Insights
          </h1>
          <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6B6B80', marginBottom: 8 }}>
            ML-powered analysis of <strong style={{ color: '#6C63FF' }}>{pdfName}</strong>
          </p>

          {/* Stats summary */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {clustering?.clusters?.length > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#EEEDFF',
                  border: '1px solid #C8C4FF',
                  color: '#4A44AA',
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                }}
              >
                🧠 {clustering.clusters.length} topic clusters
              </span>
            )}
            {patternAnalysis?.totalQuestionsAnalyzed > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#EEFAF5',
                  border: '1px solid #0D9E6E',
                  color: '#0D9E6E',
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                }}
              >
                📊 {patternAnalysis.totalQuestionsAnalyzed} questions analyzed
              </span>
            )}
            {patternAnalysis?.patterns?.length > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#FFF8E8',
                  border: '1px solid #D4910A',
                  color: '#D4910A',
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 12,
                }}
              >
                🔄 {patternAnalysis.patterns.length} repeating patterns
              </span>
            )}
          </div>
        </div>

        {/* ML Model 3: K-Means Clustering */}
        <ClusteringPanel clustering={clustering} onAddTopic={handleAddTopic} />

        {/* ML Model 5: Pattern Analysis */}
        <PatternAnalysisPanel analysis={patternAnalysis} />

        {/* Bottom CTA */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/input')}
            style={{
              flex: '1 1 140px',
              height: 48,
              background: '#FFFFFF',
              color: '#0A0A0F',
              border: '1.5px solid #E0E0E8',
              borderRadius: 999,
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6C63FF')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#E0E0E8')}
          >
            ← Edit Topics
          </button>
          <button
            onClick={() => navigate('/input', { state: { autoGenerate: true, subject, examDate, addedTopics: topics } })}
            style={{
              flex: '1 1 160px',
              height: 48,
              background: '#0A0A0F',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 999,
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1A1626')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#0A0A0F')}
          >
            Generate My Plan →
          </button>
        </div>
      </div>
    </motion.div>
  );
}
