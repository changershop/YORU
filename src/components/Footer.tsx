import React from 'react';
import { Logo } from './Navigation';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-white/5 bg-[#020204] text-xs text-white/60 relative z-10 mt-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Brand & Mission */}
          <div className="space-y-3 max-w-lg">
            <Link to="/home">
              <Logo />
            </Link>
            <p className="text-xs text-yoru-text-muted leading-relaxed">
              YORU is a cinematic anime streaming hub featuring high-bitrate playback, synchronized multi-server mirrors, and official multi-audio dubs for an uncompromising viewing experience.
            </p>
          </div>

          {/* Community Link */}
          <div>
            <Link
              to="/community"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-zinc-300 hover:text-white hover:bg-white/[0.06] transition"
            >
              <Shield className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-xs">Community & Guidelines</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5 bg-[#010102] py-5 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-zinc-400">
          <div>
            &copy; {new Date().getFullYear()} YORU Entertainment. All anime trademarks and metadata belong to their respective creators and production committees.
          </div>
          <div className="flex items-center gap-4">
            <span className="hover:text-white transition cursor-pointer">Privacy Policy</span>
            <span className="text-white/10">|</span>
            <span className="hover:text-white transition cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

