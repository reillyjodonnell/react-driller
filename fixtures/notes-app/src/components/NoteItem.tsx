import type { Note } from "../types";

type Props = {
  note: Note;
  selected: boolean;
  setSelectedNoteId: (id: string | null) => void;
};

export function NoteItem({ note, selected, setSelectedNoteId }: Props) {
  return (
    <li
      className="note-item"
      data-selected={selected}
      onClick={() => setSelectedNoteId(note.id)}
    >
      <div>{note.title || "untitled"}</div>
      <div style={{ fontSize: "0.75rem", opacity: 0.5 }}>
        {new Date(note.updatedAt).toLocaleString()}
      </div>
    </li>
  );
}
