import { useNotes } from "../contexts/NotesContext";

type Props = {
  id: string;
  setSelectedNoteId: (id: string | null) => void;
};

export function DeleteButton({ id, setSelectedNoteId }: Props) {
  const { deleteNote } = useNotes();
  return (
    <button
      onClick={() => {
        deleteNote(id);
        setSelectedNoteId(null);
      }}
    >
      delete
    </button>
  );
}
