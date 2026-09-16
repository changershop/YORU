import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const BackToTop: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      
      setIsVisible(scrollY > 350);
      if (windowHeight > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (scrollY / windowHeight) * 100)));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          id="back-to-top-btn"
          onClick={scrollToTop}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="fixed bottom-20 md:bottom-8 right-6 z-40 p-3 rounded-full bg-yoru-surface-elevated/90 hover:bg-yoru-surface border border-white/10 hover:border-white/30 text-white shadow-xl backdrop-blur-md transition-all group focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Back to top of page"
          title="Back to top"
        >
          <div className="relative flex items-center justify-center">
            {/* Circular progress SVG */}
            <svg className="w-9 h-9 -rotate-90 pointer-events-none" viewBox="0 0 36 36">
              <path
                className="text-white/10"
                strokeWidth="2.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-indigo-400 transition-all duration-100"
                strokeDasharray={`${scrollProgress}, 100`}
                strokeWidth="2.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <ArrowUp className="w-4 h-4 absolute text-white group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
};
