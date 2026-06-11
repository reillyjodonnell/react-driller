type Props = { body: string; setBody: (s: string) => void };

export function BodyField({ body, setBody }: Props) {
  return (
    <textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      placeholder="write something…"
    />
  );
}
