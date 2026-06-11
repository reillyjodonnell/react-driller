import { useTheme } from "../contexts/ThemeContext";
import type { Theme } from "../types";

const NEXT: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme(NEXT[theme])}>theme: {theme}</button>;
}
