import { useState } from "react";
import { NotesProvider } from "./contexts/NotesContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Layout } from "./components/Layout";

export function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ThemeProvider>
      <NotesProvider>
        <Layout
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
          search={search}
          setSearch={setSearch}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
      </NotesProvider>
    </ThemeProvider>
  );
}
