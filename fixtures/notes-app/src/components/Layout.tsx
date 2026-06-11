import { Header } from "./Header";
import { MainArea } from "./MainArea";
import { StatusBar } from "./StatusBar";

type Props = {
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  search: string;
  setSearch: (s: string) => void;
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
};

export function Layout({
  selectedNoteId,
  setSelectedNoteId,
  search,
  setSearch,
  tagFilter,
  setTagFilter,
  sidebarOpen,
  setSidebarOpen,
}: Props) {
  return (
    <div className="layout">
      <Header
        search={search}
        setSearch={setSearch}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <MainArea
        selectedNoteId={selectedNoteId}
        setSelectedNoteId={setSelectedNoteId}
        search={search}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        sidebarOpen={sidebarOpen}
      />
      <StatusBar />
    </div>
  );
}
