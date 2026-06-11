import { useState } from "react";

type Props = { tags: string[]; setTags: (t: string[]) => void };

export function TagInput({ tags, setTags }: Props) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const t = draft.trim();
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    setTags([...tags, t]);
    setDraft("");
  };

  return (
    <div>
      {tags.map((t) => (
        <span key={t} className="tag">
          {t}
          <button
            onClick={() => setTags(tags.filter((x) => x !== t))}
            style={{ marginLeft: "0.25rem", padding: 0, border: "none" }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder="add tag…"
        style={{ width: "auto", display: "inline-block" }}
      />
    </div>
  );
}
