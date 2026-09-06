'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase, Question, Student, ExamResult } from '@/lib/supabase';
import Link from 'next/link';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  GraduationCap,
  Sparkles,
  Loader2,
  Trophy,
  ChevronDown,
  ChevronUp,
  FileQuestion,
  ShieldCheck,
  ShieldAlert,
  Award,
  Flame,
  Zap,
  Check,
  Lock
} from 'lucide-react';

interface QuestionResultDetail {
  question: Question;
  studentAnswer?: string;
  isCorrect: boolean;
  isUnanswered: boolean;
  basePoints: number;
  bonusPoints: number;
  totalPointsAwarded: number;
  remainingSeconds: number;
}

export default function ExamPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [examTitle, setExamTitle] = useState<string>('اختبار تقييم المستوى');
  const [hasPriorAttempt, setHasPriorAttempt] = useState(false);
  const [priorAttemptData, setPriorAttemptData] = useState<ExamResult | null>(null);
  const [isEntryLocked, setIsEntryLocked] = useState(false);
  const [strictEndTime, setStrictEndTime] = useState<string | null>(null);
  const [antiCheatWarning, setAntiCheatWarning] = useState<string | null>(null);

  // Exam Progression State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [timeRemainingRecord, setTimeRemainingRecord] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isExamCompleted, setIsExamCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReviewBreakdown, setShowReviewBreakdown] = useState(true);

  // Refs for anti-cheat and robust event listener subscriptions without stale closures
  const isAutoSkippingRef = useRef(false);
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;
  const selectedAnswersRef = useRef<Record<number, string>>({});
  selectedAnswersRef.current = selectedAnswers;
  const timeRemainingRecordRef = useRef<Record<number, number>>({});
  timeRemainingRecordRef.current = timeRemainingRecord;
  const isExamCompletedRef = useRef(false);
  isExamCompletedRef.current = isExamCompleted;
  const isLoadingRef = useRef(true);
  isLoadingRef.current = isLoading;
  const studentRef = useRef<Student | null>(null);
  studentRef.current = student;

  // Supabase Realtime Presence: Track examinee as 'testing'
  useEffect(() => {
    if (!student?.phone_number) return;

    const channel = supabase.channel('exam_live_presence', {
      config: {
        presence: { key: student.phone_number },
      },
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_name: student.full_name,
          phone: student.phone_number,
          status: isExamCompleted ? 'completed' : 'testing',
          updated_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [student, isExamCompleted]);

  // Load student info, check single-attempt, entry lock, strict window, and load questions
  useEffect(() => {
    let parsedStudent: Student | null = null;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('online_exam_student');
      if (stored) {
        try {
          parsedStudent = JSON.parse(stored);
          setStudent(parsedStudent);
        } catch (e) {
          console.error('Failed to parse student data', e);
        }
      }

      const storedTitle = localStorage.getItem('online_exam_title');
      if (storedTitle) {
        setExamTitle(storedTitle);
      }
    }

    const checkAttemptAndFetchQuestions = async () => {
      setIsLoading(true);
      try {
        // Fetch exam settings to check title, lock state, and strict cutoff
        try {
          const { data: settingsData } = await supabase
            .from('exam_settings')
            .select('*')
            .limit(1)
            .maybeSingle();

          if (settingsData) {
            if (settingsData.exam_title) {
              setExamTitle(settingsData.exam_title);
            }
            if (settingsData.is_locked) {
              setIsEntryLocked(true);
              setIsLoading(false);
              return;
            }
            if (settingsData.exam_end_time) {
              setStrictEndTime(settingsData.exam_end_time);
              if (new Date() >= new Date(settingsData.exam_end_time)) {
                setIsEntryLocked(true);
                setIsLoading(false);
                return;
              }
            }
          }
        } catch (e) {
          // ignore
        }

        // Anti-cheat / Single attempt enforcement with Retake Override
        if (parsedStudent?.phone_number) {
          try {
            const { data: past, error: pastErr } = await supabase
              .from('exam_results')
              .select('*')
              .eq('student_phone', parsedStudent.phone_number)
              .order('created_at', { ascending: false });

            if (!pastErr && past && past.length > 0) {
              const latest = past[0];
              const localRetakeAllowed =
                typeof window !== 'undefined' &&
                localStorage.getItem(`allow_retake_${parsedStudent.phone_number}`) === 'true';

              if (latest.allow_retake || localRetakeAllowed) {
                setHasPriorAttempt(false);
                if (typeof window !== 'undefined') {
                  localStorage.removeItem(`completed_exam_${parsedStudent.phone_number}`);
                }
              } else {
                setHasPriorAttempt(true);
                setPriorAttemptData(latest);
                setIsLoading(false);
                return;
              }
            }
          } catch (e) {
            console.warn('Past attempts check bypassed:', e);
          }
        }

        // Restore in-progress session if student refreshed after anti-cheat auto-skip
        if (parsedStudent?.phone_number && typeof window !== 'undefined') {
          const savedProgress = sessionStorage.getItem(`exam_session_${parsedStudent.phone_number}`);
          if (savedProgress) {
            try {
              const parsed = JSON.parse(savedProgress);
              if (parsed && typeof parsed.currentIndex === 'number') {
                setCurrentIndex(parsed.currentIndex);
                if (parsed.selectedAnswers) setSelectedAnswers(parsed.selectedAnswers);
                if (parsed.timeRemainingRecord) setTimeRemainingRecord(parsed.timeRemainingRecord);
              }
            } catch (e) {
              // ignore
            }
          }
        }

        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          setQuestions(data);
          setTimeLeft(data[0].time_limit || 60);
        }
      } catch (err: any) {
        console.error('Failed to fetch questions:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAttemptAndFetchQuestions();
  }, []);

  // Anti-Cheat Auto-Skip Handler: advances immediately, marks current as skipped, persists state
  const handleAntiCheatAutoSkip = (reason: string) => {
    const activeIdx = currentIndexRef.current;
    const currentQList = questionsRef.current;
    if (activeIdx >= currentQList.length || isExamCompletedRef.current) return;

    const updatedAnswers = {
      ...selectedAnswersRef.current,
      [activeIdx]: 'تم التخطي تلقائياً (رصد مغادرة شاشة الاختبار)',
    };
    const updatedTimes = {
      ...timeRemainingRecordRef.current,
      [activeIdx]: 0,
    };

    setSelectedAnswers(updatedAnswers);
    setTimeRemainingRecord(updatedTimes);
    setAntiCheatWarning('⚠️ تم تخطي السؤال تلقائياً بسبب مغادرة شاشة الاختبار أو التبديل بين التطبيقات (نظام حماية النزاهة).');

    setTimeout(() => {
      setAntiCheatWarning(null);
    }, 5000);

    const st = studentRef.current;
    if (typeof window !== 'undefined' && st?.phone_number) {
      sessionStorage.setItem(
        `exam_session_${st.phone_number}`,
        JSON.stringify({
          currentIndex: activeIdx + 1,
          selectedAnswers: updatedAnswers,
          timeRemainingRecord: updatedTimes,
        })
      );
    }

    if (activeIdx < currentQList.length - 1) {
      const nextIdx = activeIdx + 1;
      setCurrentIndex(nextIdx);
      setTimeLeft(currentQList[nextIdx].time_limit || 60);
    } else {
      finishExam(updatedTimes);
    }
  };

  // Mobile & Browser Anti-Cheat Listeners: visibilitychange, blur, pagehide
  useEffect(() => {
    if (isExamCompleted || isLoading || questions.length === 0) return;

    isAutoSkippingRef.current = false;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!isAutoSkippingRef.current && !isExamCompletedRef.current && !isLoadingRef.current) {
          isAutoSkippingRef.current = true;
          handleAntiCheatAutoSkip('visibilitychange');
        }
      }
    };

    const onBlur = () => {
      if (!isAutoSkippingRef.current && !isExamCompletedRef.current && !isLoadingRef.current) {
        isAutoSkippingRef.current = true;
        handleAntiCheatAutoSkip('blur');
      }
    };

    const onPageHide = () => {
      if (!isAutoSkippingRef.current && !isExamCompletedRef.current && !isLoadingRef.current) {
        isAutoSkippingRef.current = true;
        handleAntiCheatAutoSkip('pagehide');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [currentIndex, isExamCompleted, isLoading, questions.length]);

  // Timer & Strict Cutoff Effect
  useEffect(() => {
    if (isExamCompleted || isLoading || questions.length === 0) return;

    const timer = setInterval(() => {
      // Check strict cutoff time
      if (strictEndTime) {
        const endMs = new Date(strictEndTime).getTime();
        const nowMs = Date.now();
        if (nowMs >= endMs) {
          clearInterval(timer);
          finishExam(timeRemainingRecordRef.current);
          return;
        }
      }

      setTimeLeft((prev) => {
        if (strictEndTime) {
          const endMs = new Date(strictEndTime).getTime();
          const nowMs = Date.now();
          const secondsUntilStrictEnd = Math.max(0, Math.floor((endMs - nowMs) / 1000));
          if (secondsUntilStrictEnd <= 1) {
            handleAutoAdvance(0);
            return 0;
          }
          if (secondsUntilStrictEnd < prev) {
            return secondsUntilStrictEnd;
          }
        }

        if (prev <= 1) {
          handleAutoAdvance(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentIndex, isExamCompleted, isLoading, questions.length, strictEndTime]);

  const handleAutoAdvance = (remainingSecondsAtExpire: number) => {
    const updatedTimeRecord = {
      ...timeRemainingRecord,
      [currentIndex]: remainingSecondsAtExpire,
    };
    setTimeRemainingRecord(updatedTimeRecord);

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      if (typeof window !== 'undefined' && student?.phone_number) {
        sessionStorage.setItem(
          `exam_session_${student.phone_number}`,
          JSON.stringify({
            currentIndex: nextIdx,
            selectedAnswers,
            timeRemainingRecord: updatedTimeRecord,
          })
        );
      }
      setCurrentIndex(nextIdx);
      setTimeLeft(questions[nextIdx].time_limit || 60);
    } else {
      finishExam(updatedTimeRecord);
    }
  };

  const handleSelectOption = (optionValue: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionValue,
    }));
  };

  const handleManualNext = () => {
    const currentRemainingTime = timeLeft;
    const updatedTimeRecord = {
      ...timeRemainingRecord,
      [currentIndex]: currentRemainingTime,
    };
    setTimeRemainingRecord(updatedTimeRecord);

    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      if (typeof window !== 'undefined' && student?.phone_number) {
        sessionStorage.setItem(
          `exam_session_${student.phone_number}`,
          JSON.stringify({
            currentIndex: nextIdx,
            selectedAnswers,
            timeRemainingRecord: updatedTimeRecord,
          })
        );
      }
      setCurrentIndex(nextIdx);
      setTimeLeft(questions[nextIdx].time_limit || 60);
    } else {
      finishExam(updatedTimeRecord);
    }
  };

  const checkIsCorrect = (q: Question, studentAnswer: string | undefined): boolean => {
    if (!studentAnswer) return false;
    const cleanStudent = studentAnswer.trim().toLowerCase();
    const cleanCorrect = q.correct_answer.trim().toLowerCase();

    // 1. Direct match
    if (cleanStudent === cleanCorrect) return true;

    // 2. Letter match: correct_answer is 'A' / 'B' / 'C' / 'D'
    if (cleanCorrect === 'a' && studentAnswer === q.option_a) return true;
    if (cleanCorrect === 'b' && studentAnswer === q.option_b) return true;
    if (cleanCorrect === 'c' && studentAnswer === q.option_c) return true;
    if (cleanCorrect === 'd' && studentAnswer === q.option_d) return true;

    // 3. Reverse letter match: student picked 'A' while correct was option text
    if (cleanStudent === 'a' && q.option_a.trim().toLowerCase() === cleanCorrect) return true;
    if (cleanStudent === 'b' && q.option_b.trim().toLowerCase() === cleanCorrect) return true;
    if (cleanStudent === 'c' && q.option_c.trim().toLowerCase() === cleanCorrect) return true;
    if (cleanStudent === 'd' && q.option_d.trim().toLowerCase() === cleanCorrect) return true;

    return false;
  };

  const getCorrectAnswerFullText = (q: Question): string => {
    const raw = q.correct_answer.trim();
    const upper = raw.toUpperCase();
    if (upper === 'A' || upper === 'OPTION_A' || upper === 'أ') return `${q.option_a} (الخيار أ)`;
    if (upper === 'B' || upper === 'OPTION_B' || upper === 'ب') return `${q.option_b} (الخيار ب)`;
    if (upper === 'C' || upper === 'OPTION_C' || upper === 'ج') return `${q.option_c} (الخيار ج)`;
    if (upper === 'D' || upper === 'OPTION_D' || upper === 'د') return `${q.option_d} (الخيار د)`;
    return raw;
  };

  const calculateDetailedResults = (timeRecordToUse = timeRemainingRecord) => {
    let totalScore = 0;
    let correctCount = 0;
    let unansweredCount = 0;
    const details: QuestionResultDetail[] = [];

    questions.forEach((q, idx) => {
      const studentAns = selectedAnswers[idx];
      const remainingSeconds = timeRecordToUse[idx] !== undefined ? timeRecordToUse[idx] : 0;
      const basePoints = q.time_limit || 60;
      let isCorrect = false;
      let isUnanswered = false;
      let bonusPoints = 0;
      let totalPointsAwarded = 0;

      if (!studentAns || studentAns.includes('تم التخطي')) {
        isUnanswered = true;
      } else {
        isCorrect = checkIsCorrect(q, studentAns);
        if (isCorrect) {
          correctCount++;
          // Accuracy over speed rule: Math.floor(remainingSeconds / 2)
          // Speed bonus points are ONLY awarded if the question's answer is correct
          bonusPoints = Math.floor(Math.max(0, remainingSeconds) / 2);
          totalPointsAwarded = basePoints + bonusPoints;
          totalScore += totalPointsAwarded;
        } else {
          bonusPoints = 0;
          totalPointsAwarded = 0;
        }
      }

      details.push({
        question: q,
        studentAnswer: studentAns,
        isCorrect,
        isUnanswered,
        basePoints,
        bonusPoints,
        totalPointsAwarded,
        remainingSeconds,
      });
    });

    const total = questions.length;
    const incorrectCount = total - correctCount - unansweredCount;
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = percentage >= 60;

    return {
      totalScore,
      correctCount,
      incorrectCount,
      unansweredCount,
      total,
      percentage,
      passed,
      details,
    };
  };

  const finishExam = async (finalTimeRecord: Record<number, number>) => {
    setIsSubmitting(true);
    setIsExamCompleted(true);

    const scoreResults = calculateDetailedResults(finalTimeRecord);

    try {
      await supabase.from('exam_results').insert([
        {
          student_name: student?.full_name || 'طالب زائر',
          student_phone: student?.phone_number || 'N/A',
          exam_title: examTitle || 'اختبار تقييم المستوى',
          total_score: scoreResults.totalScore,
          correct_answers_count: scoreResults.correctCount,
          total_questions: scoreResults.total,
          percentage: scoreResults.percentage,
          answers: selectedAnswers,
          allow_retake: false,
        },
      ]);
    } catch (err) {
      console.warn('Could not save result to exam_results table:', err);
    } finally {
      setIsSubmitting(false);
    }

    // Save anti-cheat lock flag in localStorage and clear temporary retake permission & session
    if (typeof window !== 'undefined' && student?.phone_number) {
      localStorage.setItem(`completed_exam_${student.phone_number}`, 'true');
      localStorage.removeItem(`allow_retake_${student.phone_number}`);
      sessionStorage.removeItem(`exam_session_${student.phone_number}`);
    }
  };

  // Render: Locked Entry Screen (when admin locks exam entry or strict cutoff passed)
  if (isEntryLocked) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-right">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-xl border border-rose-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/40">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">باب الدخول مغلق</h2>
          <p className="text-xs text-rose-200 leading-relaxed font-semibold">
            عذراً، تم إغلاق باب الدخول للامتحان.
          </p>
          <p className="text-xs text-slate-400">
            تم إغلاق استقبال الممتحنين لهذه الجلسة أو انتهت المهلة المحددة للدخول.
          </p>

          <div className="pt-2">
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 py-3 px-4 font-semibold text-xs sm:text-sm text-slate-200 transition min-h-[48px] touch-manipulation"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة إلى الصفحة الرئيسية</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render: Blocked Re-Entry Screen (Anti-Cheat Single Attempt Enforcement)
  if (hasPriorAttempt && priorAttemptData) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-4 sm:p-6 font-sans text-right">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-xl border border-rose-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/40">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">لقد قمت بإجراء هذا الاختبار مسبقاً</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            وفقاً لضوابط النزاهة ومنع الغش، لا يُسمح بإعادة المحاولة أو الدخول مجدداً لنفس الممتحن.
          </p>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/60 text-right text-xs space-y-2 font-mono">
            <div>الممتحن: <strong className="text-white">{priorAttemptData.student_name}</strong></div>
            <div>رقم الهاتف: <span className="text-slate-300">{priorAttemptData.student_phone}</span></div>
            <div>الدرجة المسجلة: <strong className="text-amber-400">{priorAttemptData.total_score} نقطة</strong></div>
            <div>الإجابات الصحيحة: <span className="text-emerald-400 font-bold">{priorAttemptData.correct_answers_count} من {priorAttemptData.total_questions}</span></div>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700/70 hover:bg-slate-700 py-3 px-4 font-semibold text-xs sm:text-sm text-slate-200 transition min-h-[48px] touch-manipulation"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة إلى الصفحة الرئيسية</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Render: Loading Screen
  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
        <h2 className="text-xl font-bold">جاري تجهيز بيئة الاختبار...</h2>
        <p className="text-sm text-slate-400 mt-1">يتم استرجاع بنك الأسئلة وضبط مؤقت الاختبار</p>
      </div>
    );
  }

  // Render: Empty Question Pool
  if (questions.length === 0) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <FileQuestion className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">لا توجد أسئلة متاحة حالياً</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            بنك الأسئلة فارغ حالياً. يرجى التوجه إلى لوحة التحكم (Admin Dashboard) لرفع الأسئلة عبر ملف CSV قبل بدء الاختبار.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-xs font-medium text-slate-200 transition text-center"
            >
              العودة للرئيسية
            </Link>
            <Link
              href="/admin"
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 transition text-center"
            >
              لوحة تحكم الأسئلة
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const maxTime = currentQuestion?.time_limit || 60;
  const timerPercent = Math.max(0, Math.min(100, (timeLeft / maxTime) * 100));

  // Determine timer state
  const isTimerCritical = timeLeft <= 10;
  const isTimerWarning = timeLeft <= 20 && timeLeft > 10;

  // Render: Results Summary Screen
  if (isExamCompleted) {
    const results = calculateDetailedResults();

    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 p-3 sm:p-6 md:p-8 font-sans text-right">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-3 py-3 sm:py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-base sm:text-lg text-white">{examTitle || 'تقرير النتيجة الرسمية للاختبار'}</h1>
                <p className="text-[11px] sm:text-xs text-slate-400">تقرير النتيجة الرسمية ومراجعة الإجابات النموذجية</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              مكتمل ومسجل
            </span>
          </header>

          {/* Main Results Card */}
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-8 shadow-2xl text-center">
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center mx-auto mb-3 border ${
              results.passed
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {results.passed ? <Trophy className="w-8 h-8 sm:w-10 sm:h-10" /> : <Award className="w-8 h-8 sm:w-10 sm:h-10" />}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white">
              {results.passed ? '🎉 مبروك! اجتزت الاختبار بنجاح' : 'تم إنهاء الاختبار'}
            </h2>

            {/* Student Profile Info */}
            <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-300">
              <span>الممتحن: <strong className="text-white">{student?.full_name || 'طالب زائر'}</strong></span>
              {student?.phone_number && (
                <span dir="ltr" className="text-slate-400 font-mono"> &bull; {student.phone_number}</span>
              )}
            </div>

            {/* Total Score & Bonus Metric Display */}
            <div className="my-6 p-4 rounded-2xl bg-gradient-to-b from-blue-950/40 to-slate-900/80 border border-blue-500/30 shadow-inner">
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider mb-1">
                <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>إجمالي النقاط المكتسبة (Total Score)</span>
              </div>
              <div dir="ltr" className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                {results.totalScore}
                <span className="text-base sm:text-lg font-bold text-amber-400 ml-1.5">PTS</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                تشمل النقاط الأساسية لكل سؤال + نقاط مكافأة السرعة (نصف الثواني المتبقية للإجابات الصحيحة فقط)
              </p>
            </div>

            {/* 4 Score Metric Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-right">
              {/* Correct Answers */}
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3">
                <div className="text-[10px] sm:text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> الإجابات الصحيحة
                </div>
                <div dir="ltr" className="text-lg sm:text-xl font-bold text-emerald-300 mt-0.5 text-right">
                  {results.correctCount} <span className="text-xs font-normal text-slate-400">/ {results.total}</span>
                </div>
              </div>

              {/* Accuracy Percentage */}
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3">
                <div className="text-[10px] sm:text-[11px] font-semibold text-blue-400">نسبة الدقة</div>
                <div dir="ltr" className="text-lg sm:text-xl font-bold text-white mt-0.5 text-right">
                  {results.percentage}%
                </div>
              </div>

              {/* Incorrect Answers */}
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3">
                <div className="text-[10px] sm:text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> الإجابات الخاطئة
                </div>
                <div className="text-lg sm:text-xl font-bold text-rose-300 mt-0.5">{results.incorrectCount}</div>
              </div>

              {/* Unanswered (Timeouts) */}
              <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-3">
                <div className="text-[10px] sm:text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> انتهاء المهلة
                </div>
                <div className="text-lg sm:text-xl font-bold text-amber-300 mt-0.5">{results.unansweredCount}</div>
              </div>
            </div>

            {/* Action Buttons: Return Home (Leaderboard & Retake removed per Phase 5 security) */}
            <div className="mt-6 pt-5 border-t border-white/10 flex">
              <Link
                href="/"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700/80 hover:bg-slate-700 border border-slate-600/50 py-3.5 px-4 font-semibold text-xs sm:text-sm text-slate-100 shadow-md transition text-center min-h-[48px] touch-manipulation"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة إلى الصفحة الرئيسية</span>
              </Link>
            </div>
          </div>

          {/* Detailed Question Review Breakdown */}
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
            <button
              onClick={() => setShowReviewBreakdown(!showReviewBreakdown)}
              className="w-full flex items-center justify-between text-right touch-manipulation"
            >
              <div className="flex items-center gap-2">
                <FileQuestion className="w-5 h-5 text-blue-400 shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-white">مراجعة الأسئلة وتفاصيل الإجابات الصحيحة</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                  {results.details.length} أسئلة
                </span>
              </div>
              {showReviewBreakdown ? (
                <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
              )}
            </button>

            {showReviewBreakdown && (
              <div className="space-y-4 pt-2 divide-y divide-white/5">
                {results.details.map((detail, idx) => {
                  const q = detail.question;
                  const fullCorrectAnswerText = getCorrectAnswerFullText(q);

                  return (
                    <div key={q.id || idx} className="pt-4 first:pt-0 space-y-3 text-xs">
                      {/* Question Header & Points Earned Tag */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div dir="auto" className="font-semibold text-white text-sm leading-relaxed [unicode-bidi:plaintext] flex-1 min-w-[200px] break-words">
                          <span className="text-slate-500 font-mono ml-2"><bdi dir="ltr">س{idx + 1}.</bdi></span>
                          {q.text}
                        </div>

                        {detail.isCorrect ? (
                          <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                            <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                            <span><bdi dir="ltr">+{detail.totalPointsAwarded}</bdi> نقطة</span>
                          </div>
                        ) : (
                          <div className="shrink-0 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                            0 نقطة
                          </div>
                        )}
                      </div>

                      {/* Explicit Correct Answer Highlight Card */}
                      <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>الإجابة النموذجية الصحيحة:</span>
                        </div>
                        <div dir="auto" className="text-sm font-semibold text-emerald-100 pr-5 [unicode-bidi:plaintext] break-words">
                          {fullCorrectAnswerText}
                        </div>
                      </div>

                      {/* Student's Answer & Time Breakdown */}
                      <div className="p-2.5 rounded-xl bg-slate-900/90 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-400">إجابة الطالب: </span>
                          <span dir="auto" className={`font-semibold [unicode-bidi:plaintext] ${
                            detail.isCorrect ? 'text-emerald-400' : detail.isUnanswered ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {detail.studentAnswer || 'انتهت المهلة ولم يتم الاختيار'}
                          </span>
                        </div>

                        {detail.isCorrect && (
                          <div className="text-slate-400" dir="rtl">
                            (الأساس: <bdi dir="ltr">{detail.basePoints}</bdi> + مكافأة السرعة: <bdi dir="ltr">{detail.bonusPoints}</bdi> نقطة)
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active Examination Interface (Step-by-step)
  const currentPickedAnswer = selectedAnswers[currentIndex];
  const options = [
    { label: 'أ', raw: 'A', text: currentQuestion.option_a },
    { label: 'ب', raw: 'B', text: currentQuestion.option_b },
    { label: 'ج', raw: 'C', text: currentQuestion.option_c },
    { label: 'د', raw: 'D', text: currentQuestion.option_d },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 flex flex-col justify-between p-3 sm:p-6 md:p-8 font-sans text-right">
      {/* Top Header Bar */}
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between py-2 sm:py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner shrink-0">
            <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              {examTitle || 'الاختبار الإلكتروني المباشر'}
            </h1>
            <p className="text-[11px] text-slate-400 truncate max-w-[160px] sm:max-w-none">
              الممتحن: <span className="text-white font-medium">{student?.full_name || 'طالب زائر'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span dir="ltr" className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </header>

      {/* Main Question Flow Container */}
      <main className="w-full max-w-2xl mx-auto my-3 sm:my-6 space-y-4 sm:space-y-5 px-1 sm:px-0">
        
        {/* Anti-Cheat Warning Banner */}
        {antiCheatWarning && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-rose-500/20 border border-rose-500/50 text-rose-200 text-xs font-semibold flex items-center gap-2.5 shadow-lg shadow-rose-950/40 animate-in fade-in slide-in-from-top-2">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 animate-bounce" />
            <span className="leading-relaxed">{antiCheatWarning}</span>
          </div>
        )}

        {/* PROMINENT MOBILE-OPTIMIZED COUNTDOWN TIMER CARD */}
        <div className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-4 transition-all duration-300 border backdrop-blur-xl shadow-xl flex items-center justify-between ${
          isTimerCritical
            ? 'bg-rose-950/40 border-rose-500/60 shadow-rose-900/30 animate-pulse ring-2 ring-rose-500/30'
            : isTimerWarning
            ? 'bg-amber-950/30 border-amber-500/50 shadow-amber-900/20'
            : 'bg-slate-800/80 border-white/10 shadow-black/30'
        }`}>
          {/* Background Animated Progress Fill */}
          <div
            className={`absolute inset-y-0 right-0 opacity-15 transition-all duration-1000 ${
              isTimerCritical
                ? 'bg-rose-500'
                : isTimerWarning
                ? 'bg-amber-400'
                : 'bg-blue-500'
            }`}
            style={{ width: `${timerPercent}%` }}
          />

          <div className="relative z-10 flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all shrink-0 ${
              isTimerCritical
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : isTimerWarning
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
            }`}>
              {isTimerCritical ? <Flame className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" /> : <Clock className="w-5 h-5 sm:w-6 sm:h-6" />}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 truncate">
                <span>الوقت المتبقي</span>
                {isTimerCritical && (
                  <span className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.2 rounded animate-pulse shrink-0">
                    أوشك!
                  </span>
                )}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                كل ثانيتين متبقيتين تمنحانك <bdi dir="ltr">+1</bdi> نقطة إضافية عند الإجابة الصحيحة
              </div>
            </div>
          </div>

          {/* Large Visible Time Numbers */}
          <div className="relative z-10 text-left shrink-0 mr-2" dir="ltr">
            <div className={`font-mono text-2xl sm:text-4xl font-black tracking-tight ${
              isTimerCritical
                ? 'text-rose-400'
                : isTimerWarning
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}>
              {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider font-semibold text-center">
              {timeLeft} ثانية
            </div>
          </div>
        </div>

        {/* Overall Progress Info & Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-medium">
            <span>
              السؤال <strong className="text-white font-mono"><bdi dir="ltr">{currentIndex + 1}</bdi></strong> من{' '}
              <strong className="text-white font-mono"><bdi dir="ltr">{questions.length}</bdi></strong>
            </span>
            <span dir="ltr">{Math.round(((currentIndex + 1) / questions.length) * 100)}% Complete</span>
          </div>
          <div dir="ltr" className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-7 shadow-2xl space-y-5">
          <div className="space-y-2">
            <span className="inline-block text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
              السؤال <bdi dir="ltr">#{currentIndex + 1}</bdi>
            </span>
            
            {/* Question Text with unicode-bidi support for mixed Arabic & English */}
            <h2
              dir="auto"
              className="text-base sm:text-lg md:text-xl font-bold text-white leading-relaxed [unicode-bidi:plaintext] break-words"
            >
              {currentQuestion.text}
            </h2>
          </div>

          {/* Options Grid (Mobile-First Touch Optimized) */}
          <div className="space-y-2.5 sm:space-y-3">
            {options.map((opt) => {
              const isSelected = currentPickedAnswer === opt.text;

              return (
                <div
                  key={opt.label}
                  onClick={() => handleSelectOption(opt.text)}
                  className={`p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 min-h-[50px] touch-manipulation active:scale-[0.99] ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-md shadow-blue-500/10 ring-1 ring-blue-500/40'
                      : 'bg-slate-900/70 border-slate-700/60 text-slate-300 hover:border-slate-500 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl shrink-0 flex items-center justify-center font-mono text-xs font-bold transition ${
                        isSelected
                          ? 'bg-blue-500 text-white shadow'
                          : 'bg-slate-800 text-slate-400 border border-white/5'
                      }`}
                    >
                      {opt.label}
                    </div>

                    {/* Option Text with mixed language support */}
                    <span
                      dir="auto"
                      className="text-xs sm:text-sm font-medium leading-relaxed [unicode-bidi:plaintext] break-words"
                    >
                      {opt.text}
                    </span>
                  </div>

                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions & Next Button */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2">
            <div className="text-[11px] sm:text-xs text-slate-400">
              {currentPickedAnswer ? (
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> تم الاختيار
                </span>
              ) : (
                <span className="text-slate-400">اختر إجابة قبل انتهاء الوقت</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleManualNext}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 py-3 px-5 sm:px-6 font-semibold text-xs sm:text-sm text-white shadow-lg shadow-blue-600/30 transition active:scale-95 min-h-[46px] touch-manipulation"
            >
              <span>{currentIndex === questions.length - 1 ? 'تسليم وإنهاء الاختبار' : 'السؤال التالي'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-3xl mx-auto text-center py-2 sm:py-3 text-[11px] text-slate-500">
        منصة الاختبارات الإلكترونية &bull; مصممة للعمل بكفاءة على جميع الهواتف الذكية والأجهزة اللوحية
      </footer>
    </div>
  );
}
