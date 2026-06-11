import { useEffect, useState } from "react";
import { useNotes } from "../contexts/NotesContext";
import { TitleField } from "./TitleField";
import { BodyField } from "./BodyField";
import { TagInput } from "./TagInput";
import { DeleteButton } from "./DeleteButton";
import type { Note } from "../types";

type Props = {
  note: Note;
  setSelectedNoteId: (id: string | null) => void;
};

export function NoteEditor({ note, setSelectedNoteId }: Props) {
  const { updateNote } = useNotes();

  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState<string[]>(note.tags);

  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags);
  }, [note.id]);

  useEffect(() => {
    const id = setTimeout(() => {
      updateNote(note.id, { title, body, tags });
    }, 250);
    return () => clearTimeout(id);
  }, [title, body, tags, note.id, updateNote]);

  return (
    <div className="editor">
      <TitleField title={title} setTitle={setTitle} />
      <TagInput tags={tags} setTags={setTags} />
      <BodyField body={body} setBody={setBody} />
      <DeleteButton id={note.id} setSelectedNoteId={setSelectedNoteId} />
    </div>
  );
}
