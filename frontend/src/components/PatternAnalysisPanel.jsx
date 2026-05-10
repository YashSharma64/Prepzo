import { motion } from 'framer-motion';
import { useViewport } from '../hooks/useViewport';

const categoryColors = {
  'Implementation/Coding': { bg: '#F0FDF4', color: '#15803D' },
  'Definition/Recall': { bg: '#EEF6FF', color: '#2563EB' },
  'Comparison': { bg: '#FFF8E8', color: '#D4910A' },
  'Explanation': { bg: '#EEEDFF', color: '#4A44AA' },
  'Analysis': { bg: '#FEF0EE', color: '#E8341C' },
  'Design': { bg: '#F0FDF4', color: '#0D9E6E' },
  'MCQ/Objective': { bg: '#EEF6FF', color: '#6C63FF' },
  'Listing': { bg: '#F8F8FF', color: '#6B6B80' },
  'Problem Solving': { bg: '#FFF8E8', color: '#D4910A' },
  'General Theory': { bg: '#F8F8FF', color: '#6B6B80' },
};

function CategoryBar({ category, percentage }) {
  const cfg = categoryColors[category] || categoryColors['General Theory'];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#0A0A0F' }}>
          {category}
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: cfg.color, flexShrink: 0, marginLeft: 8 }}>
          {percentage}%
        </span>
      </div>
      <div style={{ background: '#F0F0F5', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', background: cfg.color, borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

function PatternCard({ pattern, index, isMobile }) {
  const cfg = categoryColors[pattern.category] || categoryColors['General Theory'];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      style={{
        background: '#FAFAFF',
        border: '1px solid #E0E0E8',
        borderRadius: 10,
        padding: isMobile ? '12px 14px' : '14px 16px',
        marginBottom: 10,
      }}
    >
      {/* Badge row — wraps on mobile */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
      }}>
        <span
          style={{
            fontSize: 11,
            background: cfg.bg,
            color: cfg.color,
            padding: '2px 8px',
            borderRadius: 999,
            fontFamily: "'DM Mono', monospace",
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {pattern.category}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6B6B80', whiteSpace: 'nowrap' }}>
            Appeared {pattern.frequency}x
          </span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6C63FF',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {Math.round(pattern.probability * 100)}% likely
          </span>
        </div>
      </div>
      <p style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: isMobile ? 12 : 13,
        color: '#0A0A0F',
        lineHeight: 1.5,
        margin: 0,
      }}>
        {pattern.pattern}
      </p>
    </motion.div>
  );
}

export default function PatternAnalysisPanel({ analysis }) {
  const { isMobile } = useViewport();

  if (!analysis || analysis.totalQuestionsAnalyzed === 0) return null;

  const { patterns, categoryBreakdown, topicCorrelation, totalQuestionsAnalyzed } = analysis;
  const categories = Object.entries(categoryBreakdown);
  const correlations = Object.entries(topicCorrelation || {});

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1.5px solid #E0E0E8',
        borderRadius: 16,
        padding: isMobile ? '18px 16px' : '24px 28px',
        marginBottom: 24,
      }}
    >
      {/* Header — stacks on mobile */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ minWidth: 0 }}>
          <span
            title="We use math (Cosine Similarity) to find questions that are frequently asked in the same way."
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#6B6B80',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 4,
              cursor: 'help',
            }}
          >
            Document Pattern Analysis — Cosine Similarity
          </span>
          <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#6B6B80' }}>
            Detected repeating question patterns from your uploaded document
          </span>
        </div>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 12,
            color: '#6C63FF',
            background: '#EEEDFF',
            padding: '4px 12px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {totalQuestionsAnalyzed} questions analyzed
        </span>
      </div>

      {/* Category Breakdown */}
      {categories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              color: '#6B6B80',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 12,
            }}
          >
            Question Type Distribution
          </span>
          {categories.map(([cat, pct]) => (
            <CategoryBar key={cat} category={cat} percentage={pct} />
          ))}
        </div>
      )}

      {/* Topic Correlations */}
      {correlations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              color: '#6B6B80',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 12,
            }}
          >
            Topic × Question Type Correlation
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {correlations.map(([topic, data]) => {
              const cfg = categoryColors[data.most_common_type] || categoryColors['General Theory'];
              return (
                <span
                  key={topic}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#F8F8FF',
                    border: '1px solid #E0E0E8',
                    borderRadius: 999,
                    padding: '5px 12px',
                    fontFamily: "'Sora', sans-serif",
                    fontSize: isMobile ? 11 : 12,
                    flexWrap: 'nowrap',
                    maxWidth: '100%',
                  }}
                >
                  <strong style={{ color: '#0A0A0F', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{topic}</strong>
                  <span style={{ color: '#6B6B80' }}>→</span>
                  <span style={{ color: cfg.color, fontFamily: "'DM Mono', monospace", fontSize: 11, whiteSpace: 'nowrap' }}>
                    {data.most_common_type} ({data.frequency}x)
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Patterns */}
      {patterns.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              color: '#6B6B80',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 12,
            }}
          >
            Most Repeated Patterns
          </span>
          {patterns.slice(0, 8).map((p, i) => (
            <PatternCard key={i} pattern={p} index={i} isMobile={isMobile} />
          ))}
        </div>
      )}
    </div>
  );
}
