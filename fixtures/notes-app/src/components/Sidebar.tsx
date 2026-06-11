import { TagFilter } from "./TagFilter";
import { NoteList } from "./NoteList";

type Props = {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  search: string;
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
};

export function Sidebar({
  selectedNoteId,
  setSelectedNoteId,
  search,
  tagFilter,
  setTagFilter,
}: Props) {
  return (
    <aside className="sidebar">
      <TagFilter tagFilter={tagFilter} setTagFilter={setTagFilter} />
      <NoteList
        selectedNoteId={selectedNoteId}
        setSelectedNoteId={setSelectedNoteId}
        search={search}
        tagFilter={tagFilter}
      />
    </aside>
  );
}
