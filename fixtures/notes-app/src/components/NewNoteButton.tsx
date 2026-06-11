import { useNotes } from "../contexts/NotesContext";

export function NewNoteButton() {
  const { createNote } = useNotes();
  return <button onClick={() => createNote()}>+ new</button>;
}
