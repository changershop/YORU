import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { Button } from './ui/Button';
import { auth, db, signInWithGoogle } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        const isAdmin = email === 'simoonabdulla@gmail.com' || email === 'titumamma2425@gmail.com';
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: name,
          photoURL: null,
          role: isAdmin ? 'admin' : 'user',
          createdAt: Date.now()
        });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        // Check/create doc just in case
        const userRef = doc(db, 'users', userCredential.user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const isAdmin = email === 'simoonabdulla@gmail.com' || email === 'titumamma2425@gmail.com';
          await setDoc(userRef, {
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: userCredential.user.displayName,
            photoURL: userCredential.user.photoURL,
            role: isAdmin ? 'admin' : 'user',
            createdAt: Date.now()
          });
        }
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please login instead.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password. Please check your credentials.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        onClose();
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked by your browser. Please allow popups for this site, open the app in a new tab, or use email and password login below.');
      } else if (err?.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        setError(`Firebase Auth Domain Error: '${currentDomain}' is not authorized in your Firebase Console. Please add '${currentDomain}' to Firebase Console > Authentication > Settings > Authorized domains. In the meantime, you can sign up or log in using Email and Password below.`);
      } else if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        // User closed or cancelled popup; do not show error
      } else {
        setError(err?.message || 'Google authentication failed. Please try again or use email login.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-yoru-surface-elevated border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-2">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-xs font-medium text-yoru-text-muted mb-6">
              {isSignUp ? 'Sign up to sync your watchlist and history.' : 'Login to continue watching where you left off.'}
            </p>

            {error && (
              <div className="bg-yoru-warning/20 border border-yoru-warning/30 text-yoru-warning text-xs font-bold p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input 
                      type="text" 
                      placeholder="Display Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full bg-[#030407] border border-white/5 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-yoru-accent/50 transition-colors"
                    />
                  </div>
                </div>
              )}
              
              <div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type="email" 
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-[#030407] border border-white/5 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-yoru-accent/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-[#030407] border border-white/5 rounded-lg py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-yoru-accent/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 p-1 transition"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                {loading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Login')}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-white/5">
              <Button 
                onClick={handleGoogle} 
                variant="secondary" 
                disabled={loading}
                className="w-full bg-white text-black hover:bg-white/90 font-bold"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4 mr-2" />
                {loading ? 'Connecting...' : 'Continue with Google'}
              </Button>
            </div>

            <div className="mt-6 text-center">
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs font-bold uppercase tracking-widest text-yoru-text-muted hover:text-white transition-colors"
              >
                {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
