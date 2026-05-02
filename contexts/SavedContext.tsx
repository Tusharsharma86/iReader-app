import React, { createContext, useCallback, useContext, useState } from 'react';
import { Story } from '../components/StoryCard';

interface SavedContextType {
  savedStories: Story[];
  toggleSave: (story: Story) => void;
  isSaved: (id: string) => boolean;
}

const SavedContext = createContext<SavedContextType>({
  savedStories: [],
  toggleSave: () => {},
  isSaved: () => false,
});

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedStories, setSavedStories] = useState<Story[]>([]);

  const toggleSave = useCallback((story: Story) => {
    setSavedStories(prev => {
      const exists = prev.some(s => s.id === story.id);
      return exists ? prev.filter(s => s.id !== story.id) : [story, ...prev];
    });
  }, []);

  const isSaved = useCallback((id: string) => {
    return savedStories.some(s => s.id === id);
  }, [savedStories]);

  return (
    <SavedContext.Provider value={{ savedStories, toggleSave, isSaved }}>
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  return useContext(SavedContext);
}
