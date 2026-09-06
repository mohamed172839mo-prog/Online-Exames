import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Student {
  id?: string;
  full_name: string;
  phone_number: string;
  created_at?: string;
}

export interface Question {
  id?: string;
  text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  time_limit: number;
  created_at?: string;
}

export interface ExamResult {
  id?: string;
  student_name: string;
  student_phone: string;
  exam_title?: string;
  total_score: number;
  correct_answers_count: number;
  total_questions: number;
  percentage?: number;
  answers?: Record<string, string>;
  allow_retake?: boolean;
  created_at?: string;
}

export interface ExamSettings {
  id?: number | string;
  exam_title?: string;
  is_enabled: boolean;
  exam_start_time?: string | null;
  allowed_entry_window_minutes: number;
  updated_at?: string;
}
