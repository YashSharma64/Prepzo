import React, { useState, useEffect } from 'react';
import { useViewport } from '../hooks/useViewport';

const MOODS = {
  1: 'Poor',
  2: 'Below average',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
};

const getInitials = (name) => {
  if (!name || name === 'Anonymous') return 'A';
  return name.substring(0, 2).toUpperCase();
};

export default function FeedbackSection() {
  // Form State
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const { isMobile } = useViewport();

  // Feedbacks State
  const [feedbacksData, setFeedbacksData] = useState({
    totalReviews: 0,
    averageRating: 0,
    feedbacks: [],
  });
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(true);
  const [fetchError, setFetchError] = useState('');

  const fetchFeedbacks = async () => {
    try {
      setIsLoadingFeedbacks(true);
      const res = await fetch('/api/feedback');
      if (!res.ok) throw new Error('Failed to fetch reviews');
      const data = await res.json();
      setFeedbacksData({
        totalReviews: data.totalReviews || 0,
        averageRating: data.averageRating || 0,
        feedbacks: data.feedbacks || [],
      });
      setFetchError('');
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setIsLoadingFeedbacks(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0 || review.length < 10) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: name.trim() || 'Anonymous',
          subject: subject.trim() || undefined,
          rating,
          review: review.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit feedback');
      }

      setIsSubmitted(true);
      // Re-fetch to update the reviews display
      await fetchFeedbacks();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentDisplayRating = hoverRating || rating;
  const moodLabel = currentDisplayRating ? MOODS[currentDisplayRating] : 'Select a rating';

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', fontFamily: 'sans-serif', padding: '0 20px' }}>
      <hr style={{ border: 'none', borderTop: '1px solid #eaeaea', marginBottom: '40px' }} />
      
      {/* PART 1: SUBMISSION FORM */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: isMobile ? '20px' : '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: '40px', border: '1px solid #f0f0f0' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: '600', color: '#111827' }}>How was your experience?</h2>
        
        {isSubmitted ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ margin: '0 0 8px 0', color: '#111827' }}>Thank you for your feedback!</h3>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '12px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} style={{ color: star <= rating ? '#fbbf24' : '#e5e7eb', fontSize: '24px' }}>★</span>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', gap: '8px', cursor: 'pointer' }} onMouseLeave={() => setHoverRating(0)}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{
                      fontSize: '40px',
                      color: star <= currentDisplayRating ? '#fbbf24' : '#e5e7eb',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={() => setHoverRating(star)}
                    onClick={() => setRating(star)}
                  >
                    ★
                  </span>
                ))}
              </div>
              <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '14px', fontWeight: '500' }}>
                {moodLabel}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>Subject (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SESD"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>Your Review</label>
                <span style={{ fontSize: '12px', color: review.length > 400 ? '#ef4444' : '#6b7280' }}>
                  {review.length}/400
                </span>
              </div>
              <textarea
                placeholder="How did this plan help you? What could be improved?"
                value={review}
                onChange={(e) => setReview(e.target.value.substring(0, 400))}
                rows={4}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }}
              />
              {review.length > 0 && review.length < 10 && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#ef4444' }}>Minimum 10 characters required.</p>
              )}
            </div>

            {submitError && (
              <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={rating === 0 || review.length < 10 || isSubmitting}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: rating === 0 || review.length < 10 || isSubmitting ? '#9ca3af' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: rating === 0 || review.length < 10 || isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>

      {/* PART 2: REVIEWS DISPLAY */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: '0', fontSize: '22px', fontWeight: '600', color: '#111827' }}>Student Reviews</h2>
          {feedbacksData.totalReviews > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#fef3c7', padding: '6px 12px', borderRadius: '999px', fontSize: '14px', fontWeight: '600', color: '#92400e', flexShrink: 0 }}>
              <span style={{ color: '#fbbf24', fontSize: '16px' }}>★</span> {feedbacksData.averageRating.toFixed(1)} ({feedbacksData.totalReviews})
            </div>
          )}
        </div>

        {isLoadingFeedbacks ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px' }}>Loading reviews...</p>
        ) : fetchError ? (
          <p style={{ color: '#ef4444', textAlign: 'center', padding: '20px' }}>{fetchError}</p>
        ) : feedbacksData.feedbacks.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px', backgroundColor: '#f9fafb', borderRadius: '12px' }}>
            No reviews yet. Be the first to share your experience!
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {feedbacksData.feedbacks.slice().reverse().map((fb, idx) => (
              <div key={idx} style={{ padding: '20px', borderRadius: '12px', backgroundColor: '#ffffff', border: '1px solid #f3f4f6', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', color: '#4b5563' }}>
                      {getInitials(fb.studentName)}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: '#111827' }}>
                        {fb.studentName || 'Anonymous'}
                        {fb.subject && <span style={{ color: '#6b7280', fontWeight: '400', fontSize: '14px', marginLeft: '6px' }}>in {fb.subject}</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        {formatTimeAgo(fb.submittedAt)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} style={{ color: star <= fb.rating ? '#fbbf24' : '#e5e7eb', fontSize: '16px' }}>★</span>
                    ))}
                  </div>
                </div>
                <p style={{ margin: '0', color: '#374151', fontSize: '15px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {fb.review}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
