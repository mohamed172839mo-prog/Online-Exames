'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase, Student, ExamSettings, ExamResult } from '@/lib/supabase';
import { 
  User, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  GraduationCap, 
  ShieldCheck, 
  ArrowLeft, 
  Sparkles, 
  RotateCcw, 
  Lock, 
  Clock, 
  ShieldAlert,
  Calendar,
  AlertTriangle,
  Award
} from 'lucide-react';

export default function StudentOnboarding() {
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successStudent, setSuccessStudent] = useState<Student | null>(null);
  const [blockedAttempt, setBlockedAttempt] = useState<ExamResult | null>(null);

  // Exam Scheduling State
  const [settings, setSettings] = useState<ExamSettings>({
    is_enabled: true,
    allowed_entry_window_minutes: 10,
    exam_start_time: null,
  });
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [windowStatus, setWindowStatus] = useState<'open' | 'not_started' | 'closed' | 'disabled'>('open');
  const [countdownText, setCountdownText] = useState<string>('');

  // Fetch Settings on mount and poll
  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setSettings({
          exam_title: data.exam_title || 'اختبار تقييم المستوى',
          is_enabled: data.is_enabled ?? true,
          allowed_entry_window_minutes: data.allowed_entry_window_minutes || 10,
          exam_start_time: data.exam_start_time || null,
        });
      } else {
        // Fallback to local settings if table not created
        const local = localStorage.getItem('online_exam_settings');
        if (local) {
          setSettings(JSON.parse(local));
        }
      }
    } catch (e) {
      console.warn('Could not fetch exam settings:', e);
      const local = localStorage.getItem('online_exam_settings');
      if (local) {
        setSettings(JSON.parse(local));
      }
    }
  };

  useEffect(() => {
    fetchSettings();
    const interval = setInterval(() => {
      fetchSettings();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Time & Window Evaluation Effect (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      if (!settings.is_enabled) {
        setWindowStatus('disabled');
        return;
      }

      if (!settings.exam_start_time) {
        // No start time restriction: always open
        setWindowStatus('open');
        return;
      }

      const startTime = new Date(settings.exam_start_time);
      const windowMinutes = settings.allowed_entry_window_minutes || 10;
      const endTime = new Date(startTime.getTime() + windowMinutes * 60 * 1000);

      if (now < startTime) {
        setWindowStatus('not_started');
        const diffMs = startTime.getTime() - now.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        const hours = Math.floor(diffSec / 3600);
        const minutes = Math.floor((diffSec % 3600) / 60);
        const seconds = diffSec % 60;
        setCountdownText(
          `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        );
      } else if (now > endTime) {
        setWindowStatus('closed');
      } else {
        setWindowStatus('open');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setBlockedAttempt(null);

    // Verify window
    if (windowStatus === 'disabled') {
      setErrorMessage('الاختبار مغلق حالياً من قِبل إدارة الامتحانات.');
      return;
    }
    if (windowStatus === 'not_started') {
      setErrorMessage('لم تبدأ فترة الاختبار بعد. يرجى الانتظار حتى يحين موعد البدء.');
      return;
    }
    if (windowStatus === 'closed') {
      setErrorMessage('انتهت فترة الدخول المسموح بها للاختبار (أُغلقت نافذة التسجيل).');
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedPhone = phoneNumber.trim();

    if (!trimmedName || trimmedName.length < 3) {
      setErrorMessage('يرجى إدخال اسم ثلاثي صحيح (3 أحرف على الأقل).');
      return;
    }

    const digitCount = (trimmedPhone.match(/\d/g) || []).length;
    if (digitCount < 8) {
      setErrorMessage('يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل).');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Anti-Cheat / Single Attempt Enforcement with Admin Retake Override
      try {
        const { data: pastAttempts, error: checkError } = await supabase
          .from('exam_results')
          .select('*')
          .eq('student_phone', trimmedPhone)
          .order('created_at', { ascending: false });

        if (!checkError && pastAttempts && pastAttempts.length > 0) {
          const latestAttempt = pastAttempts[0];
          const localOverride = typeof window !== 'undefined' && localStorage.getItem(`allow_retake_${trimmedPhone}`) === 'true';

          if (latestAttempt.allow_retake || localOverride) {
            // Admin explicitly allowed retake! Clear lock
            if (typeof window !== 'undefined') {
              localStorage.removeItem(`completed_exam_${trimmedPhone}`);
            }
          } else {
            // Block re-entry!
            setBlockedAttempt(latestAttempt);
            setErrorMessage(
              'لقد قمت بإجراء هذا الاختبار وتسليمه مسبقاً! لا يُسمح بإعادة المحاولة إلا بعد منحك إذن إعادة الاختبار من قِبل المشرف.'
            );
            setIsLoading(false);
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Anti-cheat check skipped if table not exists:', checkErr);
      }

      // Check local storage for past attempt if not explicitly allowed
      if (typeof window !== 'undefined') {
        const completedPhone = localStorage.getItem(`completed_exam_${trimmedPhone}`);
        const localOverride = localStorage.getItem(`allow_retake_${trimmedPhone}`) === 'true';
        if (completedPhone && !localOverride) {
          setErrorMessage('لقد قمت بإنهاء هذا الاختبار مسبقاً على هذا الجهاز! يتطلب الدخول مجدداً موافقة المشرف.');
          setIsLoading(false);
          return;
        }
      }

      // 2. Insert into students table
      try {
        await supabase.from('students').insert([
          {
            full_name: trimmedName,
            phone_number: trimmedPhone,
          },
        ]);
      } catch (studentErr) {
        console.warn('Students table insert notice:', studentErr);
      }

      const saved = { full_name: trimmedName, phone_number: trimmedPhone };
      setSuccessStudent(saved);
      if (typeof window !== 'undefined') {
        localStorage.setItem('online_exam_student', JSON.stringify(saved));
        localStorage.setItem('online_exam_title', settings.exam_title || 'اختبار تقييم المستوى');
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMessage(err.message || 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setPhoneNumber('');
    setSuccessStudent(null);
    setBlockedAttempt(null);
    setErrorMessage(null);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 flex flex-col justify-between p-3 sm:p-6 md:p-8 font-sans text-right">
      {/* Header: Note Admin Link has been STRICTLY ISOLATED per instructions */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-3 sm:py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg tracking-tight text-white flex items-center gap-2">
              منصة الاختبارات الإلكترونية
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400">بوابة التحقق وتسجيل حضور الممتحنين</p>
          </div>
        </div>

        {/* Live Window Indicator Badge */}
        <div className="flex items-center gap-2">
          {windowStatus === 'open' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              نافذة التسجيل مفتوحة
            </span>
          )}
          {windowStatus === 'not_started' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold">
              <Clock className="w-3.5 h-3.5" />
              قريباً
            </span>
          )}
          {(windowStatus === 'closed' || windowStatus === 'disabled') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              مغلق
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-md mx-auto my-4 sm:my-8 px-1 sm:px-0">
        {/* TIME WINDOW BANNER NOTICES */}
        {windowStatus === 'not_started' && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <h3 className="font-bold text-sm text-amber-100">موعد الاختبار مجدول قريباً</h3>
            <p className="text-xs text-amber-300/90">يبدأ استقبال الممتحنين بعد:</p>
            <div dir="ltr" className="text-2xl sm:text-3xl font-mono font-black text-white tracking-wider">
              {countdownText}
            </div>
            {settings.exam_start_time && (
              <p className="text-[11px] text-amber-400/80">
                الموعد: {new Date(settings.exam_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (نافذة الدخول {settings.allowed_entry_window_minutes} دقيقة)
              </p>
            )}
          </div>
        )}

        {windowStatus === 'closed' && (
          <div className="mb-4 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-rose-100">أُغلقت نافذة التسجيل للاختبار</h3>
            <p className="text-xs text-rose-300/90 leading-relaxed">
              انتهت فترة الدخول المسموح بها ({settings.allowed_entry_window_minutes} دقيقة من موعد البدء). لا يُسمح بدخول أي طالب متأخر طبقاً للوائح الاختبار.
            </p>
          </div>
        )}

        {windowStatus === 'disabled' && (
          <div className="mb-4 p-4 rounded-2xl bg-slate-800/80 border border-white/10 text-slate-300 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-700 text-slate-400 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-white">جلسة الاختبار غير مفعلة حالياً</h3>
            <p className="text-xs text-slate-400">يرجى مراجعة إدارة الامتحانات أو الانتظار لتفعيل الجلسة.</p>
          </div>
        )}

        {/* BLOCKED ANTI-CHEAT CARD */}
        {blockedAttempt && (
          <div className="mb-4 p-5 rounded-2xl bg-rose-950/50 border border-rose-500/50 text-rose-100 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-rose-300 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
              <span>محاولة سابقة مسجلة (غير مسموح بإعادة المحاولة)</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              وفقاً لقواعد النزاهة الإلكترونية، يُسمح لكل طالب بمحاولة واحدة فقط. تم رصد تسليم سابق مسجل بهذا الرقم:
            </p>
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-xs space-y-1 font-mono">
              <div>الطالب: <strong className="text-white">{blockedAttempt.student_name}</strong></div>
              <div>الدرجة المسجلة: <strong className="text-amber-400">{blockedAttempt.total_score} نقطة</strong> ({blockedAttempt.correct_answers_count} من {blockedAttempt.total_questions})</div>
              <div>التوقيت: <span className="text-slate-400">{blockedAttempt.created_at ? new Date(blockedAttempt.created_at).toLocaleString() : 'مسجل'}</span></div>
            </div>
          </div>
        )}

        {/* ONBOARDING FORM CARD */}
        {!successStudent ? (
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl shadow-black/40">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-3 shadow-inner">
                <Sparkles className="w-6 h-6" />
              </div>
              {settings.exam_title && (
                <div className="mb-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-semibold">
                    <GraduationCap className="w-3.5 h-3.5 text-blue-400" />
                    <span>{settings.exam_title}</span>
                  </span>
                </div>
              )}
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">تسجيل بيانات الممتحن</h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1.5">
                يرجى إدخال بياناتك بدقة للتحقق وبدء جلسة الاختبار
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && !blockedAttempt && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name Field */}
              <div>
                <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  الاسم الكامل
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="مثال: محمد سامح"
                    disabled={isLoading || windowStatus !== 'open'}
                    required
                    className="block w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3.5 pr-11 pl-4 text-base sm:text-sm text-white placeholder-slate-500 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[48px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Phone Number Field */}
              <div>
                <label htmlFor="phoneNumber" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  رقم الهاتف (المرتبط بالدخول)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                    <Phone className="w-5 h-5" />
                  </div>
                  <input
                    id="phoneNumber"
                    type="tel"
                    dir="ltr"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="01012345678"
                    disabled={isLoading || windowStatus !== 'open'}
                    required
                    className="block w-full rounded-xl border border-slate-700 bg-slate-900/80 py-3.5 pr-11 pl-4 text-base sm:text-sm text-white placeholder-slate-500 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-left min-h-[48px] touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || windowStatus !== 'open'}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3.5 px-5 font-semibold text-sm sm:text-base text-white shadow-lg shadow-blue-600/30 transition-all duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] touch-manipulation"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التحقق من السجل ومنع التكرار...</span>
                  </>
                ) : windowStatus === 'not_started' ? (
                  <>
                    <Clock className="w-5 h-5" />
                    <span>في انتظار بدء الاختبار</span>
                  </>
                ) : windowStatus === 'closed' ? (
                  <>
                    <Lock className="w-5 h-5" />
                    <span>أُغلقت فترة التسجيل</span>
                  </>
                ) : (
                  <>
                    <span>تسجيل ومتابعة للاختبار</span>
                    <ArrowLeft className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
              <span>🔒 محاولة واحدة فقط مسموحة</span>
              <span>⚡ ربط فوري مع النظام</span>
            </div>
          </div>
        ) : (
          /* Registration Success Card */
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl shadow-black/40 text-center animate-in fade-in duration-200">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">تم التحقق بنجاح!</h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              تم التحقق من بياناتك ولم يتم رصد أي محاولات سابقة. يمكنك بدء الاختبار الآن.
            </p>

            {/* Candidate Details Summary */}
            <div className="mt-5 p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 text-right space-y-2.5">
              <div>
                <div className="text-[10px] font-semibold text-slate-400">اسم الممتحن</div>
                <div className="text-sm font-medium text-white mt-0.5">{successStudent.full_name}</div>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-slate-400">رقم الهاتف</div>
                <div dir="ltr" className="text-sm font-medium text-white mt-0.5 text-right">{successStudent.phone_number}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700/60 hover:bg-slate-700 py-3.5 px-4 font-medium text-xs sm:text-sm text-slate-200 transition min-h-[48px] touch-manipulation"
              >
                <RotateCcw className="w-4 h-4" />
                <span>تعديل البيانات</span>
              </button>

              <Link
                href="/exam"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3.5 px-4 font-semibold text-xs sm:text-sm text-white shadow-lg shadow-emerald-600/30 transition text-center min-h-[48px] touch-manipulation"
              >
                <span>دخول قاعة الاختبار</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto text-center py-3 text-[11px] text-slate-500">
        منصة الاختبارات الإلكترونية الرسمية &bull; تخضع جميع الجلسات لرقابة النزاهة الإلكترونية
      </footer>
    </div>
  );
}
