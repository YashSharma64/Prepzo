import { motion } from 'framer-motion';
import { useViewport } from '../hooks/useViewport';

export default function ClusteringPanel({ clustering, onAddTopic }) {
  const { isMobile } = useViewport();

  if (!clustering || !clustering.clusters || clustering.clusters.length === 0) return null;

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
      <div style={{ marginBottom: 16 }}>
        <span
          title="We use machine learning (K-Means) to automatically group related topics from your text together."
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
          K-Means Topic Clustering — Auto-Discovered
        </span>
        <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: '#6B6B80' }}>
          ML detected {clustering.clusters.length} topic groups from your PDF
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
        {clustering.clusters.map((cluster, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            style={{
              background: '#FAFAFF',
              border: '1px solid #E0E0E8',
              borderRadius: 12,
              padding: '16px',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#C8C4FF';
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(108,99,255,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#E0E0E8';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Cluster label + confidence */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#0A0A0F',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginRight: 8,
                }}
                title={cluster.label}
              >
                {cluster.label}
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: '#6C63FF',
                  background: '#EEEDFF',
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {Math.round(cluster.confidence * 100)}%
              </span>
            </div>

            {/* Keywords */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
              {cluster.keywords.map((kw, ki) => (
                <span
                  key={ki}
                  style={{
                    fontSize: 10,
                    fontFamily: "'DM Mono', monospace",
                    color: '#6B6B80',
                    background: '#F0F0F5',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>

            {/* Segment count + Add button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6B6B80' }}>
                {cluster.segment_count} segments
              </span>
              <button
                onClick={() => onAddTopic(cluster.label)}
                style={{
                  background: '#6C63FF',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 11,
                  fontFamily: "'Sora', sans-serif",
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.background = '#5B54E6')}
                onMouseLeave={(e) => (e.target.style.background = '#6C63FF')}
              >
                + Add
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
