import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { Logo } from '../components/Navigation';
import { motion } from 'motion/react';
import desktopMoonBg from '../assets/images/yoru_desktop_moon_opt.webp';
import mobileMoonBg from '../assets/images/yoru_mobile_moon_opt.webp';

// Official Brand SVGs requested by user
const FacebookIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M16,2c-7.732,0-14,6.268-14,14,0,6.566,4.52,12.075,10.618,13.588v-9.31h-2.887v-4.278h2.887v-1.843c0-4.765,2.156-6.974,6.835-6.974,.887,0,2.417,.174,3.043,.348v3.878c-.33-.035-.904-.052-1.617-.052-2.296,0-3.183,.87-3.183,3.13v1.513h4.573l-.786,4.278h-3.787v9.619c6.932-.837,12.304-6.74,12.304-13.897,0-7.732-6.268-14-14-14Z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.202,2.098c-1.49,.07-2.507,.308-3.396,.657-.92,.359-1.7,.84-2.477,1.619-.776,.779-1.254,1.56-1.61,2.481-.345,.891-.578,1.909-.644,3.4-.066,1.49-.08,1.97-.073,5.771s.024,4.278,.096,5.772c.071,1.489,.308,2.506,.657,3.396,.359,.92,.84,1.7,1.619,2.477,.779,.776,1.559,1.253,2.483,1.61,.89,.344,1.909,.579,3.399,.644,1.49,.065,1.97,.08,5.771,.073,3.801-.007,4.279-.024,5.773-.095s2.505-.309,3.395-.657c.92-.36,1.701-.84,2.477-1.62s1.254-1.561,1.609-2.483c.345-.89,.579-1.909,.644-3.398,.065-1.494,.081-1.971,.073-5.773s-.024-4.278-.095-5.771-.308-2.507-.657-3.397c-.36-.92-.84-1.7-1.619-2.477s-1.561-1.254-2.483-1.609c-.891-.345-1.909-.58-3.399-.644s-1.97-.081-5.772-.074-4.278,.024-5.771,.096m.164,25.309c-1.365-.059-2.106-.286-2.6-.476-.654-.252-1.12-.557-1.612-1.044s-.795-.955-1.05-1.608c-.192-.494-.423-1.234-.487-2.599-.069-1.475-.084-1.918-.092-5.656s.006-4.18,.071-5.656c.058-1.364,.286-2.106,.476-2.6,.252-.655,.556-1.12,1.044-1.612s.955-.795,1.608-1.05c.493-.193,1.234-.422,2.598-.487,1.476-.07,1.919-.084,5.656-.092,3.737-.008,4.181,.006,5.658,.071,1.364,.059,2.106,.285,2.599,.476,.654,.252,1.12,.555,1.612,1.044s.795,.954,1.051,1.609c.193,.492,.422,1.232,.486,2.597,.07,1.476,.086,1.919,.093,5.656,.007,3.737-.006,4.181-.071,5.656-.06,1.365-.286,2.106-.476,2.601-.252,.654-.556,1.12-1.045,1.612s-.955,.795-1.608,1.05c-.493,.192-1.234,.422-2.597,.487-1.476,.069-1.919,.084-5.657,.092s-4.18-.007-5.656-.071M21.779,8.517c.002,.928,.755,1.679,1.683,1.677s1.679-.755,1.677-1.683c-.002-.928-.755-1.679-1.683-1.677,0,0,0,0,0,0-.928,.002-1.678,.755-1.677,1.683m-12.967,7.496c.008,3.97,3.232,7.182,7.202,7.174s7.183-3.232,7.176-7.202c-.008-3.97-3.233-7.183-7.203-7.175s-7.182,3.233-7.174,7.203m2.522-.005c-.005-2.577,2.08-4.671,4.658-4.676,2.577-.005,4.671,2.08,4.676,4.658,.005,2.577-2.08,4.671-4.658,4.676-2.577,.005-4.671-2.079-4.676-4.656h0" />
  </svg>
);

const DiscordIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M26.413,6.536c-1.971-.902-4.052-1.543-6.189-1.904-.292,.523-.557,1.061-.793,1.612-2.277-.343-4.592-.343-6.869,0-.236-.551-.5-1.089-.793-1.612-2.139,.365-4.221,1.006-6.194,1.909C1.658,12.336,.596,17.987,1.127,23.558h0c2.294,1.695,4.861,2.984,7.591,3.811,.615-.827,1.158-1.704,1.626-2.622-.888-.332-1.744-.741-2.56-1.222,.215-.156,.425-.316,.628-.472,4.806,2.26,10.37,2.26,15.177,0,.205,.168,.415,.328,.628,.472-.817,.483-1.676,.892-2.565,1.225,.467,.918,1.011,1.794,1.626,2.619,2.732-.824,5.301-2.112,7.596-3.808h0c.623-6.461-1.064-12.06-4.46-17.025Zm-15.396,13.596c-1.479,0-2.702-1.343-2.702-2.994s1.18-3.006,2.697-3.006,2.73,1.354,2.704,3.006-1.192,2.994-2.699,2.994Zm9.967,0c-1.482,0-2.699-1.343-2.699-2.994s1.18-3.006,2.699-3.006,2.723,1.354,2.697,3.006-1.189,2.994-2.697,2.994Z" />
  </svg>
);

const TelegramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M16,2c-7.732,0-14,6.268-14,14s6.268,14,14,14,14-6.268,14-14S23.732,2,16,2Zm6.489,9.521c-.211,2.214-1.122,7.586-1.586,10.065-.196,1.049-.583,1.401-.957,1.435-.813,.075-1.43-.537-2.218-1.053-1.232-.808-1.928-1.311-3.124-2.099-1.382-.911-.486-1.412,.302-2.23,.206-.214,3.788-3.472,3.858-3.768,.009-.037,.017-.175-.065-.248-.082-.073-.203-.048-.29-.028-.124,.028-2.092,1.329-5.905,3.903-.559,.384-1.065,.571-1.518,.561-.5-.011-1.461-.283-2.176-.515-.877-.285-1.574-.436-1.513-.92,.032-.252,.379-.51,1.042-.773,4.081-1.778,6.803-2.95,8.164-3.517,3.888-1.617,4.696-1.898,5.222-1.907,.116-.002,.375,.027,.543,.163,.142,.115,.181,.27,.199,.379,.019,.109,.042,.357,.023,.551Z"
    />
  </svg>
);

export const Landing: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/browse');
    }
  };

  // Social Links in user-specified exact order: Facebook, Instagram, Discord, Telegram
  const socialLinks = [
    {
      name: 'Facebook',
      icon: FacebookIcon,
      href: '#',
      color: 'hover:text-[#1877F2] hover:border-[#1877F2]/50 hover:bg-[#1877F2]/10',
    },
    {
      name: 'Instagram',
      icon: InstagramIcon,
      href: '#',
      color: 'hover:text-[#E4405F] hover:border-[#E4405F]/50 hover:bg-[#E4405F]/10',
    },
    {
      name: 'Discord',
      icon: DiscordIcon,
      href: '#',
      color: 'hover:text-[#5865F2] hover:border-[#5865F2]/50 hover:bg-[#5865F2]/10',
    },
    {
      name: 'Telegram',
      icon: TelegramIcon,
      href: '#',
      color: 'hover:text-[#229ED9] hover:border-[#229ED9]/50 hover:bg-[#229ED9]/10',
    }
  ];

  return (
    <div className="relative h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none">
      {/* Cinematic Night Background Layer (Responsive Desktop / Mobile Wallpaper) */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <picture className="w-full h-full block">
          <source media="(max-width: 640px)" srcSet={mobileMoonBg} type="image/webp" />
          <img
            src={desktopMoonBg}
            alt="YORU Night Backdrop"
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover object-[center_top] sm:object-center opacity-90 transition-opacity duration-500"
          />
        </picture>
        {/* Subtle Dark Vignette (Monochrome, no red) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#030407] via-[#030407]/40 to-[#030407]/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(3,4,7,0.8)_85%)]" />
      </div>

      {/* Subtle Monochrome Silver Moonlight Glow */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-slate-100/[0.03] rounded-full blur-[140px] pointer-events-none z-[1]" />

      {/* Minimal, Focused Single Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg relative z-10 rounded-3xl bg-[#06080e]/65 backdrop-blur-2xl border border-white/10 p-6 sm:p-8 shadow-[0_25px_80px_rgba(0,0,0,0.85)] ring-1 ring-white/5"
      >
        {/* Centered Logo */}
        <div className="flex justify-center mb-3">
          <Logo className="scale-115 sm:scale-125 origin-center" />
        </div>

        {/* Concise Tagline */}
        <p className="text-xs sm:text-sm text-yoru-text-muted text-center max-w-sm mx-auto leading-relaxed mb-6">
          Enter your world of limitless anime streaming in true 1080p Ultra HD.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative group mb-4">
          <div 
            className={`relative flex items-center rounded-2xl transition-all duration-300 border ${
              isFocused 
                ? 'bg-black/90 border-white/40 shadow-[0_0_25px_rgba(255,255,255,0.1)]' 
                : 'bg-white/[0.04] hover:bg-white/[0.07] border-white/10'
            }`}
          >
            <Search className="absolute left-4 sm:left-5 w-4 h-4 sm:w-5 sm:h-5 text-yoru-text-muted group-focus-within:text-white transition-colors pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search anime..."
              className="w-full bg-transparent text-white placeholder-white/35 text-sm sm:text-base rounded-2xl pl-11 sm:pl-13 pr-28 sm:pr-32 py-3 sm:py-3.5 focus:outline-none transition-all"
            />
            <div className="absolute right-22 sm:right-26 flex items-center pointer-events-none opacity-50">
              <span className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-white/10 border border-white/20 rounded text-white tracking-wider">S</span>
            </div>
            <button
              type="submit"
              className="absolute right-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white text-black font-semibold text-xs sm:text-sm hover:bg-white/90 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
            >
              <span>Search</span>
            </button>
          </div>
        </form>

        {/* Single Primary Action Button: Visit Home -> */}
        <div className="mb-6">
          <Link
            to="/home"
            className="group relative inline-flex items-center justify-center w-full py-3 sm:py-3.5 px-6 rounded-2xl font-semibold text-sm sm:text-base text-white bg-white/10 border border-white/15 hover:bg-white/20 hover:border-white/30 active:scale-[0.99] transition-all duration-300 shadow-sm"
          >
            <span>Visit Home</span>
            <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-300 group-hover:translate-x-1.5" />
          </Link>
        </div>

        {/* Social Icons inside the card in specified order: Facebook, Instagram, Discord, Telegram */}
        <div className="pt-4 border-t border-white/10">
          <div className="grid grid-cols-4 gap-2.5">
            {socialLinks.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={(e) => {
                    if (item.href === '#') e.preventDefault();
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/70 transition-all duration-200 group ${item.color} active:scale-95`}
                  title={item.name}
                  aria-label={item.name}
                >
                  <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
                  <span className="hidden sm:inline text-xs font-medium">{item.name}</span>
                </a>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
