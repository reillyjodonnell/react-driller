import { Brand } from "./Brand";
import { SidebarToggle } from "./SidebarToggle";
import { SearchBar } from "./SearchBar";
import { NewNoteButton } from "./NewNoteButton";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  search: string;
  setSearch: (s: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
};

export function Header({ search, setSearch, sidebarOpen, setSidebarOpen }: Props) {
  return (
    <header className="header">
      <SidebarToggle sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <Brand />
      <SearchBar search={search} setSearch={setSearch} />
      <NewNoteButton />
      <ThemeToggle />
    </header>
  );
}
