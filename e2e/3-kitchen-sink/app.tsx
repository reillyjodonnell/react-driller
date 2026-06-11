import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useReducer,
  useRef,
  useState,
} from "react";

type User = { id: string; name: string; email: string };
type Notification = { id: string; message: string; level: "info" | "warn" | "error" };
type Theme = "light" | "dark" | "system";

const AuthContext = createContext<{
  user: User | null;
  login: (name: string) => void;
  logout: () => void;
} | null>(null);

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
} | null>(null);

const NotificationContext = createContext<{
  notifications: Notification[];
  push: (n: Omit<Notification, "id">) => void;
  dismiss: (id: string) => void;
} | null>(null);

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext missing");
  return ctx;
}

function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("ThemeContext missing");
  return ctx;
}

function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("NotificationContext missing");
  return ctx;
}

type CartItem = { sku: string; qty: number; price: number };
type CartState = { items: CartItem[]; coupon: string | null };
type CartAction =
  | { type: "add"; item: CartItem }
  | { type: "remove"; sku: string }
  | { type: "setQty"; sku: string; qty: number }
  | { type: "applyCoupon"; coupon: string }
  | { type: "clear" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const existing = state.items.find((i) => i.sku === action.item.sku);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.sku === action.item.sku ? { ...i, qty: i.qty + action.item.qty } : i,
          ),
        };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case "remove":
      return { ...state, items: state.items.filter((i) => i.sku !== action.sku) };
    case "setQty":
      return {
        ...state,
        items: state.items.map((i) => (i.sku === action.sku ? { ...i, qty: action.qty } : i)),
      };
    case "applyCoupon":
      return { ...state, coupon: action.coupon };
    case "clear":
      return { items: [], coupon: null };
  }
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  const [systemPref, setSystemPref] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [route, setRoute] = useState<"home" | "shop" | "profile" | "settings">("home");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [online, setOnline] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const notifIdRef = useRef(0);

  useEffect(() => {
    const mql = { matches: false, addEventListener: (_: string, __: () => void) => {} };
    const handler = () => setSystemPref(mql.matches ? "dark" : "light");
    handler();
    mql.addEventListener("change", handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    return () => {
      onOnline();
      onOffline();
    };
  }, []);

  const login = useCallback((name: string) => {
    setUser({ id: crypto.randomUUID(), name, email: `${name}@example.com` });
  }, []);
  const logout = useCallback(() => setUser(null), []);

  const push = useCallback((n: Omit<Notification, "id">) => {
    const id = `n${++notifIdRef.current}`;
    setNotifications((prev) => [...prev, { ...n, id }]);
  }, []);
  const dismiss = useCallback(
    (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id)),
    [],
  );

  const resolved = theme === "system" ? systemPref : theme;

  const authValue = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  const themeValue = useMemo(
    () => ({ theme, setTheme, resolved }),
    [theme, resolved],
  );
  const notifValue = useMemo(
    () => ({ notifications, push, dismiss }),
    [notifications, push, dismiss],
  );

  return (
    <AuthContext.Provider value={authValue}>
      <ThemeContext.Provider value={themeValue}>
        <NotificationContext.Provider value={notifValue}>
          <Shell
            route={route}
            setRoute={setRoute}
            search={search}
            setSearch={setSearch}
            debouncedSearch={debouncedSearch}
            online={online}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        </NotificationContext.Provider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}

function Shell({
  route,
  setRoute,
  search,
  setSearch,
  debouncedSearch,
  online,
  sidebarOpen,
  setSidebarOpen,
}: {
  route: "home" | "shop" | "profile" | "settings";
  setRoute: (r: "home" | "shop" | "profile" | "settings") => void;
  search: string;
  setSearch: (s: string) => void;
  debouncedSearch: string;
  online: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
}) {
  const { resolved } = useTheme();
  return (
    <div data-theme={resolved} data-online={online}>
      <TopBar
        search={search}
        setSearch={setSearch}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <Body
        route={route}
        setRoute={setRoute}
        debouncedSearch={debouncedSearch}
        sidebarOpen={sidebarOpen}
      />
      <NotificationTray />
    </div>
  );
}

