import { useMemo } from "react";
import { useNotes } from "../contexts/NotesContext";

type Props = {
  tagFilter: string | null;
  setTagFilter: (t: string | null) => void;
};

export function TagFilter({ tagFilter, setTagFilter }: Props) {
  const { notes } = useNotes();

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes]);

  if (tags.length === 0) return null;

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <button
        data-active={tagFilter === null}
        onClick={() => setTagFilter(null)}
        className="tag"
      >
        all
      </button>
      {tags.map((t) => (
        <button
          key={t}
          data-active={tagFilter === t}
          onClick={() => setTagFilter(t)}
          className="tag"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
