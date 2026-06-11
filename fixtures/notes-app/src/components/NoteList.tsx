import { useMemo } from "react";
import { useNotes } from "../contexts/NotesContext";
import { NoteItem } from "./NoteItem";

type Props = {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  search: string;
  tagFilter: string | null;
};

export function NoteList({
  selectedNoteId,
  setSelectedNoteId,
  search,
  tagFilter,
}: Props) {
  const { notes } = useNotes();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (tagFilter && !n.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
      );
    });
  }, [notes, search, tagFilter]);

  if (filtered.length === 0) {
    return <p style={{ opacity: 0.5 }}>no notes</p>;
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {filtered.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          selected={note.id === selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
        />
      ))}
    </ul>
  );
}
