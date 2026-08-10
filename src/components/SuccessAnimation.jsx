import React, { useEffect } from 'react';

export function playSuccessChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.45);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.5);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (e) {
    // Audio not available — silently skip
  }
}

export default function SuccessAnimation({ show, title = "Saved Successfully!", subtitle = "Transaction updated ✓", onClose }) {
  useEffect(() => {
    if (show) {
      playSuccessChime();
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)',
      animation: 'fpFadeIn 0.2s ease'
    }}>
      <style>{`
        @keyframes fpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fpScaleIn { from { transform: scale(0.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes fpCheckDraw { from { stroke-dashoffset: 80 } to { stroke-dashoffset: 0 } }
        @keyframes fpRing1 { 0% { transform: scale(0.6); opacity: 1 } 100% { transform: scale(2.2); opacity: 0 } }
        @keyframes fpRing2 { 0% { transform: scale(0.6); opacity: 1 } 100% { transform: scale(2.8); opacity: 0 } }
      `}</style>
      <div style={{
        background: 'white',
        borderRadius: 24,
        padding: '40px 56px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        animation: 'fpScaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        position: 'relative'
      }}>
        {/* Ripple rings */}
        <div style={{
          position: 'absolute', width: 120, height: 120,
          borderRadius: '50%', border: '4px solid #22c55e',
          animation: 'fpRing1 1.2s ease-out 0.2s both'
        }} />
        <div style={{
          position: 'absolute', width: 120, height: 120,
          borderRadius: '50%', border: '3px solid #86efac',
          animation: 'fpRing2 1.4s ease-out 0.3s both'
        }} />
        {/* Circle + checkmark */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(34,197,94,0.5)'
        }}>
          <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
            <path
              d="M10 22L18 30L32 14"
              stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="80" strokeDashoffset="0"
              style={{ animation: 'fpCheckDraw 0.4s ease 0.25s both' }}
            />
          </svg>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>{title}</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
