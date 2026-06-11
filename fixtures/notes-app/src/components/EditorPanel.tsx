import { useNotes } from "../contexts/NotesContext";
import { NoteEditor } from "./NoteEditor";

type Props = {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
};

export function EditorPanel({ selectedNoteId, setSelectedNoteId }: Props) {
  const { notes } = useNotes();
  const note = notes.find((n) => n.id === selectedNoteId) ?? null;

  if (!note) {
    return (
      <div className="editor">
        <p style={{ opacity: 0.5 }}>select a note or create a new one</p>
      </div>
    );
  }

  return <NoteEditor note={note} setSelectedNoteId={setSelectedNoteId} />;
}
