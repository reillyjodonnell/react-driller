import { useEffect, useRef } from "react";

type Props = { search: string; setSearch: (s: string) => void };

export function SearchBar({ search, setSearch }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== ref.current) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <input
      ref={ref}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="search (press /)"
      style={{ flex: 1 }}
    />
  );
}
