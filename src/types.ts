export type BlogMode = 'writer' | 'copilot' | 'autopilot';

export interface BlogSection {
  id: string;
  heading: string;
  content: string;
  imageIds: string[];
  order: number;
}

export interface BlogImage {
  id: string;
  prompt: string;
  provider: 'openai' | 'gemini';
  b64: string;
  url: string;
  alt: string;
}

export interface BlogProject {
  id: string;
  title: string;
  subtitle: string;
  mode: BlogMode;
  sections: BlogSection[];
  images: BlogImage[];
  meta_description: string;
  created_at: string;
  updated_at: string;
}

export interface PlanEntry {
  week: number;
  day_of_week: string;
  title: string;
  topic_area: string;
  outline_summary: string;
  image_concept: string;
  status: 'planned' | 'generating' | 'done' | 'error';
  blog_project_id?: string;
}

export interface ContentPlan {
  company_name: string;
  weeks: number;
  posts_per_week: number;
  entries: PlanEntry[];
}

export interface QuestionItem {
  id: string;
  question: string;
  suggestions: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];    // follow-up single-suggestion chips
  questions?: QuestionItem[]; // initial structured questionnaire
}
