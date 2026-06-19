import React, { useRef, useEffect, useState } from 'react';

// Utility to detect standalone mode
function isStandalone() {
  return (
    window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

const SplashScreen = ({ progress, isStandalone }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const animationRef = useRef();

  useEffect(() => {
    // Animate displayProgress toward progress in small increments for smoothness
    if (progress > displayProgress) {
      const step = () => {
        setDisplayProgress(prev => {
          if (progress - prev < 0.5) return progress; // Snap to target if close
          return prev + Math.max((progress - prev) * 0.15, 0.5); // Ease toward target
        });
        if (displayProgress < progress) {
          animationRef.current = requestAnimationFrame(step);
        }
      };
      cancelAnimationFrame(animationRef.current);
      animationRef.current = requestAnimationFrame(step);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [progress]);

  return (
    <div
      id="splash-screen"
      className="fixed inset-0 bg-black z-[9999] flex items-center justify-center transition-opacity duration-500 flex-col"
    >
      <div
        style={{
          position: 'relative',
          width: 260,
          height: 100,
        }}
      >
        {/* Outline Text */}
        <span
          style={{
            fontFamily: 'Onest, Inter, sans-serif',
            fontWeight: 900,
            fontSize: 64,
            letterSpacing: '-2px',
            color: 'transparent',
            WebkitTextStroke: '2px #fff',
            textStroke: '2px #fff',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            userSelect: 'none',
          }}
        >
          BusGo
        </span>
        {/* Blue Fill */}
        <span
          style={{
            fontFamily: 'Onest, Inter, sans-serif',
            fontWeight: 900,
            fontSize: 64,
            letterSpacing: '-2px',
            color: '#2563eb', // Tailwind blue-600
            WebkitTextStroke: '2px #fff',
            textStroke: '2px #fff',
            position: 'absolute',
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            userSelect: 'none',
            overflow: 'hidden',
            clipPath: `inset(${100 - displayProgress}% 0 0 0)`,
            transition: 'clip-path 1.2s cubic-bezier(0.77, 0, 0.175, 1)',
          }}
        >
          BusGo
        </span>
      </div>
    </div>
  );
};

export default SplashScreen; 