function TopBar({
  search,
  setSearch,
  sidebarOpen,
  setSidebarOpen,
}: {
  search: string;
  setSearch: (s: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
}) {
  return (
    <header>
      <SidebarToggle sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <Brand />
      <SearchArea search={search} setSearch={setSearch} />
      <UserMenu />
    </header>
  );
}

function SidebarToggle({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (b: boolean) => void;
}) {
  return (
    <button onClick={() => setSidebarOpen(!sidebarOpen)}>
      {sidebarOpen ? "close" : "open"} menu
    </button>
  );
}

function Brand() {
  const { resolved } = useTheme();
  return <span>kitchen-sink ({resolved})</span>;
}

function SearchArea({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div>
      <SearchInput search={search} setSearch={setSearch} />
      <SearchHint search={search} />
    </div>
  );
}

function SearchInput({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (s: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="search…"
    />
  );
}

function SearchHint({ search }: { search: string }) {
  return <small>{search.length === 0 ? "type to search" : `searching: ${search}`}</small>;
}

function UserMenu() {
  const { user, login, logout } = useAuth();
  if (!user) return <button onClick={() => login("guest")}>sign in</button>;
  return (
    <div>
      <span>hi, {user.name}</span>
      <button onClick={logout}>sign out</button>
    </div>
  );
}

function Body({
  route,
  setRoute,
  debouncedSearch,
  sidebarOpen,
}: {
  route: "home" | "shop" | "profile" | "settings";
  setRoute: (r: "home" | "shop" | "profile" | "settings") => void;
  debouncedSearch: string;
  sidebarOpen: boolean;
}) {
  return (
    <div>
      {sidebarOpen && <Sidebar route={route} setRoute={setRoute} />}
      <Main route={route} debouncedSearch={debouncedSearch} />
    </div>
  );
}

function Sidebar({
  route,
  setRoute,
}: {
  route: "home" | "shop" | "profile" | "settings";
  setRoute: (r: "home" | "shop" | "profile" | "settings") => void;
}) {
  const items: Array<"home" | "shop" | "profile" | "settings"> = [
    "home",
    "shop",
    "profile",
    "settings",
  ];
  return (
    <nav>
      {items.map((it) => (
        <NavItem key={it} item={it} active={route === it} setRoute={setRoute} />
      ))}
    </nav>
  );
}

function NavItem({
  item,
  active,
  setRoute,
}: {
  item: "home" | "shop" | "profile" | "settings";
  active: boolean;
  setRoute: (r: "home" | "shop" | "profile" | "settings") => void;
}) {
  return (
    <button data-active={active} onClick={() => setRoute(item)}>
      {item}
    </button>
  );
}

function Main({
  route,
  debouncedSearch,
}: {
  route: "home" | "shop" | "profile" | "settings";
  debouncedSearch: string;
}) {
  switch (route) {
    case "home":
      return <HomePage debouncedSearch={debouncedSearch} />;
    case "shop":
      return <ShopPage debouncedSearch={debouncedSearch} />;
    case "profile":
      return <ProfilePage />;
    case "settings":
      return <SettingsPage />;
  }
}

function HomePage({ debouncedSearch }: { debouncedSearch: string }) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <section>
      <h2>home</h2>
      <p>welcome {user?.name ?? "stranger"} — uptime tick {tick}</p>
      <Feed debouncedSearch={debouncedSearch} />
    </section>
  );
}

function Feed({ debouncedSearch }: { debouncedSearch: string }) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { push } = useNotifications();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      if (cancelled) return;
      setItems(
        ["alpha", "beta", "gamma", "delta"].filter((x) =>
          x.includes(debouncedSearch.toLowerCase()),
        ),
      );
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [debouncedSearch]);

  useEffect(() => {
    if (!loading && items.length === 0) {
      push({ message: "no results", level: "info" });
    }
  }, [loading, items, push]);

  return (
    <ul>
      {loading ? <li>loading…</li> : items.map((it) => <FeedItem key={it} label={it} />)}
    </ul>
  );
}

