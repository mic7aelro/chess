import type { AnalysisResult } from '@/types';

export interface SavedFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedReview {
  id: string;
  folderId: string | null;
  name: string;
  pgn: string;
  white?: string;
  black?: string;
  date?: string;
  savedAt: number;
  result: AnalysisResult;
}

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/library`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Library API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function getFolders(): Promise<SavedFolder[]> {
  return req<SavedFolder[]>('/folders');
}

export async function createFolder(name: string): Promise<SavedFolder> {
  return req<SavedFolder>('/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await req(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  await req(`/folders/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Games / Reviews
// ---------------------------------------------------------------------------

export async function getReviews(): Promise<SavedReview[]> {
  return req<SavedReview[]>('/games');
}

export async function saveReview(
  data: Omit<SavedReview, 'id' | 'savedAt'>,
): Promise<SavedReview> {
  return req<SavedReview>('/games', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function renameReview(id: string, name: string): Promise<void> {
  await req(`/games/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteReview(id: string): Promise<void> {
  await req(`/games/${id}`, { method: 'DELETE' });
}

export async function updateReviewAnalysis(
  id: string,
  result: AnalysisResult,
): Promise<void> {
  await req(`/games/${id}/analysis`, {
    method: 'PUT',
    body: JSON.stringify({ result }),
  });
}
