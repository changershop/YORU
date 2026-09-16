import React from 'react';

export interface SkipToContentProps {
  targetId?: string;
}

export const SkipToContent: React.FC<SkipToContentProps> = ({ targetId = 'main-content' }) => {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[250] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:font-bold focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white transition-transform"
    >
      Skip to main content
    </a>
  );
};
