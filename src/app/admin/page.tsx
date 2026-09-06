'use client';

import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { supabase, Question, ExamResult, ExamSettings } from '@/lib/supabase';
import Link from 'next/link';
import {
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
  Clock,
  Check,
  Download,
  ArrowLeft,
  Copy,
  HelpCircle,
  RefreshCw,
  FileQuestion,
  Trophy,
  Medal,
  Users,
  Zap,
  Phone,
  User,
  Settings,
  Calendar,
  Lock,
  Unlock,
  Sliders,
  GraduationCap,
  RotateCcw,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export default function AdminDashboard() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<ExamResult[]>([]);
  const [activeTab, setActiveTab] = useState<'questions' | 'leaderboard' | 'settings'>('questions');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [resultsSearchTerm, setResultsSearchTerm] = useState('');
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Exam Scheduling & Settings State
  const [examSettings, setExamSettings] = useState<ExamSettings>({
    id: 1,
    exam_title: 'اختبار تقييم المستوى',
    is_enabled: true,
    exam_start_time: null,
    allowed_entry_window_minutes: 10,
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveNotice, setSettingsSaveNotice] = useState<string | null>(null);

  const sqlSnippet = `-- Run this in Supabase SQL Editor:
-- 1. Questions Table
create table if not exists public.questions (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null,
  time_limit integer default 60 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Student Exam Results (Leaderboard & Retake Control)
create table if not exists public.exam_results (
  id uuid default gen_random_uuid() primary key,
  student_name text not null,
  student_phone text not null,
  exam_title text default 'اختبار تقييم المستوى',
  total_score integer not null default 0,
  correct_answers_count integer not null default 0,
  total_questions integer not null default 0,
  percentage integer not null default 0,
  answers jsonb,
  allow_retake boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Exam Scheduling & Global Settings
create table if not exists public.exam_settings (
  id integer primary key default 1,
  exam_title text default 'اختبار تقييم المستوى',
  is_enabled boolean not null default true,
  exam_start_time text,
  allowed_entry_window_minutes integer not null default 10,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ensure columns exist if tables were created previously
alter table public.exam_results add column if not exists exam_title text default 'اختبار تقييم المستوى';
alter table public.exam_results add column if not exists allow_retake boolean not null default false;
alter table public.exam_settings add column if not exists exam_title text default 'اختبار تقييم المستوى';

alter table public.questions enable row level security;
alter table public.exam_results enable row level security;
alter table public.exam_settings enable row level security;

create policy "Allow anon all on questions" on public.questions for all to anon using (true) with check (true);
create policy "Allow anon all on exam_results" on public.exam_results for all to anon using (true) with check (true);
create policy "Allow anon all on exam_settings" on public.exam_settings for all to anon using (true) with check (true);`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlSnippet);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const fetchQuestions = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (err: any) {
      console.error('Fetch questions error:', err);
      if (err.code === '42P01' || err.message?.includes('does not exist') || err.status === 404) {
        setErrorMessage('The "questions" table does not exist in Supabase yet. Run the SQL schema below in your dashboard.');
      } else {
        setErrorMessage(err.message || 'Failed to fetch questions from Supabase.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResults = async () => {
    setIsLoadingResults(true);
    try {
      const { data, error } = await supabase
        .from('exam_results')
        .select('*')
        .order('total_score', { ascending: false });

      if (error) throw error;
      setResults(data || []);
    } catch (err: any) {
      console.warn('Fetch results notice:', err.message);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (data) {
        setExamSettings({
          id: 1,
          exam_title: data.exam_title || 'اختبار تقييم المستوى',
          is_enabled: data.is_enabled ?? true,
          exam_start_time: data.exam_start_time || null,
          allowed_entry_window_minutes: data.allowed_entry_window_minutes || 10,
        });
        if (typeof window !== 'undefined') {
          localStorage.setItem('online_exam_settings', JSON.stringify(data));
          if (data.exam_title) {
            localStorage.setItem('online_exam_title', data.exam_title);
          }
        }
        return;
      }
    } catch (err) {
      console.warn('Could not fetch exam_settings from Supabase:', err);
    }

    // Fallback from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('online_exam_settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setExamSettings(parsed);
        } catch {
          // ignore
        }
      }
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSaveNotice(null);

    const payload = {
      id: 1,
      exam_title: examSettings.exam_title || 'اختبار تقييم المستوى',
      is_enabled: examSettings.is_enabled,
      exam_start_time: examSettings.exam_start_time ? new Date(examSettings.exam_start_time).toISOString() : null,
      allowed_entry_window_minutes: Number(examSettings.allowed_entry_window_minutes) || 10,
      updated_at: new Date().toISOString(),
    };

    // 1. Save to localStorage immediately so student portal has immediate synchronization
    if (typeof window !== 'undefined') {
      localStorage.setItem('online_exam_settings', JSON.stringify(payload));
      localStorage.setItem('online_exam_title', payload.exam_title);
    }

    // 2. Persist to Supabase
    try {
      const { error } = await supabase
        .from('exam_settings')
        .upsert(payload);

      if (error) {
        console.warn('Supabase exam_settings notice:', error.message);
        setSettingsSaveNotice('Saved locally! Note: Supabase exam_settings table returned an error. Ensure the SQL schema is executed.');
      } else {
        setSettingsSaveNotice('Settings updated successfully in Supabase & synced across all portals!');
      }
    } catch (err: any) {
      setSettingsSaveNotice('Saved locally! Supabase error: ' + (err.message || 'Check database connection'));
    } finally {
      setIsSavingSettings(false);
      setTimeout(() => setSettingsSaveNotice(null), 5000);
    }
  };

  // Student Retake Management Handlers
  const handleToggleRetake = async (id: string, currentStatus: boolean | undefined, phone: string, studentName: string) => {
    const newStatus = !currentStatus;
    try {
      // 1. Update Supabase
      try {
        await supabase
          .from('exam_results')
          .update({ allow_retake: newStatus })
          .eq('student_phone', phone);
      } catch (err: any) {
        console.warn('Supabase allow_retake update notice:', err.message);
      }

      // 2. Update local state
      setResults((prev) =>
        prev.map((r) =>
          r.student_phone === phone ? { ...r, allow_retake: newStatus } : r
        )
      );

      // 3. Update localStorage for student
      if (typeof window !== 'undefined') {
        if (newStatus) {
          localStorage.setItem(`allow_retake_${phone}`, 'true');
          localStorage.removeItem(`completed_exam_${phone}`);
        } else {
          localStorage.removeItem(`allow_retake_${phone}`);
          localStorage.setItem(`completed_exam_${phone}`, 'true');
        }
      }

      setSuccessMessage(
        newStatus
          ? `✅ Retake permission granted to "${studentName}" (${phone}). The student can now re-enter the exam.`
          : `🔒 Retake permission revoked for "${studentName}" (${phone}). The student is locked.`
      );
    } catch (err: any) {
      alert(`Failed to update retake status: ${err.message}`);
    }
  };

  const handleResetAttempt = async (id: string, phone: string, studentName: string) => {
    if (!confirm(`Are you sure you want to reset the attempt for "${studentName}" (${phone})?\nThis clears their recorded submission and removes the re-entry lock so they can take the exam fresh.`)) return;

    try {
      try {
        await supabase.from('exam_results').delete().eq('id', id);
      } catch (err: any) {
        console.warn('Delete attempt notice:', err.message);
      }

      setResults((prev) => prev.filter((r) => r.id !== id));

      if (typeof window !== 'undefined') {
        localStorage.removeItem(`completed_exam_${phone}`);
        localStorage.setItem(`allow_retake_${phone}`, 'true');
      }

      setSuccessMessage(`Attempt reset for "${studentName}". The student can now take the exam as a fresh attempt.`);
    } catch (err: any) {
      alert(`Failed to reset attempt: ${err.message}`);
    }
  };

  const handleAllowAllRetakes = async (allow: boolean) => {
    const actionLabel = allow ? 'ALLOW ALL students to retake the exam' : 'LOCK all student retakes';
    if (!confirm(`Are you sure you want to ${actionLabel}?`)) return;

    try {
      try {
        await supabase
          .from('exam_results')
          .update({ allow_retake: allow })
          .neq('student_phone', 'NON_EXISTENT');
      } catch (e) {
        // ignore
      }

      setResults((prev) => prev.map((r) => ({ ...r, allow_retake: allow })));

      if (typeof window !== 'undefined') {
        results.forEach((r) => {
          if (r.student_phone) {
            if (allow) {
              localStorage.setItem(`allow_retake_${r.student_phone}`, 'true');
              localStorage.removeItem(`completed_exam_${r.student_phone}`);
            } else {
              localStorage.removeItem(`allow_retake_${r.student_phone}`);
              localStorage.setItem(`completed_exam_${r.student_phone}`, 'true');
            }
          }
        });
      }

      setSuccessMessage(
        allow
          ? '✅ Retake permission granted to ALL students! All examinees can now re-enter the test.'
          : '🔒 All retake permissions revoked. Students are locked to single attempt.'
      );
    } catch (err: any) {
      alert(`Error updating all retakes: ${err.message}`);
    }
  };

  // CSV Export Feature for Student Results
  const handleExportResultsCsv = () => {
    if (results.length === 0) {
      alert('لا توجد نتائج مسجلة لتصديرها حالياً.');
      return;
    }

    const headers = [
      'الترتيب (Rank)',
      'اسم الطالب (Student Name)',
      'رقم الهاتف (Phone Number)',
      'عنوان الاختبار (Exam Title)',
      'مجموع النقاط (Total Score)',
      'الإجابات الصحيحة (Correct Answers)',
      'إجمالي الأسئلة (Total Questions)',
      'نسبة الدقة (Accuracy)',
      'حالة إعادة المحاولة (Retake Status)',
      'تاريخ ووقت التسليم (Submission Date)'
    ];

    const rows = results.map((r, idx) => {
      const escapeCsv = (val: string | number | undefined | null) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const dateStr = r.created_at
        ? new Date(r.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
        : 'N/A';

      const accuracy = r.percentage !== undefined
        ? `${r.percentage}%`
        : `${Math.round(((r.correct_answers_count || 0) / (r.total_questions || 1)) * 100)}%`;

      return [
        idx + 1,
        escapeCsv(r.student_name),
        escapeCsv(r.student_phone),
        escapeCsv(r.exam_title || examSettings.exam_title || 'اختبار تقييم المستوى'),
        r.total_score,
        r.correct_answers_count,
        r.total_questions || 0,
        escapeCsv(accuracy),
        escapeCsv(r.allow_retake ? 'مسموح بإعادة المحاولة' : 'محاولة واحدة (مغلق)'),
        escapeCsv(dateStr)
      ].join(',');
    });

    // UTF-8 BOM (\uFEFF) ensures Excel opens Arabic letters with correct encoding
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const examSlug = (examSettings.exam_title || 'exam_results')
      .replace(/[^\w\u0600-\u06FF]+/g, '_')
      .slice(0, 30);
    const filename = `${examSlug}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSuccessMessage(`تم تصدير ملف النتائج بنجاح (${results.length} طالب/طالبة).`);
  };

  // Simplified Timing UI Helpers
  const getTimeParts = () => {
    if (!examSettings.exam_start_time) {
      return { day: 'always', hour: '10', minute: '00', period: 'AM' };
    }
    const d = new Date(examSettings.exam_start_time);
    if (isNaN(d.getTime())) {
      return { day: 'always', hour: '10', minute: '00', period: 'AM' };
    }

    const todayStr = new Date().toDateString();
    const targetStr = d.toDateString();
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const tomStr = tom.toDateString();

    let day = 'custom';
    if (todayStr === targetStr) day = 'today';
    else if (tomStr === targetStr) day = 'tomorrow';

    const hours24 = d.getHours();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    let hour12 = hours24 % 12;
    if (hour12 === 0) hour12 = 12;
    const hour = String(hour12).padStart(2, '0');
    const minute = String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0');

    return { day, hour, minute, period };
  };

  const updateTimePart = (part: 'day' | 'hour' | 'minute' | 'period', value: string) => {
    const current = getTimeParts();
    const next = { ...current, [part]: value };

    if (next.day === 'always') {
      setExamSettings((prev) => ({ ...prev, exam_start_time: null }));
      return;
    }

    const d = new Date();
    if (next.day === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    }

    let h = parseInt(next.hour, 10);
    if (next.period === 'PM' && h < 12) h += 12;
    if (next.period === 'AM' && h === 12) h = 0;

    d.setHours(h, parseInt(next.minute, 10), 0, 0);
    setExamSettings((prev) => ({ ...prev, exam_start_time: d.toISOString() }));
  };

  const formatForDateTimeLocal = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchResults();
    fetchSettings();
  }, []);

  const handleDeleteResult = async (id: string) => {
    if (!confirm('Are you sure you want to delete this result?')) return;
    try {
      const { error } = await supabase.from('exam_results').delete().eq('id', id);
      if (error) throw error;
      setResults((prev) => prev.filter((r) => r.id !== id));
      setSuccessMessage('Student result deleted successfully.');
    } catch (err: any) {
      alert(`Failed to delete result: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsUploading(true);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            throw new Error('The uploaded CSV file is empty.');
          }

          // Expected columns: text, option_a, option_b, option_c, option_d, correct_answer, time_limit
          const requiredFields = ['text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'];
          const headers = results.meta.fields || [];

          const missingFields = requiredFields.filter((rf) => !headers.includes(rf));
          if (missingFields.length > 0) {
            throw new Error(
              `Missing required CSV column(s): ${missingFields.join(', ')}. Expected headers: text, option_a, option_b, option_c, option_d, correct_answer, time_limit`
            );
          }

          const parsedQuestions: Omit<Question, 'id' | 'created_at'>[] = [];

          for (let i = 0; i < results.data.length; i++) {
            const row = results.data[i];
            const text = row['text']?.trim();
            const option_a = row['option_a']?.trim();
            const option_b = row['option_b']?.trim();
            const option_c = row['option_c']?.trim();
            const option_d = row['option_d']?.trim();
            const correct_answer = row['correct_answer']?.trim();
            const time_limit = parseInt(row['time_limit'] || '60', 10);

            if (!text || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
              throw new Error(`Row #${i + 1} has empty required fields.`);
            }

            parsedQuestions.push({
              text,
              option_a,
              option_b,
              option_c,
              option_d,
              correct_answer,
              time_limit: isNaN(time_limit) || time_limit <= 0 ? 60 : time_limit,
            });
          }

          // Batch insert into Supabase
          const { error: insertError } = await supabase.from('questions').insert(parsedQuestions);

          if (insertError) {
            throw insertError;
          }

          setSuccessMessage(`Successfully uploaded and inserted ${parsedQuestions.length} question(s)!`);
          await fetchQuestions();
        } catch (err: any) {
          console.error('CSV upload error:', err);
          if (err.code === '42P01' || err.message?.includes('does not exist') || err.status === 404) {
            setErrorMessage('The "questions" table does not exist in Supabase yet. Run the SQL schema below in your dashboard.');
          } else {
            setErrorMessage(err.message || 'Failed to process and upload CSV.');
          }
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      },
      error: (err) => {
        setIsUploading(false);
        setErrorMessage(`CSV parsing failed: ${err.message}`);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
    });
  };

  const downloadSampleCsv = () => {
    const sampleRows = [
      {
        text: 'What does CSS stand for?',
        option_a: 'Cascading Style Sheets',
        option_b: 'Computer Style Sheets',
        option_c: 'Creative Style Solutions',
        option_d: 'Colorful Style Sheets',
        correct_answer: 'Cascading Style Sheets',
        time_limit: 45,
      },
      {
        text: 'Which HTML tag is used to define an internal style sheet?',
        option_a: '<css>',
        option_b: '<style>',
        option_c: '<script>',
        option_d: '<styling>',
        correct_answer: '<style>',
        time_limit: 30,
      },
      {
        text: 'What is the default port for Next.js development server?',
        option_a: '8080',
        option_b: '5000',
        option_c: '3000',
        option_d: '4200',
        correct_answer: '3000',
        time_limit: 60,
      },
    ];

    const csvContent = Papa.unparse(sampleRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample_questions_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) throw error;
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      setSuccessMessage('Question deleted successfully.');
    } catch (err: any) {
      alert(`Failed to delete question: ${err.message}`);
    }
  };

  const handleDeleteAll = async () => {
    setShowDeleteAllModal(false);
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // In Supabase, delete all rows where id is not null
      const { error } = await supabase
        .from('questions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      setQuestions([]);
      setSuccessMessage('All questions have been deleted successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete all questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredQuestions = questions.filter((q) => {
    const term = searchTerm.toLowerCase();
    return (
      q.text.toLowerCase().includes(term) ||
      q.option_a.toLowerCase().includes(term) ||
      q.option_b.toLowerCase().includes(term) ||
      q.option_c.toLowerCase().includes(term) ||
      q.option_d.toLowerCase().includes(term) ||
      q.correct_answer.toLowerCase().includes(term)
    );
  });

  const filteredResults = results.filter((r) => {
    const term = resultsSearchTerm.toLowerCase();
    return (
      r.student_name?.toLowerCase().includes(term) ||
      r.student_phone?.toLowerCase().includes(term) ||
      (r.exam_title && r.exam_title.toLowerCase().includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 p-3 sm:p-6 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Navigation */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition"
              title="Return to Student Portal"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white flex items-center gap-2">
                Admin Dashboard
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Control Center
                </span>
              </h1>
              <p className="text-xs text-slate-400">Question Bank management & Student Results Leaderboard</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'questions' && (
              <>
                <button
                  onClick={fetchQuestions}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-300 transition"
                  title="Refresh Question List"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download CSV Template</span>
                </button>
              </>
            )}

            {activeTab === 'leaderboard' && (
              <>
                <button
                  onClick={handleExportResultsCsv}
                  disabled={results.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/40 text-xs font-semibold text-white shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                  title="تصدير كشف نتائج جميع الطلاب إلى ملف CSV"
                >
                  <Download className="w-3.5 h-3.5 text-white" />
                  <span>تصدير الدرجات CSV</span>
                </button>

                <button
                  onClick={fetchResults}
                  disabled={isLoadingResults}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-xs font-semibold text-purple-200 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingResults ? 'animate-spin' : ''}`} />
                  <span>Refresh Leaderboard</span>
                </button>
              </>
            )}

            {activeTab === 'settings' && (
              <button
                onClick={fetchSettings}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/40 text-xs font-semibold text-emerald-200 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Settings</span>
              </button>
            )}
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-white/10 w-fit">
          <button
            onClick={() => setActiveTab('questions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'questions'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Question Bank</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'questions' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {questions.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('leaderboard');
              fetchResults();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'leaderboard'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Results Leaderboard</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
              activeTab === 'leaderboard' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {results.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('settings');
              fetchSettings();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Exam Scheduling & Controls</span>
          </button>
        </div>

        {/* Alerts & Messages */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-100">Action Needed</p>
                <p className="text-xs text-rose-200/90">{errorMessage}</p>
              </div>
            </div>

            {errorMessage.includes('questions') && (
              <div className="mt-3 pt-3 border-t border-rose-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs text-rose-300">
                  <span>Run this SQL script in your Supabase SQL Editor to enable questions table:</span>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs transition"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSql ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
                <pre className="p-3 rounded bg-black/40 text-[11px] font-mono text-slate-300 overflow-x-auto border border-white/5">
                  {sqlSnippet}
                </pre>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-xs text-emerald-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {settingsSaveNotice && (
          <div className="p-4 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
              <span>{settingsSaveNotice}</span>
            </div>
            <button
              onClick={() => setSettingsSaveNotice(null)}
              className="text-xs text-blue-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: QUESTION BANK */}
        {activeTab === 'questions' && (
          <>
            {/* Upload Card & Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CSV Bulk Upload Dropzone Card */}
          <div className="md:col-span-2 bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <h2 className="font-semibold text-white">Bulk Question Upload</h2>
              </div>
              <span className="text-xs text-slate-400">papaparse &bull; client-side parsed</span>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isUploading
                  ? 'border-blue-500 bg-blue-500/5 cursor-wait'
                  : 'border-slate-700 hover:border-blue-500/70 hover:bg-slate-900/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />

              {isUploading ? (
                <div className="flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
                  <p className="text-sm font-medium text-white">Parsing and inserting questions...</p>
                  <p className="text-xs text-slate-400">Saving records directly to Supabase Questions table</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-1">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-white">
                    Click to select CSV file <span className="font-normal text-slate-400">or drag and drop</span>
                  </p>
                  <p className="text-xs text-slate-400 max-w-md">
                    Required headers: <code className="text-blue-300 font-mono">text, option_a, option_b, option_c, option_d, correct_answer, time_limit</code>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Stats & Quick Actions Card */}
          <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="font-semibold text-white mb-1">Question Bank Stats</h2>
              <p className="text-xs text-slate-400">Current live questions in exam pool</p>

              <div className="my-6">
                <div className="text-4xl font-extrabold text-white tracking-tight">
                  {isLoading ? '...' : questions.length}
                </div>
                <div className="text-xs text-slate-400 mt-1">Total Available Questions</div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowDeleteAllModal(true)}
                disabled={questions.length === 0 || isLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 py-2.5 px-4 font-semibold text-xs text-rose-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Delete All Questions</span>
              </button>
            </div>
          </div>
        </div>

        {/* Question Bank Data Table */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
          {/* Table Header Controls */}
          <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileQuestion className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">Questions List</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                {filteredQuestions.length} of {questions.length}
              </span>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search questions or options..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
                <p className="text-sm">Loading questions from Supabase...</p>
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-700/40 text-slate-400 flex items-center justify-center mx-auto">
                  <FileQuestion className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-300">No questions found</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {questions.length === 0
                    ? 'Upload a CSV file using the form above or click "Download CSV Template" to get started.'
                    : 'No questions match your current search query.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 min-w-[240px]">Question Text</th>
                    <th className="py-3 px-4 min-w-[280px]">Options</th>
                    <th className="py-3 px-4 min-w-[160px]">Correct Answer</th>
                    <th className="py-3 px-4 text-center w-28">Time Limit</th>
                    <th className="py-3 px-4 text-center w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                  {filteredQuestions.map((q, idx) => (
                    <tr key={q.id || idx} className="hover:bg-slate-700/20 transition">
                      <td className="py-3.5 px-4 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-medium text-white">{q.text}</td>
                      <td className="py-3.5 px-4">
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <span
                            className={`p-1.5 rounded truncate ${
                              q.correct_answer === q.option_a || q.correct_answer?.toUpperCase() === 'A'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900/60 text-slate-400'
                            }`}
                            title={q.option_a}
                          >
                            <strong className="text-slate-200 mr-1">A:</strong> {q.option_a}
                          </span>
                          <span
                            className={`p-1.5 rounded truncate ${
                              q.correct_answer === q.option_b || q.correct_answer?.toUpperCase() === 'B'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900/60 text-slate-400'
                            }`}
                            title={q.option_b}
                          >
                            <strong className="text-slate-200 mr-1">B:</strong> {q.option_b}
                          </span>
                          <span
                            className={`p-1.5 rounded truncate ${
                              q.correct_answer === q.option_c || q.correct_answer?.toUpperCase() === 'C'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900/60 text-slate-400'
                            }`}
                            title={q.option_c}
                          >
                            <strong className="text-slate-200 mr-1">C:</strong> {q.option_c}
                          </span>
                          <span
                            className={`p-1.5 rounded truncate ${
                              q.correct_answer === q.option_d || q.correct_answer?.toUpperCase() === 'D'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900/60 text-slate-400'
                            }`}
                            title={q.option_d}
                          >
                            <strong className="text-slate-200 mr-1">D:</strong> {q.option_d}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <Check className="w-3.5 h-3.5" />
                          <span className="truncate max-w-[140px]">{q.correct_answer}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/80 text-blue-300 border border-slate-700/60 font-mono text-[11px]">
                          <Clock className="w-3 h-3 text-blue-400" />
                          {q.time_limit}s
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {q.id && (
                          <button
                            onClick={() => handleDeleteQuestion(q.id!)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Delete this question"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
          </>
        )}

        {/* TAB 2: RESULTS LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-6">
            {/* Leaderboard Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{results.length}</div>
                  <div className="text-xs text-slate-400">Total Examinees Tested</div>
                </div>
              </div>

              <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-amber-400">
                    {results.length > 0 ? `${results[0].total_score} PTS` : '0 PTS'}
                  </div>
                  <div className="text-xs text-slate-400">Top Score Recorded</div>
                </div>
              </div>

              <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-xl flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-2xl font-black text-emerald-400">
                    {results.length > 0
                      ? `${Math.round(results.reduce((acc, r) => acc + (r.percentage || 0), 0) / results.length)}%`
                      : '0%'}
                  </div>
                  <div className="text-xs text-slate-400">Average Accuracy Rate</div>
                </div>
              </div>
            </div>

            {/* Leaderboard Table Container */}
            <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 sm:p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h3 className="font-semibold text-white">Student Results & Retake Management</h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                      {results.length} examinees
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Manage single-attempt locks, override restrictions, and grant retake permissions</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportResultsCsv}
                    disabled={results.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 touch-manipulation"
                    title="تصدير كشف نتائج جميع الطلاب إلى ملف CSV للتحميل الفوري"
                  >
                    <Download className="w-4 h-4 text-white" />
                    <span>تصدير الدرجات CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAllowAllRetakes(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition"
                    title="Allow all recorded examinees to retake the test"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Allow All Retakes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAllowAllRetakes(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-xs font-semibold transition"
                    title="Lock all examinees to single attempt"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock All</span>
                  </button>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search name, phone, or exam..."
                      value={resultsSearchTerm}
                      onChange={(e) => setResultsSearchTerm(e.target.value)}
                      className="w-full bg-slate-900/90 border border-slate-700 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                {isLoadingResults ? (
                  <div className="py-16 text-center text-slate-400 space-y-3">
                    <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
                    <p className="text-sm">Loading student records from Supabase...</p>
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-700/40 text-slate-400 flex items-center justify-center mx-auto">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">No exam results recorded yet</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {results.length === 0
                        ? 'When students complete an online examination, their scores, attempt status, and retake controls will appear here.'
                        : 'No results match your search query.'}
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-slate-900/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4 w-14 text-center">Rank</th>
                        <th className="py-3 px-4 min-w-[170px]">Candidate</th>
                        <th className="py-3 px-4 min-w-[150px]">Exam Title</th>
                        <th className="py-3 px-4 min-w-[120px]">Score</th>
                        <th className="py-3 px-4 text-center min-w-[110px]">Correct</th>
                        <th className="py-3 px-4 text-center min-w-[90px]">Accuracy</th>
                        <th className="py-3 px-4 text-center min-w-[140px]">Retake Status</th>
                        <th className="py-3 px-4 text-center min-w-[110px]">Date</th>
                        <th className="py-3 px-4 text-center min-w-[150px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                      {filteredResults.map((r, idx) => (
                        <tr key={r.id || idx} className="hover:bg-slate-700/20 transition">
                          <td className="py-3.5 px-4 text-center font-bold">
                            {idx === 0 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm shadow">
                                🥇
                              </span>
                            ) : idx === 1 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-400/20 text-slate-200 border border-slate-400/40 text-sm shadow">
                                🥈
                              </span>
                            ) : idx === 2 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-700/20 text-amber-500 border border-amber-700/40 text-sm shadow">
                                🥉
                              </span>
                            ) : (
                              <span className="font-mono text-slate-500">#{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-white text-sm">{r.student_name}</div>
                            <div className="text-slate-400 text-[11px] font-mono mt-0.5">{r.student_phone}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 text-xs text-slate-200 font-medium truncate max-w-[160px]" title={r.exam_title || 'General Exam'}>
                              <GraduationCap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="truncate">{r.exam_title || 'اختبار تقييم المستوى'}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-xs font-mono">
                              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                              {r.total_score} PTS
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-semibold font-mono text-xs">
                              <CheckCircle2 className="w-3 h-3" />
                              {r.correct_answers_count} / {r.total_questions}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="font-mono font-bold text-white text-xs">
                              {r.percentage !== undefined ? `${r.percentage}%` : `${Math.round((r.correct_answers_count / (r.total_questions || 1)) * 100)}%`}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {r.allow_retake ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px]">
                                <Unlock className="w-3 h-3 text-emerald-400" />
                                Retake Allowed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium text-[11px]">
                                <Lock className="w-3 h-3 text-rose-400" />
                                1 Attempt Used
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="inline-flex items-center justify-center gap-1.5">
                              {/* Toggle Allow Retake */}
                              <button
                                onClick={() => handleToggleRetake(r.id!, r.allow_retake, r.student_phone, r.student_name)}
                                className={`px-2 py-1 rounded-lg text-xs font-semibold transition border flex items-center gap-1 ${
                                  r.allow_retake
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                                }`}
                                title={r.allow_retake ? 'Revoke retake permission (lock student)' : 'Grant permission for this student to retake'}
                              >
                                {r.allow_retake ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                <span>{r.allow_retake ? 'Lock' : 'Allow Retake'}</span>
                              </button>

                              {/* Reset Attempt */}
                              <button
                                onClick={() => handleResetAttempt(r.id!, r.student_phone, r.student_name)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition"
                                title="Reset attempt (delete score and allow clean retake)"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Result */}
                              <button
                                onClick={() => handleDeleteResult(r.id!)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                                title="Delete this result permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EXAM SCHEDULING & CONTROLS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Live Status Assessment Banner */}
            {(() => {
              const isEnabled = examSettings.is_enabled;
              const startTimeStr = examSettings.exam_start_time;
              const windowMinutes = examSettings.allowed_entry_window_minutes || 10;

              let statusTitle = '';
              let statusDesc = '';
              let badgeColor = '';
              let isCurrentlyDisabled = false;

              if (!isEnabled) {
                isCurrentlyDisabled = true;
                statusTitle = 'Exam Is Currently Disabled';
                statusDesc = 'Students trying to register will see an alert that the exam is currently inactive. No new attempts are permitted.';
                badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
              } else if (!startTimeStr) {
                statusTitle = 'Continuous Access (Always Open)';
                statusDesc = 'No start time restriction is configured. Registered students can begin the exam anytime as long as they have not previously submitted.';
                badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
              } else {
                const startTime = new Date(startTimeStr).getTime();
                const now = Date.now();
                const deadline = startTime + windowMinutes * 60 * 1000;

                if (now < startTime) {
                  const diffMinutes = Math.ceil((startTime - now) / 60000);
                  statusTitle = `Scheduled to Open in ${diffMinutes} Minute(s)`;
                  statusDesc = `Exam opens at ${new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Students on the onboarding page will see a live countdown timer.`;
                  badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                } else if (now >= startTime && now <= deadline) {
                  const diffMinutes = Math.ceil((deadline - now) / 60000);
                  statusTitle = `Registration Window Open (${diffMinutes}m remaining)`;
                  statusDesc = `Exam entry is currently live! Registration will close at ${new Date(deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
                  badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                } else {
                  statusTitle = 'Registration Window Has Closed';
                  statusDesc = `The entry window (${windowMinutes} mins past ${new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) expired. New student logins are locked.`;
                  badgeColor = 'bg-slate-500/20 text-slate-300 border-slate-500/30';
                }
              }

              return (
                <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      {isCurrentlyDisabled ? <Lock className="w-6 h-6 text-rose-400" /> : <Clock className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="font-bold text-white text-base sm:text-lg">Live Portal Access Status</h3>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${badgeColor}`}>
                          {statusTitle}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">{statusDesc}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Controls Form Container */}
            <div className="max-w-4xl mx-auto w-full">
              {/* Main Settings Form */}
              <div className="bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
                <div className="flex items-center gap-2 pb-4 border-b border-white/10">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h2 className="font-bold text-white">Exam Scheduling & Timing Configuration</h2>
                    <p className="text-xs text-slate-400">Configure access windows, start time, and entry timeout policies</p>
                  </div>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-6">
                  {/* 1. Exam Title Field */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Exam Title (عنوان ومسمى الاختبار)
                    </label>
                    <div className="relative">
                      <GraduationCap className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="e.g. Midterm Exam - Python & AI / اختبار البرمجة والذكاء الاصطناعي"
                        value={examSettings.exam_title || ''}
                        onChange={(e) => setExamSettings((prev) => ({ ...prev, exam_title: e.target.value }))}
                        className="w-full bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition"
                      />
                    </div>
                    <p className="text-xs text-slate-400">
                      Pre-defines the test title. It is presented to examinees and automatically attached to all student results.
                    </p>
                  </div>

                  {/* 2. Enable / Disable Switch */}
                  <div className="bg-slate-900/60 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div className="space-y-1 pr-4">
                      <label className="text-sm font-semibold text-white flex items-center gap-2">
                        {examSettings.is_enabled ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-rose-400" />}
                        <span>Exam Activation Status</span>
                      </label>
                      <p className="text-xs text-slate-400">
                        {examSettings.is_enabled
                          ? 'Exam is enabled and accessible according to the schedule below.'
                          : 'Exam is turned OFF. Students will see a locked screen regardless of schedule.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExamSettings((prev) => ({ ...prev, is_enabled: !prev.is_enabled }))}
                      className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        examSettings.is_enabled ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          examSettings.is_enabled ? 'translate-x-7' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 3. Simplified Timing / Scheduling UI */}
                  {(() => {
                    const timeParts = getTimeParts();
                    return (
                      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-4 sm:p-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-emerald-400" />
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                              Simplified Exam Schedule (تحديد موعد الاختبار)
                            </label>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {examSettings.exam_start_time
                              ? `Start: ${new Date(examSettings.exam_start_time).toLocaleString()}`
                              : '⚡ Always Open (No start delay)'}
                          </div>
                        </div>

                        {/* 1-Click Fast Presets */}
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-slate-400">Fast 1-Click Presets:</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              type="button"
                              onClick={() => setExamSettings((prev) => ({ ...prev, exam_start_time: null }))}
                              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                                !examSettings.exam_start_time
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                  : 'bg-slate-800/80 text-slate-300 border-white/10 hover:bg-slate-700'
                              }`}
                            >
                              🌐 Always Open
                            </button>
                            <button
                              type="button"
                              onClick={() => setExamSettings((prev) => ({ ...prev, exam_start_time: new Date().toISOString() }))}
                              className="py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/30 text-xs font-semibold transition"
                            >
                              ⚡ Start Right Now
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date(Date.now() + 5 * 60 * 1000);
                                setExamSettings((prev) => ({ ...prev, exam_start_time: d.toISOString() }));
                              }}
                              className="py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-blue-600/20 text-slate-300 hover:text-blue-300 border border-white/10 hover:border-blue-500/30 text-xs font-semibold transition"
                            >
                              ⏱️ In 5 Minutes
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date(Date.now() + 15 * 60 * 1000);
                                setExamSettings((prev) => ({ ...prev, exam_start_time: d.toISOString() }));
                              }}
                              className="py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-purple-600/20 text-slate-300 hover:text-purple-300 border border-white/10 hover:border-purple-500/30 text-xs font-semibold transition"
                            >
                              ⏱️ In 15 Minutes
                            </button>
                          </div>
                        </div>

                        {/* Clean Dropdowns: Day, Hour, Minute, AM/PM */}
                        <div className="pt-2 border-t border-white/10 space-y-2">
                          <span className="text-[11px] font-semibold text-slate-400">Quick Dropdown Time Configuration:</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            {/* Day Selector */}
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date</label>
                              <select
                                value={timeParts.day}
                                onChange={(e) => updateTimePart('day', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                              >
                                <option value="today">Today (اليوم)</option>
                                <option value="tomorrow">Tomorrow (غداً)</option>
                                <option value="always">Always Open (دائم)</option>
                              </select>
                            </div>

                            {/* Hour Selector */}
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Hour (الساعة)</label>
                              <select
                                value={timeParts.hour}
                                onChange={(e) => updateTimePart('hour', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                              >
                                {['01','02','03','04','05','06','07','08','09','10','11','12'].map((h) => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                            </div>

                            {/* Minute Selector */}
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Minute (الدقيقة)</label>
                              <select
                                value={timeParts.minute}
                                onChange={(e) => updateTimePart('minute', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none font-mono"
                              >
                                {['00','05','10','15','20','25','30','35','40','45','50','55'].map((m) => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            </div>

                            {/* AM/PM Selector */}
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 mb-1">Period (الفترة)</label>
                              <select
                                value={timeParts.period}
                                onChange={(e) => updateTimePart('period', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none font-bold text-emerald-400"
                              >
                                <option value="AM">AM (صباحاً)</option>
                                <option value="PM">PM (مساءً)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 4. Entry Window Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Allowed Entry Window (نافذة الدخول المسموح بها)
                      </label>
                      <span className="text-xs text-emerald-400 font-mono font-bold">
                        {examSettings.allowed_entry_window_minutes} Minutes
                      </span>
                    </div>

                    {/* Quick Window Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      {[5, 10, 15, 30, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setExamSettings((prev) => ({ ...prev, allowed_entry_window_minutes: mins }))}
                          className={`px-3 py-1 rounded-xl border text-xs font-mono font-medium transition ${
                            examSettings.allowed_entry_window_minutes === mins
                              ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50 shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 border-white/10 hover:bg-slate-700'
                          }`}
                        >
                          {mins} min
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={examSettings.allowed_entry_window_minutes || 10}
                        onChange={(e) =>
                          setExamSettings((prev) => ({
                            ...prev,
                            allowed_entry_window_minutes: Math.max(1, parseInt(e.target.value) || 10),
                          }))
                        }
                        className="w-full bg-slate-900/90 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white font-mono transition"
                      />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Students must click &quot;ابدأ الاختبار&quot; within this duration after start time. Once the window expires, new entries are locked.
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                    <button
                      type="submit"
                      disabled={isSavingSettings}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm text-white shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
                    >
                      {isSavingSettings ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving Settings...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Save & Apply Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Delete All */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Delete All Questions?</h3>
              <p className="text-xs text-slate-300 mt-1">
                Are you sure you want to permanently delete all {questions.length} questions from the Supabase Questions table? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-medium text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
