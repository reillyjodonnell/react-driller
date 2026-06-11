type Props = {
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
};

export function SidebarToggle({ sidebarOpen, setSidebarOpen }: Props) {
  return (
    <button onClick={() => setSidebarOpen(!sidebarOpen)}>
      {sidebarOpen ? "hide" : "show"}
    </button>
  );
}
