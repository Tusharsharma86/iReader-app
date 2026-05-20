import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Story } from '../types';

interface SavedCtx { savedStories: Story[]; toggleSave: (s: Story) => void; isSaved: (id: string) => boolean; }

const SavedContext = createContext<SavedCtx>({ savedStories: [], toggleSave: ()=>{}, isSaved: ()=>false });

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedStories, setSavedStories] = useState<Story[]>(() => {
    try { const r = localStorage.getItem('@ireader_saved'); return r ? JSON.parse(r) : []; } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('@ireader_saved', JSON.stringify(savedStories)); } catch {}
  }, [savedStories]);

  const toggleSave = useCallback((story: Story) => {
    setSavedStories(prev => prev.some(s => s.id === story.id) ? prev.filter(s => s.id !== story.id) : [story, ...prev]);
  }, []);

  const isSaved = useCallback((id: string) => savedStories.some(s => s.id === id), [savedStories]);

  return <SavedContext.Provider value={{ savedStories, toggleSave, isSaved }}>{children}</SavedContext.Provider>;
}

export function useSaved() { return useContext(SavedContext); }
