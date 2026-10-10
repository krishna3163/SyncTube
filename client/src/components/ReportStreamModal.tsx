import React, { useState } from 'react';
import { Flag, CheckCircle2, X } from 'lucide-react';

export interface ReportStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  streamTitle?: string;
  currentTime?: number;
  onNotify: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam, scam, or fraudulent content' },
  { id: 'inappropriate', label: 'Inappropriate or sexually explicit material' },
  { id: 'copyright', label: 'Copyright or intellectual property infringement' },
  { id: 'harassment', label: 'Harassment, hate speech, or cyberbullying' },
  { id: 'violence', label: 'Violence, self-harm, or illegal acts' },
  { id: 'misleading', label: 'Misleading metadata, title, or thumbnail' },
  { id: 'other', label: 'Other terms of service violation' },
];

export const ReportStreamModal: React.FC<ReportStreamModalProps> = ({
  isOpen,
  onClose,
  roomId,
  streamTitle = 'Live Stream',
  currentTime = 0,
  onNotify,
}) => {
  const [selectedReason, setSelectedReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    onNotify('Your report has been submitted to moderators. Thank you for keeping SyncTube safe.', 'success');
    setTimeout(() => {
      setIsSubmitted(false);
      setDetails('');
      onClose();
    }, 1800);
  };

  const formatTimestamp = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content report-stream-modal glass card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-with-icon">
            <div className="modal-icon-badge error-badge">
              <Flag size={20} color="#f87171" />
            </div>
            <div>
              <h3>Report Stream</h3>
              <p className="modal-subtitle">Flag inappropriate content or room violations</p>
            </div>
          </div>
          <button type="button" className="btn-icon modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isSubmitted ? (
          <div className="report-success-state">
            <CheckCircle2 size={48} color="#10b981" />
            <h4>Report Received</h4>
            <p>Our moderation team is investigating this broadcast. Action will be taken promptly if violations are verified.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-body report-modal-body">
            <div className="report-stream-target">
              <span className="target-label">Reporting:</span>
              <strong className="target-title">{streamTitle}</strong>
              <span className="target-room">Room #{roomId}</span>
            </div>

            <div className="report-reasons-list">
              <span className="report-section-label">Select Issue</span>
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className={`report-reason-item ${selectedReason === r.id ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="reportReason"
                    value={r.id}
                    checked={selectedReason === r.id}
                    onChange={() => setSelectedReason(r.id)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <div className="report-timestamp-opt">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={(e) => setIncludeTimestamp(e.target.checked)}
                />
                <span>Include current stream timestamp ({formatTimestamp(currentTime)})</span>
              </label>
            </div>

            <div className="report-details-group">
              <label className="report-section-label" htmlFor="reportDetails">
                Additional Details (Optional)
              </label>
              <textarea
                id="reportDetails"
                rows={3}
                placeholder="Provide timestamps or specific details to help moderators review..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="report-textarea"
                maxLength={500}
              />
              <span className="report-char-count">{details.length}/500</span>
            </div>

            <div className="modal-footer report-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger report-submit-btn">
                <Flag size={14} />
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
