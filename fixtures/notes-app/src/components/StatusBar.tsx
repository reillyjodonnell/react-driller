import { useEffect, useState } from "react";
import { useNotes } from "../contexts/NotesContext";

export function StatusBar() {
  const { notes, lastSavedAt } = useNotes();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const savedAgo = lastSavedAt
    ? `${Math.max(0, Math.round((now - lastSavedAt) / 1000))}s ago`
    : "never";

  return (
    <div className="status">
      {notes.length} note{notes.length === 1 ? "" : "s"} · saved {savedAgo}
    </div>
  );
}
