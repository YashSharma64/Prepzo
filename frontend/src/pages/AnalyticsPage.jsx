import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar';
import SkeletonCard from '../components/SkeletonCard';
import api from '../services/api';
import { useViewport } from '../hooks/useViewport';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function StatCard({ label, value, icon, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: '#FFFFFF',
        border: '1.5px solid #E0E0E8',
        borderRadius: 16,
        padding: '24px 28px',
        flex: '1 1 160px',
      minWidth: 0,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#C8C4FF';
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(108,99,255,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#E0E0E8';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: '#6B6B80',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontWeight: 700,
          fontSize: 32,
          color: color || '#0A0A0F',
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </span>
    </motion.div>
  );
}

function ModeBar({ mode, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const emoji = mode === 'survival' ? '🔥' : mode === 'balanced' ? '⚡' : '🎯';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
            fontWeight: 500,
            color: '#0A0A0F',
            textTransform: 'capitalize',
          }}
        >
          {emoji} {mode}
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#6B6B80' }}>
          {count} ({pct}%)
        </span>
      </div>
      <div style={{ background: '#F0F0F5', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ height: '100%', background: color, borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '48px 24px',
      background: '#FFFFFF',
      border: '1.5px solid #E0E0E8',
      borderRadius: 16,
    }}>
      <span style={{ fontSize: 40, display: 'block', marginBottom: 16 }}>📊</span>
      <p style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 16,
        fontWeight: 600,
        color: '#0A0A0F',
        marginBottom: 8,
      }}>
        No data yet
      </p>
      <p style={{
        fontFamily: "'Sora', sans-serif",
        fontSize: 14,
        color: '#6B6B80',
        maxWidth: 320,
        margin: '0 auto',
      }}>
        Generate a study plan first — analytics will appear here automatically.
      </p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isMobile } = useViewport();

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/analytics');
        setData(res.data);
      // eslint-disable-next-line no-unused-vars
      } catch (err) {
        setError('Failed to load analytics. Make sure the backend is running.');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const totalModes = data
    ? (data.modeBreakdown?.survival || 0) +
      (data.modeBreakdown?.balanced || 0) +
      (data.modeBreakdown?.full || 0)
    : 0;

  const topSubjectsList = data?.topSubjects
    ? Object.entries(data.topSubjects).sort((a, b) => b[1] - a[1])
    : [];

  const hasData = data && data.totalPlansGenerated > 0;

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
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontWeight: 700,
              fontSize: isMobile ? 26 : 40,
              color: '#0A0A0F',
              letterSpacing: '-0.03em',
              marginBottom: 8,
            }}
          >
            Platform Analytics
          </h1>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#6B6B80' }}>
            Session-based usage stats — resets when backend restarts
          </p>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
              <SkeletonCard height={110} style={{ flex: '1 1 180px' }} />
              <SkeletonCard height={110} style={{ flex: '1 1 180px' }} />
              <SkeletonCard height={110} style={{ flex: '1 1 180px' }} />
            </div>
            <SkeletonCard height={160} style={{ marginBottom: 32 }} />
            <SkeletonCard height={200} />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            style={{
              background: '#FEF0EE',
              border: '1px solid #E8341C',
              borderRadius: 10,
              padding: '12px 16px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              color: '#E8341C',
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {/* No data yet */}
        {!loading && !error && !hasData && <EmptyState />}

        {/* Data */}
        {!loading && !error && hasData && (
          <>
            {/* Stat Cards */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
              <StatCard label="Plans Generated" value={data.totalPlansGenerated || 0} icon="📋" color="#6C63FF" />
              <StatCard label="Users" value={data.users_count || 0} icon="👥" color="#D4910A" />
            </div>

            {/* Mode Breakdown */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1.5px solid #E0E0E8',
                borderRadius: 16,
                padding: '24px 28px',
                marginBottom: 32,
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#6B6B80',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 20,
                }}
              >
                Mode Breakdown
              </span>
              <ModeBar mode="survival" count={data.modeBreakdown?.survival || 0} total={totalModes} color="#E8341C" />
              <ModeBar mode="balanced" count={data.modeBreakdown?.balanced || 0} total={totalModes} color="#D4910A" />
              <ModeBar mode="full" count={data.modeBreakdown?.full || 0} total={totalModes} color="#0D9E6E" />
            </div>

            {/* Top Subjects */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1.5px solid #E0E0E8',
                borderRadius: 16,
                padding: '24px 28px',
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#6B6B80',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 16,
                }}
              >
                Top Subjects
              </span>
              {topSubjectsList.length === 0 ? (
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#6B6B80' }}>
                  No subjects tracked yet.
                </p>
              ) : (
                topSubjectsList.map(([subjectName, count], i) => (
                  <motion.div
                    key={subjectName}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i < topSubjectsList.length - 1 ? '1px solid #F0F0F5' : 'none',
                    }}
                  >
                    <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 14, color: '#0A0A0F' }}>
                      {subjectName}
                    </span>
                    <span
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 12,
                        color: '#6C63FF',
                        background: '#EEEDFF',
                        padding: '2px 10px',
                        borderRadius: 999,
                      }}
                    >
                      {count} {count === 1 ? 'plan' : 'plans'}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}