function FeedItem({ label }: { label: string }) {
  return <li>{label}</li>;
}

function ShopPage({ debouncedSearch }: { debouncedSearch: string }) {
  const [cart, dispatch] = useReducer(cartReducer, { items: [], coupon: null });
  const products = useMemo(
    () =>
      [
        { sku: "A1", name: "alpha widget", price: 10 },
        { sku: "B2", name: "beta gadget", price: 20 },
        { sku: "C3", name: "gamma gizmo", price: 30 },
      ].filter((p) => p.name.includes(debouncedSearch.toLowerCase())),
    [debouncedSearch],
  );
  const total = useMemo(
    () => cart.items.reduce((sum, i) => sum + i.qty * i.price, 0),
    [cart.items],
  );
  return (
    <section>
      <ProductGrid products={products} dispatch={dispatch} />
      <CartSummary cart={cart} total={total} dispatch={dispatch} />
    </section>
  );
}

function ProductGrid({
  products,
  dispatch,
}: {
  products: Array<{ sku: string; name: string; price: number }>;
  dispatch: React.Dispatch<CartAction>;
}) {
  return (
    <div>
      {products.map((p) => (
        <ProductCard key={p.sku} product={p} dispatch={dispatch} />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  dispatch,
}: {
  product: { sku: string; name: string; price: number };
  dispatch: React.Dispatch<CartAction>;
}) {
  const { push } = useNotifications();
  return (
    <article>
      <h3>{product.name}</h3>
      <span>${product.price}</span>
      <AddToCartButton product={product} dispatch={dispatch} push={push} />
    </article>
  );
}

function AddToCartButton({
  product,
  dispatch,
  push,
}: {
  product: { sku: string; name: string; price: number };
  dispatch: React.Dispatch<CartAction>;
  push: (n: Omit<Notification, "id">) => void;
}) {
  return (
    <button
      onClick={() => {
        dispatch({ type: "add", item: { sku: product.sku, qty: 1, price: product.price } });
        push({ message: `added ${product.name}`, level: "info" });
      }}
    >
      add
    </button>
  );
}

function CartSummary({
  cart,
  total,
  dispatch,
}: {
  cart: CartState;
  total: number;
  dispatch: React.Dispatch<CartAction>;
}) {
  return (
    <aside>
      <CartLineItems items={cart.items} dispatch={dispatch} />
      <CouponInput coupon={cart.coupon} dispatch={dispatch} />
      <CartTotal total={total} coupon={cart.coupon} dispatch={dispatch} />
    </aside>
  );
}

function CartLineItems({
  items,
  dispatch,
}: {
  items: CartItem[];
  dispatch: React.Dispatch<CartAction>;
}) {
  if (items.length === 0) return <p>cart empty</p>;
  return (
    <ul>
      {items.map((i) => (
        <CartLine key={i.sku} item={i} dispatch={dispatch} />
      ))}
    </ul>
  );
}

function CartLine({
  item,
  dispatch,
}: {
  item: CartItem;
  dispatch: React.Dispatch<CartAction>;
}) {
  return (
    <li>
      <span>
        {item.sku} × {item.qty}
      </span>
      <QtyStepper item={item} dispatch={dispatch} />
      <RemoveButton sku={item.sku} dispatch={dispatch} />
    </li>
  );
}

function QtyStepper({
  item,
  dispatch,
}: {
  item: CartItem;
  dispatch: React.Dispatch<CartAction>;
}) {
  return (
    <span>
      <button onClick={() => dispatch({ type: "setQty", sku: item.sku, qty: item.qty - 1 })}>
        -
      </button>
      <button onClick={() => dispatch({ type: "setQty", sku: item.sku, qty: item.qty + 1 })}>
        +
      </button>
    </span>
  );
}

function RemoveButton({
  sku,
  dispatch,
}: {
  sku: string;
  dispatch: React.Dispatch<CartAction>;
}) {
  return <button onClick={() => dispatch({ type: "remove", sku })}>x</button>;
}

function CouponInput({
  coupon,
  dispatch,
}: {
  coupon: string | null;
  dispatch: React.Dispatch<CartAction>;
}) {
  const [draft, setDraft] = useState(coupon ?? "");
  return (
    <div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="coupon" />
      <button onClick={() => dispatch({ type: "applyCoupon", coupon: draft })}>apply</button>
    </div>
  );
}

function CartTotal({
  total,
  coupon,
  dispatch,
}: {
  total: number;
  coupon: string | null;
  dispatch: React.Dispatch<CartAction>;
}) {
  const discounted = coupon === "SAVE10" ? total * 0.9 : total;
  return (
    <div>
      <strong>total: ${discounted.toFixed(2)}</strong>
      <button onClick={() => dispatch({ type: "clear" })}>clear cart</button>
    </div>
  );
}

function ProfilePage() {
  const { user, logout } = useAuth();
  const [bio, setBio] = useState("");
  const [savedBio, setSavedBio] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(bio !== savedBio);
  }, [bio, savedBio]);

  if (!user) return <p>please sign in</p>;
  return (
    <section>
      <h2>profile</h2>
      <ProfileForm
        bio={bio}
        setBio={setBio}
        dirty={dirty}
        onSave={() => setSavedBio(bio)}
      />
      <button onClick={logout}>sign out</button>
    </section>
  );
}

function ProfileForm({
  bio,
  setBio,
  dirty,
  onSave,
}: {
  bio: string;
  setBio: (s: string) => void;
  dirty: boolean;
  onSave: () => void;
}) {
  return (
    <div>
      <BioField bio={bio} setBio={setBio} />
      <SaveBar dirty={dirty} onSave={onSave} />
    </div>
  );
}

function BioField({ bio, setBio }: { bio: string; setBio: (s: string) => void }) {
  return <textarea value={bio} onChange={(e) => setBio(e.target.value)} />;
}

function SaveBar({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  return (
    <div>
      <span>{dirty ? "unsaved" : "saved"}</span>
      <button disabled={!dirty} onClick={onSave}>
        save
      </button>
    </div>
  );
}

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const themes: Theme[] = ["light", "dark", "system"];
  return (
    <section>
      <h2>settings</h2>
      <ThemePicker theme={theme} setTheme={setTheme} themes={themes} />
    </section>
  );
}

function ThemePicker({
  theme,
  setTheme,
  themes,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
  themes: Theme[];
}) {
  return (
    <div>
      {themes.map((t) => (
        <ThemeOption key={t} value={t} active={t === theme} setTheme={setTheme} />
      ))}
    </div>
  );
}

function ThemeOption({
  value,
  active,
  setTheme,
}: {
  value: Theme;
  active: boolean;
  setTheme: (t: Theme) => void;
}) {
  return (
    <button data-active={active} onClick={() => setTheme(value)}>
      {value}
    </button>
  );
}

function NotificationTray() {
  const { notifications, dismiss } = useNotifications();
  if (notifications.length === 0) return null;
  return (
    <div role="status">
      {notifications.map((n) => (
        <NotificationItem key={n.id} notification={n} dismiss={dismiss} />
      ))}
    </div>
  );
}

function NotificationItem({
  notification,
  dismiss,
}: {
  notification: Notification;
  dismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => dismiss(notification.id), 4000);
    return () => clearTimeout(t);
  }, [notification.id, dismiss]);
  return (
    <div data-level={notification.level}>
      <span>{notification.message}</span>
      <button onClick={() => dismiss(notification.id)}>×</button>
    </div>
  );
}

function UnusedSibling() {
  return <p>I touch nothing.</p>;
}
