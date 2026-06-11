import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Note } from "../types";

type NotesState = { notes: Note[]; lastSavedAt: number | null };

type NotesAction =
  | { type: "hydrate"; notes: Note[] }
  | { type: "create"; note: Note }
  | { type: "update"; id: string; patch: Partial<Note> }
  | { type: "delete"; id: string }
  | { type: "markSaved"; at: number };

function reducer(state: NotesState, action: NotesAction): NotesState {
  switch (action.type) {
    case "hydrate":
      return { ...state, notes: action.notes };
    case "create":
      return { ...state, notes: [action.note, ...state.notes] };
    case "update":
      return {
        ...state,
        notes: state.notes.map((n) =>
          n.id === action.id ? { ...n, ...action.patch, updatedAt: Date.now() } : n,
        ),
      };
    case "delete":
      return { ...state, notes: state.notes.filter((n) => n.id !== action.id) };
    case "markSaved":
      return { ...state, lastSavedAt: action.at };
  }
}

type NotesContextValue = {
  notes: Note[];
  lastSavedAt: number | null;
  createNote: () => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;
};

const NotesContext = createContext<NotesContextValue | null>(null);

const STORAGE_KEY = "notes.v1";

function loadInitial(): NotesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { notes: [], lastSavedAt: null };
    return { notes: JSON.parse(raw) as Note[], lastSavedAt: null };
  } catch {
    return { notes: [], lastSavedAt: null };
  }
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitial);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
        dispatch({ type: "markSaved", at: Date.now() });
      } catch {}
    }, 300);
    return () => clearTimeout(id);
  }, [state.notes]);

  const createNote = useCallback(() => {
    const id = crypto.randomUUID();
    const now = Date.now();
    dispatch({
      type: "create",
      note: {
        id,
        title: "untitled",
        body: "",
        tags: [],
        createdAt: now,
        updatedAt: now,
      },
    });
    return id;
  }, []);

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => dispatch({ type: "update", id, patch }),
    [],
  );

  const deleteNote = useCallback(
    (id: string) => dispatch({ type: "delete", id }),
    [],
  );

  const value = useMemo(
    () => ({
      notes: state.notes,
      lastSavedAt: state.lastSavedAt,
      createNote,
      updateNote,
      deleteNote,
    }),
    [state.notes, state.lastSavedAt, createNote, updateNote, deleteNote],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("NotesContext missing");
  return ctx;
}
