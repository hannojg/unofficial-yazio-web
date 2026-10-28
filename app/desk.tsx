"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Droplets,
  Leaf,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import type {
  Day,
  Entry,
  MealName,
  Product,
  Profile,
  SearchProduct,
} from "../lib/yazio";

import type { RecentProduct } from "../lib/recent-products";

type Session = { connected: boolean; profile?: Profile };
type Selected = { id: string; product: Product };
type Theme = "light" | "dark";
const meals: { id: MealName; label: string; emoji: string }[] = [
  { id: "breakfast", label: "Breakfast", emoji: "☕" },
  { id: "lunch", label: "Lunch", emoji: "🥗" },
  { id: "dinner", label: "Dinner", emoji: "🍲" },
  { id: "snack", label: "Snacks", emoji: "🍎" },
];

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offset);
  const iso = local.toISOString();
  return iso.slice(0, 10);
}

function number(value: number | undefined) {
  if (value === undefined) return "—";
  const rounded = Math.round(value);
  return rounded.toLocaleString();
}

async function request<T>(
  path: string,
  method = "GET",
  value?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const body = value === undefined ? undefined : JSON.stringify(value);
  const response = await fetch(path, {
    method,
    body,
    signal,
    headers: { "Content-Type": "application/json" },
  });
  const text = await response.text();
  const result: T & { error?: string } = JSON.parse(text);
  if (response.ok) return result;
  throw new Error(result.error ?? "The request could not be completed.");
}

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export default function Desk() {
  const [theme, setTheme] = useState<Theme>("light");
  const [session, setSession] = useState<Session>({ connected: false });
  const [booting, setBooting] = useState(true);
  const [date, setDate] = useState("");
  const [day, setDay] = useState<Day | null>(null);
  const [loading, setLoading] = useState(false);
  const [helper, setHelper] = useState(false);
  const [setup, setSetup] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [meal, setMeal] = useState<MealName>("lunch");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<RecentProduct[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const [recentError, setRecentError] = useState("");
  const [recentRevision, setRecentRevision] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Entry | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("nutrition-desk-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    let initial: Theme = prefersDark ? "dark" : "light";
    if (stored === "light" || stored === "dark") initial = stored;
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("nutrition-desk-theme", next);
  }

  const reportError = useCallback((error: unknown) => {
    const text = message(error);
    setError(text);
  }, []);

  const syncSession = useCallback(async () => {
    try {
      const next = await request<Session>("/api/session");
      setSession(next);
      setPairing(false);
    } catch (error) {
      reportError(error);
    } finally {
      setBooting(false);
    }
  }, [reportError]);

  useEffect(() => {
    const today = localDate();
    setDate(today);
    void syncSession();
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      if (event.data?.type === "ND_HELPER_READY") setHelper(true);
      if (event.data?.type === "ND_CONNECTED") {
        setSetup(false);
        setNotice("Your YAZIO account is connected. Welcome to your desk.");
        void syncSession();
      }
      if (event.data?.type === "ND_ERROR") {
        setPairing(false);
        setError(event.data.error);
      }
    }
    window.addEventListener("message", receive);
    window.postMessage({ type: "ND_HELPER_PING" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, [syncSession]);

  useEffect(() => {
    if (!session.connected || !date) {
      setDay(null);
      return;
    }
    const controller = new AbortController();
    setDay(null);
    setLoading(true);
    async function loadDay() {
      try {
        const next = await request<Day>(
          `/api/day?date=${date}`,
          "GET",
          undefined,
          controller.signal,
        );
        setDay(next);
      } catch (error) {
        if (!controller.signal.aborted) reportError(error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadDay();
    return () => controller.abort();
  }, [session.connected, date, revision, reportError]);

  useEffect(() => {
    if (!searchOpen || query.trim().length < 2 || selected) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    async function search() {
      const trimmed = query.trim();
      const encoded = encodeURIComponent(trimmed);
      try {
        const next = await request<SearchProduct[]>(
          `/api/search?q=${encoded}`,
          "GET",
          undefined,
          controller.signal,
        );
        setResults(next);
      } catch (error) {
        if (!controller.signal.aborted) reportError(error);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }
    const timer = setTimeout(search, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected, searchOpen, reportError]);

  useEffect(() => {
    if (!searchOpen || !session.connected) {
      setRecents([]);
      return;
    }
    const controller = new AbortController();
    setLoadingRecents(true);
    setRecentError("");
    async function loadRecents() {
      try {
        const next = await request<RecentProduct[]>(
          "/api/recents",
          "GET",
          undefined,
          controller.signal,
        );
        setRecents(next);
      } catch (error) {
        if (!controller.signal.aborted) {
          const text = message(error);
          setRecentError(text);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingRecents(false);
      }
    }
    void loadRecents();
    return () => controller.abort();
  }, [searchOpen, session.connected, revision, recentRevision]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!searchOpen && !setup && !removing) return;
    const previous = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>("[role=dialog]");
    const selector =
      "button:not(:disabled), a[href], input:not(:disabled), [tabindex='0']";
    const first = dialog?.querySelector<HTMLElement>(selector);
    first?.focus();
    function close(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setSearchOpen(false);
        setSetup(false);
        setRemoving(null);
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(selector);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = originalOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [searchOpen, setup, removing, busy]);

  useEffect(() => {
    if (!pairing) return;
    const timer = setTimeout(() => {
      setPairing(false);
      setError("The connection expired. Click Connect and sign in again.");
      window.postMessage({ type: "ND_CANCEL" }, window.location.origin);
    }, 600000);
    return () => clearTimeout(timer);
  }, [pairing]);

  async function connect() {
    if (!helper) {
      setSetup(true);
      return;
    }
    try {
      setError("");
      const pair = await request<{ nonce: string }>("/api/connect", "POST", {});
      setPairing(true);
      window.postMessage(
        { type: "ND_CONNECT", nonce: pair.nonce },
        window.location.origin,
      );
    } catch (error) {
      reportError(error);
    }
  }

  async function disconnect() {
    try {
      await request("/api/session", "DELETE");
      setSession({ connected: false });
      setDay(null);
      setSetup(false);
      setPairing(false);
      window.postMessage({ type: "ND_CANCEL" }, window.location.origin);
      setNotice("Account disconnected from this browser.");
    } catch (error) {
      reportError(error);
    }
  }

  function shiftDate(delta: number) {
    const next = new Date(`${date}T12:00:00`);
    const shifted = next.getDate() + delta;
    next.setDate(shifted);
    const iso = localISO(next);
    setDate(iso);
  }

  function openSearch(nextMeal: MealName) {
    setMeal(nextMeal);
    setQuery("");
    setSelected(null);
    setResults([]);
    setAmount("100");
    setSearchOpen(true);
  }

  function selectRecent(result: RecentProduct) {
    setSelected({ id: result.product_id, product: result.product });
    const quantity = String(result.amount);
    setAmount(quantity);
  }

  async function selectProduct(result: SearchProduct) {
    setBusy(true);
    try {
      const product = await request<Product>(
        `/api/product/${result.product_id}`,
      );
      setSelected({ id: result.product_id, product });
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function addFood(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const numericAmount = Number(amount);
    setBusy(true);
    setError("");
    try {
      await request("/api/entries", "POST", {
        productId: selected.id,
        amount: numericAmount,
        meal,
        date,
      });
      setSearchOpen(false);
      setRevision((value) => value + 1);
      setNotice("Food added to your YAZIO diary.");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function removeFood() {
    if (!removing) return;
    setBusy(true);
    try {
      await request("/api/entries", "DELETE", {
        id: removing.id,
        bucket: removing.bucket,
      });
      setRemoving(null);
      setRevision((value) => value + 1);
      setNotice("Entry removed from your YAZIO diary.");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function addWater() {
    if (!day) return;
    setBusy(true);
    const amountMl = day.summary.water_intake + 250;
    try {
      await request("/api/water", "POST", { date, amountMl });
      setRevision((value) => value + 1);
      setNotice("250 ml of water logged.");
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  const summary = day?.summary;
  let eaten = 0;
  const totals: Record<string, number> = {};
  if (summary) {
    for (const item of Object.values(summary.meals)) {
      for (const [key, value] of Object.entries(item.nutrients))
        totals[key] = (totals[key] ?? 0) + value;
    }
    eaten = totals["energy.energy"] ?? 0;
  }
  const goal = summary?.goals["energy.energy"] ?? 0;
  const activity = summary?.consume_activity_energy
    ? summary.activity_energy
    : 0;
  const remaining = goal + activity - eaten;
  const absoluteRemaining = Math.abs(remaining);
  const filled = goal > 0 ? Math.min(eaten / (goal + activity), 1) : 0;
  const ringDash = `${filled * 75} 100`;
  const today = localDate();
  const dateObject = new Date(`${date || today}T12:00:00`);
  const dateLabel = dateObject.toLocaleDateString("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const unit =
    summary?.units.unit_energy ?? session.profile?.unit_energy ?? "kcal";
  const greeting = session.profile?.first_name
    ? `${session.profile.first_name}’s diary`
    : "Your daily diary";
  const water = summary?.water_intake;
  const waterGoal = summary?.goals.water;
  const waterLabel =
    water === undefined
      ? "—"
      : `${(water / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} L`;
  const waterGoalLabel =
    waterGoal === undefined
      ? "Your daily hydration"
      : `of ${waterGoal / 1000} L goal`;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Nutrition Desk home">
          <span className="brand-mark">
            <BookOpen size={23} strokeWidth={2.6} />
          </span>
          <span>
            nutrition<span className="brand-second">desk</span>
          </span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <button className="nav active" onClick={() => setDate(today)}>
          <BookOpen size={19} />
          Food diary
          <span className="nav-dot" />
        </button>
        <button className="nav" onClick={() => setSetup(true)}>
          <Link2 size={19} />
          Your connection
        </button>
        <div className="side-bottom">
          <div className="side-note">
            <span className="note-icon">
              <Sparkles size={19} />
            </span>
            <strong>
              Little habits.
              <br />
              Big progress.
            </strong>
            <p>
              Your YAZIO diary.
              <br />
              Made for the big screen.
            </p>
          </div>
          <button className="nav help" onClick={() => setSetup(true)}>
            <CircleHelp size={18} />
            How it works
            <ArrowRight size={15} />
          </button>
          <div className="private-note">
            <ShieldCheck size={14} />
            Private, just for you
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Nutrition Desk <span>/</span> <strong>Diary</strong>
          </div>
          <div className="header-actions">
            <button
              className="theme-button"
              onClick={toggleTheme}
              aria-label={
                theme === "light"
                  ? "Switch to dark theme"
                  : "Switch to light theme"
              }
            >
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button
              className={`connection-pill ${session.connected ? "connected" : ""}`}
              onClick={() => setSetup(true)}
            >
              <span />
              {booting
                ? "Checking connection"
                : session.connected
                  ? "Connected to YAZIO"
                  : "YAZIO not connected"}
              <ChevronRight size={14} />
            </button>
          </div>
        </header>
        <div className="workspace">
          <section className="page-heading">
            <div>
              <div className="eyebrow">YOUR EVERYDAY, A LITTLE BETTER</div>
              <h1>
                Your food diary<span>.</span>
              </h1>
              <p>Small steps. Healthy habits. All in one place.</p>
            </div>
            <button
              className="primary"
              onClick={() =>
                session.connected ? openSearch("lunch") : connect()
              }
              disabled={booting || pairing}
            >
              <Plus size={18} />
              {session.connected
                ? "Log food"
                : pairing
                  ? "Waiting for sign-in…"
                  : "Connect YAZIO"}
            </button>
          </section>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          <div className="date-row">
            <div className="date-navigation">
              <button
                onClick={() => shiftDate(-1)}
                aria-label="Previous day"
                disabled={!date}
              >
                <ChevronLeft size={18} />
              </button>
              <label className="date-label">
                {dateLabel}
                <input
                  aria-label="Diary date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <button
                onClick={() => shiftDate(1)}
                aria-label="Next day"
                disabled={!date}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              className={`today ${date === today ? "selected" : ""}`}
              onClick={() => setDate(today)}
            >
              Today
            </button>
            <span className="sync-note">
              {loading ? (
                <>
                  <LoaderCircle className="spin" size={13} /> Syncing your diary
                </>
              ) : session.connected ? (
                <>
                  <Check size={13} /> Synced with YAZIO
                </>
              ) : (
                "Your diary will appear here"
              )}
            </span>
          </div>

          <div className="content-grid">
            <div className="diary-column">
              <section className="card overview">
                <div className="card-heading">
                  <h2>Summary</h2>
                  <span className="subtle-label">{unit.toUpperCase()}</span>
                </div>
                <div className="overview-body">
                  <div className="energy-stats">
                    <div className="energy-stat">
                      <strong>{summary ? number(eaten) : "—"}</strong>
                      <span>Eaten</span>
                    </div>
                    <div className="energy-ring">
                      <svg
                        viewBox="0 0 180 180"
                        className="energy-arc"
                        aria-hidden="true"
                      >
                        <circle
                          className="ring-track"
                          cx="90"
                          cy="90"
                          r="72"
                          pathLength="100"
                          strokeDasharray="75 100"
                          transform="rotate(135 90 90)"
                        />
                        <circle
                          className="ring-fill"
                          cx="90"
                          cy="90"
                          r="72"
                          pathLength="100"
                          strokeDasharray={ringDash}
                          transform="rotate(135 90 90)"
                        />
                      </svg>
                      <div className="ring-copy">
                        <strong>
                          {summary ? number(absoluteRemaining) : "—"}
                        </strong>
                        <span>
                          {remaining < 0 ? "Above goal" : "Remaining"}
                        </span>
                        <small>{unit}</small>
                      </div>
                    </div>
                    <div className="energy-stat">
                      <strong>{summary ? number(activity) : "—"}</strong>
                      <span>Activity added</span>
                    </div>
                  </div>
                  <p className="daily-goal">
                    Daily goal{" "}
                    <strong>
                      {summary ? number(goal) : "—"} {unit}
                    </strong>
                  </p>
                  <div className="macro-list">
                    {[
                      { name: "Carbs", key: "nutrient.carb" },
                      {
                        name: "Protein",
                        key: "nutrient.protein",
                      },
                      { name: "Fat", key: "nutrient.fat" },
                    ].map((macro) => {
                      const value = totals[macro.key] ?? 0;
                      const target = summary?.goals[macro.key] ?? 0;
                      const percent =
                        target > 0 ? Math.min((value / target) * 100, 100) : 0;
                      const width = `${percent}%`;
                      return (
                        <div className="macro" key={macro.key}>
                          <div>
                            <span>{macro.name}</span>
                            <span>
                              <strong>{summary ? number(value) : "—"}</strong>
                              <small>
                                {" "}
                                / {summary ? number(target) : "—"} g
                              </small>
                            </span>
                          </div>
                          <div className="progress">
                            <span style={{ width }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <div className="section-title">
                <h2>{greeting}</h2>
                <span>ONE MEAL AT A TIME</span>
              </div>
              {meals.map((item) => {
                const entries =
                  day?.entries.filter((entry) => entry.meal === item.id) ?? [];
                const mealEnergy =
                  summary?.meals[item.id]?.nutrients["energy.energy"] ?? 0;
                const mealGoal = summary?.meals[item.id]?.energy_goal ?? 0;
                const mealFilled =
                  mealGoal > 0 ? Math.min(mealEnergy / mealGoal, 1) : 0;
                const mealStyle: React.CSSProperties & {
                  "--meal-progress": string;
                } = { "--meal-progress": `${mealFilled * 360}deg` };
                return (
                  <section className="card meal-card" key={item.id}>
                    <div className="meal-header">
                      <span className="meal-icon" style={mealStyle}>
                        <span aria-hidden="true">{item.emoji}</span>
                      </span>
                      <div className="meal-title">
                        <h3>{item.label}</h3>
                        <span>
                          {summary
                            ? `${number(mealEnergy)} ${unit}`
                            : "Ready when you are"}
                        </span>
                      </div>
                      <button
                        className="add-button"
                        disabled={!session.connected || loading}
                        onClick={() => openSearch(item.id)}
                        aria-label={`Add food to ${item.label}`}
                      >
                        <Plus size={19} />
                      </button>
                    </div>
                    {entries.length > 0 ? (
                      <div className="entries">
                        {entries.map((entry) => (
                          <div className="entry" key={entry.id}>
                            <div>
                              <strong>{entry.name}</strong>
                              <span>{entry.description}</span>
                            </div>
                            <span>
                              {entry.energy === null
                                ? "—"
                                : number(entry.energy)}{" "}
                              <small>{unit}</small>
                            </span>
                            <button
                              className="delete-button"
                              aria-label={`Remove ${entry.name}`}
                              onClick={() => setRemoving(entry)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-meal">
                        {loading
                          ? "Loading your entries…"
                          : session.connected
                            ? "Nothing logged yet. What’s on the menu?"
                            : "Connect your account to see this meal."}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <aside className="right-column">
              {session.connected ? (
                <section className="connection-card">
                  <span className="round-icon">
                    <img
                      className="connected-mascot"
                      src="/yettie.webp"
                      alt=""
                    />
                  </span>
                  <div className="eyebrow">YOUR YAZIO COMPANION</div>
                  <h2>Hello, {session.profile?.first_name}.</h2>
                  <p>
                    Your diary changes sync directly with YAZIO. Pick a date,
                    find your food, and make yourself at home.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setSetup(true)}
                  >
                    Manage connection
                    <ArrowRight size={16} />
                  </button>
                </section>
              ) : (
                <section className="connection-card">
                  <img
                    className="connection-mascot"
                    src="/yettie.webp"
                    alt="YAZIO’s Yettie mascot waving"
                  />
                  <div className="eyebrow">YOUR YAZIO COMPANION</div>
                  <h2>
                    Your YAZIO,
                    <br />
                    at your desk.
                  </h2>
                  <p>
                    Bring your food diary to the big screen. Sign in on YAZIO
                    with Apple, then pick up right here.
                  </p>
                  <button
                    className="primary full"
                    onClick={connect}
                    disabled={booting || pairing}
                  >
                    {pairing ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Link2 size={17} />
                    )}
                    {pairing
                      ? "Finish signing in on YAZIO"
                      : "Connect your account"}
                    {pairing ? null : <ArrowRight size={16} />}
                  </button>
                  <div className="card-footnote">
                    <ShieldCheck size={13} />
                    Your Apple password stays with Apple.
                  </div>
                </section>
              )}
              <section className="card water-card">
                <div className="card-heading">
                  <h2>
                    <Droplets size={19} />
                    Stay hydrated
                  </h2>
                </div>
                <div className="water-value">
                  {waterLabel}
                  <span>{waterGoalLabel}</span>
                </div>
                <div className="water-glasses" aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => (
                    <span
                      key={index}
                      className={
                        water !== undefined && water >= (index + 1) * 250
                          ? "filled"
                          : ""
                      }
                    >
                      <i />
                    </span>
                  ))}
                </div>
                <button
                  className="secondary full"
                  disabled={!day || busy || loading}
                  onClick={addWater}
                >
                  <Plus size={16} />
                  250 ml
                </button>
              </section>
              <div className="quiet-note">
                <Leaf size={17} />
                <p>
                  Small steps.
                  <br />
                  <strong>A little better, every day.</strong>
                </p>
              </div>
            </aside>
          </div>
          <footer>
            <span>Made for your everyday.</span>
            <span>
              Independent YAZIO companion <i /> Private API integration
            </span>
          </footer>
        </div>
      </main>

      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {setup && (
        <div className="overlay" onClick={() => setSetup(false)}>
          <section
            className="dialog setup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setSetup(false)}
              aria-label="Close connection settings"
            >
              <X size={20} />
            </button>
            <span className="dialog-icon">
              <Link2 size={25} />
            </span>
            <div className="eyebrow">YOUR CONNECTION</div>
            <h2 id="setup-title">
              A familiar sign-in.
              <br />A roomier diary.
            </h2>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            {session.connected ? (
              <>
                <p>
                  You’re connected as {session.profile?.first_name}. Your
                  session is encrypted and tied to your private account.
                  Disconnecting removes it from this browser.
                </p>
                <button className="secondary full" onClick={disconnect}>
                  <LogOut size={17} />
                  Disconnect YAZIO
                </button>
              </>
            ) : (
              <>
                <p>
                  A small Chrome / Edge helper connects your YAZIO session to
                  this private desk. You sign in on YAZIO’s own website.
                </p>
                <ol className="steps">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>Install the browser helper</strong>
                      <p>
                        <a href="/nutrition-desk-helper.zip" download>
                          Download the helper <ArrowDownToLine size={13} />
                        </a>
                        , then unzip it. Open <code>chrome://extensions</code>{" "}
                        (or <code>edge://extensions</code>), enable Developer
                        mode, and choose “Load unpacked”. Select the unzipped
                        folder.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Open this desk in that browser</strong>
                      <p>
                        Reload this page after installing. The helper works in
                        Chrome and Edge.
                      </p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Connect and sign in with Apple</strong>
                      <p>
                        YAZIO opens in a new tab. Finish your usual Apple
                        sign-in there; your diary will connect here
                        automatically. If YAZIO is already signed in, log out on
                        that page, then sign in again.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className={`helper-status ${helper ? "ready" : ""}`}>
                  <span />
                  {helper
                    ? "Browser helper is ready"
                    : "Waiting for browser helper"}
                </div>
                <button
                  className="primary full"
                  onClick={connect}
                  disabled={!helper || pairing}
                >
                  {pairing ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Link2 size={17} />
                  )}
                  {pairing
                    ? "Waiting for Apple sign-in…"
                    : "Connect with YAZIO"}
                </button>
                <p className="privacy-copy">
                  The helper only passes a session after you click Connect. It
                  never reads your Apple password or sends anything to
                  analytics.
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {searchOpen && (
        <div className="overlay" onClick={() => setSearchOpen(false)}>
          <section
            className="dialog food-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setSearchOpen(false)}
              aria-label="Close food search"
            >
              <X size={20} />
            </button>
            <div className="eyebrow">A LITTLE SOMETHING GOOD</div>
            <h2 id="food-title">
              {selected ? "Make it your portion." : "What’s on the menu?"}
            </h2>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="meal-tabs">
              {meals.map((item) => (
                <button
                  key={item.id}
                  className={meal === item.id ? "chosen" : ""}
                  onClick={() => setMeal(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {selected ? (
              <form onSubmit={addFood}>
                <button
                  className="text-button back"
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft size={15} />
                  Back to search
                </button>
                <div className="selected-product">
                  <span className="food-symbol">
                    <Utensils size={23} />
                  </span>
                  <div>
                    <h3>{selected.product.name}</h3>
                    <p>{selected.product.producer}</p>
                  </div>
                </div>
                <label className="amount-label" htmlFor="food-amount">
                  Amount ({selected.product.base_unit})
                </label>
                <input
                  autoFocus
                  className="amount-input"
                  id="food-amount"
                  type="number"
                  min="0.01"
                  max="100000"
                  step="any"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <div className="portion-nutrients">
                  {[
                    { label: unit, key: "energy.energy" },
                    { label: "g carbs", key: "nutrient.carb" },
                    { label: "g protein", key: "nutrient.protein" },
                    { label: "g fat", key: "nutrient.fat" },
                  ].map((nutrient) => {
                    const perUnit =
                      selected.product.nutrients[nutrient.key] ?? 0;
                    const quantity = Number(amount);
                    const value = number(perUnit * quantity);
                    return (
                      <div key={nutrient.key}>
                        <strong>{value}</strong>
                        <span>{nutrient.label}</span>
                      </div>
                    );
                  })}
                </div>
                <button className="primary full" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Plus size={17} />
                  )}
                  Add to diary
                </button>
              </form>
            ) : (
              <>
                <label className="search-field">
                  <Search size={20} />
                  <input
                    autoFocus
                    placeholder="Search food, brand, or barcode"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search food"
                  />
                  {searching && <LoaderCircle className="spin" size={17} />}
                </label>
                <div className="search-results">
                  {query.trim().length === 0 && (
                    <>
                      <div className="recents-heading">
                        <h3>
                          <Clock3 size={17} />
                          Recent foods
                        </h3>
                        <span>From all meals</span>
                      </div>
                      {loadingRecents ? (
                        <div className="search-empty">
                          <LoaderCircle className="spin" size={26} />
                          <h3>Loading your recents…</h3>
                          <p>Getting your latest foods from YAZIO.</p>
                        </div>
                      ) : recentError ? (
                        <div className="recent-error" role="alert">
                          <p>{recentError}</p>
                          <button
                            className="text-button"
                            onClick={() =>
                              setRecentRevision((value) => value + 1)
                            }
                          >
                            Try again
                          </button>
                        </div>
                      ) : recents.length > 0 ? (
                        recents.map((recent) => {
                          const energyPerUnit =
                            recent.product.nutrients["energy.energy"] ?? 0;
                          const energy = number(energyPerUnit * recent.amount);
                          return (
                            <button
                              className="search-result recent-result"
                              key={recent.product_id}
                              onClick={() => selectRecent(recent)}
                              disabled={busy}
                            >
                              <span className="food-symbol">
                                <Clock3 size={19} />
                              </span>
                              <span>
                                <strong>{recent.product.name}</strong>
                                <small>
                                  {recent.amount} {recent.product.base_unit}
                                  {recent.product.producer
                                    ? ` · ${recent.product.producer}`
                                    : ""}
                                </small>
                              </span>
                              <span className="recent-energy">
                                {energy}
                                <small>kcal</small>
                              </span>
                              <ChevronRight size={17} />
                            </button>
                          );
                        })
                      ) : (
                        <div className="search-empty">
                          <Clock3 size={30} />
                          <h3>A fresh start</h3>
                          <p>Foods you log in YAZIO will appear here.</p>
                        </div>
                      )}
                    </>
                  )}
                  {results.map((result) => (
                    <button
                      className="search-result"
                      key={result.product_id}
                      onClick={() => selectProduct(result)}
                      disabled={busy}
                    >
                      <span className="food-symbol">
                        <Utensils size={20} />
                      </span>
                      <span>
                        <strong>
                          {result.name}
                          {result.is_verified && <CheckCircle2 size={13} />}
                        </strong>
                        <small>{result.producer || "Food database"}</small>
                      </span>
                      <Plus size={17} />
                    </button>
                  ))}
                  {query.trim().length > 0 && results.length === 0 && (
                    <div className="search-empty">
                      <Search size={30} />
                      <h3>
                        {searching
                          ? "Finding your food…"
                          : query.length >= 2
                            ? "No foods found"
                            : "Keep typing…"}
                      </h3>
                      <p>
                        {query.length >= 2
                          ? "Try another name or brand."
                          : "Enter at least two characters to search YAZIO."}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {removing && (
        <div className="overlay">
          <section
            className="dialog small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
          >
            <h2 id="remove-title">Remove this entry?</h2>
            <p>
              “{removing.name}” will be removed from your YAZIO diary for this
              day.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary"
                onClick={() => setRemoving(null)}
                disabled={busy}
              >
                Keep entry
              </button>
              <button className="danger" onClick={removeFood} disabled={busy}>
                {busy ? "Removing…" : "Remove entry"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function localISO(value: Date) {
  const year = value.getFullYear();
  const monthNumber = value.getMonth() + 1;
  const dayNumber = value.getDate();
  const month = String(monthNumber);
  const day = String(dayNumber);
  const paddedMonth = month.padStart(2, "0");
  const paddedDay = day.padStart(2, "0");
  return `${year}-${paddedMonth}-${paddedDay}`;
}
