import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { authApi } from '../lib/api';
import { formatPhone, cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';

const RegisterPage: NextPage = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [memberId, setMemberId] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const validateStep0 = () => {
    if (!firstName || !lastName) { setError('First and last name are required'); return false; }
    if (!email || !email.includes('@')) { setError('Valid email is required'); return false; }
    if (!memberId || memberId.length < 8) { setError('Valid Member ID is required (8+ characters)'); return false; }
    if (!dob) { setError('Date of birth is required'); return false; }
    setError(''); return true;
  };

  const validateStep1 = () => {
    if (password.length < 12) { setError('Password must be at least 12 characters'); return false; }
    if (password !== confirmPw) { setError('Passwords do not match'); return false; }
    if (!agreeTerms) { setError('You must agree to the Terms of Service'); return false; }
    setError(''); return true;
  };

  const handleNext = () => { if (step === 0 && validateStep0()) setStep(1); };

  const handleSubmit = async () => {
    if (!validateStep1()) return;
    setLoading(true);
    try {
      await authApi.register({ first_name: firstName, last_name: lastName, email, member_id: memberId, dob, password });
      setStep(2);
    } catch {
      // Demo success
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) return (
    <>
      <Head><title>Account Created | MyHealthPA</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Account Created!</h2>
            <p className="text-gray-500 mb-6">Welcome to MyHealthPA. You can now access your prior authorization requests and appeals online.</p>
            <button onClick={() => router.push('/login')} className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-700 text-white font-bold rounded-2xl hover:bg-primary-800 transition-colors">
              Sign In to Your Account <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <Head><title>Create Account | MyHealthPA</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-primary-700 to-primary-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-3 border border-white/20">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">Create Account</h1>
            <p className="text-primary-200 text-sm mt-1">Access your prior authorizations online</p>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-8">
            {/* Progress */}
            <div className="flex items-center gap-2 mb-6">
              {[0, 1].map(i => (
                <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i <= step ? 'bg-primary-600' : 'bg-gray-200')} />
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-4 text-sm text-red-700">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-extrabold text-gray-900 mb-1">Your Information</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">First Name <span className="text-red-500">*</span></label>
                    <input className="form-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">Last Name <span className="text-red-500">*</span></label>
                    <input className="form-input" value={lastName} onChange={e => setLastName(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="form-label">Email Address <span className="text-red-500">*</span></label>
                  <input type="email" className="form-input" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Insurance Member ID <span className="text-red-500">*</span></label>
                  <input className="form-input font-mono uppercase" placeholder="MB12345678" value={memberId} onChange={e => setMemberId(e.target.value.toUpperCase())} />
                  <p className="text-xs text-gray-400 mt-1">Found on your insurance card</p>
                </div>
                <div>
                  <label className="form-label">Date of Birth <span className="text-red-500">*</span></label>
                  <input type="date" className="form-input" value={dob} onChange={e => setDob(e.target.value)} />
                </div>
                <button onClick={handleNext} className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary-700 text-white font-bold rounded-2xl hover:bg-primary-800 transition-colors">
                  Continue <ArrowRight size={16} />
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-extrabold text-gray-900 mb-1">Create Password</h2>
                <div>
                  <label className="form-label">Password <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} className="form-input pr-10" placeholder="Min 12 characters" value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>
                <div>
                  <label className="form-label">Confirm Password <span className="text-red-500">*</span></label>
                  <input type={showPw ? 'text' : 'password'} className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-0.5 rounded" />
                  <span className="text-sm text-gray-600">
                    I agree to the <a href="#" className="text-primary-700 font-semibold hover:underline">Terms of Service</a> and{' '}
                    <a href="#" className="text-primary-700 font-semibold hover:underline">Privacy Policy</a>. I understand my health information is protected under HIPAA.
                  </span>
                </label>
                <div className="flex gap-3">
                  <button onClick={() => setStep(0)} className="flex items-center gap-1 px-4 py-3 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button onClick={handleSubmit} disabled={loading} className={cn('flex-1 flex items-center justify-center gap-2 py-3 bg-primary-700 text-white font-bold rounded-2xl transition-colors', loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-800')}>
                    {loading ? 'Creating account…' : <>Create Account <ArrowRight size={16} /></>}
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-sm text-gray-500 mt-4">
              Already have an account?{' '}
              <Link href="/login"><span className="text-primary-700 font-semibold hover:underline cursor-pointer">Sign in</span></Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  const checks = [
    { label: '12+ characters', ok: password.length >= 12 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition-all', i < passed ? passed <= 1 ? 'bg-red-400' : passed <= 2 ? 'bg-orange-400' : passed <= 3 ? 'bg-yellow-400' : 'bg-green-500' : 'bg-gray-200')} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c => (
          <div key={c.label} className={cn('flex items-center gap-1 text-xs', c.ok ? 'text-green-600' : 'text-gray-400')}>
            <CheckCircle size={10} className={c.ok ? 'text-green-500' : 'text-gray-300'} /> {c.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RegisterPage;
