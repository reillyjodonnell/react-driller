type Props = { title: string; setTitle: (s: string) => void };

export function TitleField({ title, setTitle }: Props) {
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder="title"
    />
  );
}
