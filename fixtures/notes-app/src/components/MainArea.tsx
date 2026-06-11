import { Sidebar } from "./Sidebar";
import { EditorPanel } from "./EditorPanel";

type Props = {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  search: string;
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
  sidebarOpen: boolean;
};

export function MainArea({
  selectedNoteId,
  setSelectedNoteId,
  search,
  tagFilter,
  setTagFilter,
  sidebarOpen,
}: Props) {
  return (
    <div className="main">
      {sidebarOpen && (
        <Sidebar
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
          search={search}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
        />
      )}
      <EditorPanel
        selectedNoteId={selectedNoteId}
        setSelectedNoteId={setSelectedNoteId}
      />
    </div>
  );
}
