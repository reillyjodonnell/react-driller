import { useTheme } from "../contexts/ThemeContext";

export function Brand() {
  const { resolved } = useTheme();
  return (
    <strong>
      notes <span style={{ opacity: 0.5 }}>({resolved})</span>
    </strong>
  );
}
