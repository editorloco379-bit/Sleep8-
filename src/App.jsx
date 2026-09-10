import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Home, CalendarDays, Moon, BarChart3, Settings as SettingsIcon,
  Sunrise, BedDouble, Bell, BellOff, Plus, Trash2, Check, X,
  ChevronLeft, ChevronRight, Sparkles, Clock, Sun,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Time helpers — everything is stored/computed in minutes-since-midnight  */
/* ---------------------------------------------------------------------- */

const DOW_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DOW_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function formatTime(mins, format24) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (format24) return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const period = h >= 12 ? "p.m." : "a.m.";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${period}`;
}
function durationBetween(bedMin, wakeMin) {
  let d = wakeMin - bedMin;
  if (d <= 0) d += 1440;
  return d;
}
function wakeFromBed(bedMin, hours) {
  return Math.round((bedMin + hours * 60) % 1440);
}
function bedFromWake(wakeMin, hours) {
  return Math.round(((wakeMin - hours * 60) % 1440 + 1440) % 1440);
}
function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/* ---------------------------------------------------------------------- */
/* Default state                                                          */
/* ---------------------------------------------------------------------- */

function defaultDaySchedule(bed = "23:00", wake = "07:00") {
  return { bed, wake };
}

function buildDefaultState() {
  const schedule = {};
  for (let i = 0; i < 7; i++) schedule[i] = defaultDaySchedule();
  return {
    onboardingDone: false,
    settings: {
      targetHours: 8,
      timeFormat24: false,
      firstDayMonday: true,
      theme: "dark",
      remindersEnabled: true,
      prepMinutesBefore: 30,
    },
    weeklySchedule: schedule,
    routine: [
      { id: "r1", time: "22:00", label: "Dejar de usar pantallas", done: false },
      { id: "r2", time: "22:15", label: "Prepararse para dormir", done: false },
      { id: "r3", time: "22:30", label: "Higiene personal", done: false },
      { id: "r4", time: "22:45", label: "Relajarse", done: false },
      { id: "r5", time: "23:00", label: "Dormir", done: false },
    ],
    routineResetDate: dateKey(new Date()),
    logs: {}, // dateKey -> { plannedBed, plannedWake, actualBed, actualWake, duration }
  };
}

const STORAGE_KEY = "sleep8-state-v1";

/* Almacenamiento local del navegador (persiste entre visitas en este dispositivo) */
const storage = {
  async get(key) {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : { key, value: raw };
  },
  async set(key, value) {
    window.localStorage.setItem(key, value);
    return { key, value };
  },
};

/* ---------------------------------------------------------------------- */
/* Root component                                                         */
/* ---------------------------------------------------------------------- */

export default function Sleep8() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("home");
  const [now, setNow] = useState(new Date());
  const saveTimer = useRef(null);

  // Load persisted state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (!cancelled) {
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            setState({ ...buildDefaultState(), ...parsed });
          } else {
            setState(buildDefaultState());
          }
        }
      } catch (e) {
        if (!cancelled) setState(buildDefaultState());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on change (debounced)
  useEffect(() => {
    if (!state || !loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        /* best-effort persistence */
      }
    }, 250);
    return () => clearTimeout(saveTimer.current);
  }, [state, loaded]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reset routine checkmarks once per day
  useEffect(() => {
    if (!state) return;
    const today = dateKey(now);
    if (state.routineResetDate !== today) {
      setState((s) => ({
        ...s,
        routineResetDate: today,
        routine: s.routine.map((r) => ({ ...r, done: false })),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.routineResetDate, now.getDate()]);

  const update = useCallback((fn) => setState((s) => fn(s)), []);

  if (!loaded || !state) {
    return (
      <div style={{ ...rootVars("dark"), minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--text-muted)", fontFamily: "Inter, sans-serif" }}>
        Cargando Sleep8…
      </div>
    );
  }

  if (!state.onboardingDone) {
    return (
      <ThemeWrap theme={state.settings.theme}>
        <Onboarding state={state} update={update} onFinish={() => update((s) => ({ ...s, onboardingDone: true }))} />
      </ThemeWrap>
    );
  }

  return (
    <ThemeWrap theme={state.settings.theme}>
      <Shell view={view} setView={setView}>
        {view === "home" && <HomeView state={state} update={update} now={now} />}
        {view === "calendar" && <CalendarView state={state} update={update} now={now} />}
        {view === "schedule" && <ScheduleView state={state} update={update} />}
        {view === "progress" && <ProgressView state={state} now={now} />}
        {view === "settings" && <SettingsView state={state} update={update} />}
      </Shell>
    </ThemeWrap>
  );
}

/* ---------------------------------------------------------------------- */
/* Theme + global styles                                                  */
/* ---------------------------------------------------------------------- */

function rootVars(theme) {
  const dark = {
    "--bg": "#0a0e1a",
    "--bg-soft": "#0d1224",
    "--card": "#12182c",
    "--card-2": "#171f3a",
    "--border": "rgba(255,255,255,0.08)",
    "--text": "#f2f4fc",
    "--text-muted": "#8991ae",
    "--text-faint": "#5c6484",
    "--accent": "#7c8cff",
    "--accent-2": "#c9a6ff",
    "--gold": "#f4d58d",
    "--success": "#6fcf97",
    "--warn": "#f2c94c",
    "--danger": "#e88b8b",
    "--neutral-dot": "#333c63",
    "--shadow": "0 20px 50px -25px rgba(0,0,0,0.6)",
  };
  const light = {
    "--bg": "#f4f5fb",
    "--bg-soft": "#eceefa",
    "--card": "#ffffff",
    "--card-2": "#f0f1fa",
    "--border": "rgba(20,20,40,0.08)",
    "--text": "#161a2e",
    "--text-muted": "#5c6284",
    "--text-faint": "#9095b3",
    "--accent": "#5b63d3",
    "--accent-2": "#8f5bd6",
    "--gold": "#c99a35",
    "--success": "#2f9e63",
    "--warn": "#b8860b",
    "--danger": "#c85c5c",
    "--neutral-dot": "#d8dbee",
    "--shadow": "0 20px 45px -30px rgba(30,30,60,0.25)",
  };
  return theme === "light" ? light : dark;
}

function ThemeWrap({ theme, children }) {
  const vars = rootVars(theme);
  return (
    <div style={{ ...vars, minHeight: "100%", background: "var(--bg)", fontFamily: "'Inter', sans-serif", color: "var(--text)", position: "relative" }}>
      <GlobalStyle />
      {children}
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
      .s8 * { box-sizing: border-box; }
      .s8-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
      .s8-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
      .s8-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
      .s8-btn { cursor: pointer; border: none; font-family: inherit; transition: transform .15s ease, opacity .15s ease, background .15s ease; }
      .s8-btn:active { transform: scale(0.97); }
      .s8-fade-in { animation: s8fade .35s ease both; }
      @keyframes s8fade { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }
      .s8-input { background: var(--card-2); border: 1px solid var(--border); color: var(--text); border-radius: 12px; padding: 10px 12px; font-family: inherit; font-size: 14px; }
      .s8-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
      .s8-navitem { display: flex; align-items: center; gap: 12px; cursor: pointer; border-radius: 12px; padding: 10px 14px; color: var(--text-muted); transition: background .15s, color .15s; }
      .s8-navitem.active { background: var(--card-2); color: var(--text); }
      .s8-navitem:hover { color: var(--text); }
      @media (prefers-reduced-motion: reduce) {
        .s8-fade-in, .s8-btn { animation: none !important; transition: none !important; }
      }
    `}</style>
  );
}

/* ---------------------------------------------------------------------- */
/* App shell: sidebar (desktop) + bottom nav (mobile)                     */
/* ---------------------------------------------------------------------- */

const NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "schedule", label: "Mi horario", icon: Moon },
  { id: "progress", label: "Progreso", icon: BarChart3 },
  { id: "settings", label: "Configuración", icon: SettingsIcon },
];

function Shell({ view, setView, children }) {
  return (
    <div className="s8" style={{ display: "flex", minHeight: 560, maxWidth: 1100, margin: "0 auto" }}>
      {/* Desktop sidebar */}
      <div className="s8-sidebar" style={{
        width: 220, flexShrink: 0, borderRight: "1px solid var(--border)",
        padding: "24px 14px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 26px" }}>
          <MoonLogo size={22} />
          <span className="s8-display" style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0.2 }}>Sleep8</span>
        </div>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} className={`s8-navitem${view === item.id ? " active" : ""}`} onClick={() => setView(item.id)}>
            <item.icon size={18} strokeWidth={1.8} />
            <span style={{ fontSize: 14.5 }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "10px", fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
          Sleep8 te ayuda a organizar tu descanso. No sustituye consejo médico.
        </div>
      </div>

      {/* Main content */}
      <div className="s8-scroll" style={{ flex: 1, minWidth: 0, padding: "28px 22px 100px", overflowY: "auto" }}>
        {children}
      </div>

      {/* Mobile bottom nav */}
      <div className="s8-bottomnav" style={{
        display: "none", position: "fixed", left: 0, right: 0, bottom: 0,
        background: "var(--card)", borderTop: "1px solid var(--border)",
        padding: "8px 6px calc(env(safe-area-inset-bottom, 0px) + 6px)",
        justifyContent: "space-around", zIndex: 40,
      }}>
        {NAV_ITEMS.map((item) => (
          <div key={item.id} onClick={() => setView(item.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: view === item.id ? "var(--accent)" : "var(--text-faint)", padding: "4px 8px", cursor: "pointer", minWidth: 54,
          }}>
            <item.icon size={20} strokeWidth={1.9} />
            <span style={{ fontSize: 10.5 }}>{item.label}</span>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 780px) {
          .s8-sidebar { display: none; }
          .s8-bottomnav { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

function MoonLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M28 6C20 8 15 15 15 22c0 9 7 15 15 15 3 0 6-.8 8.5-2.2C34 38 27 40 20 40 9 40 0 31 0 20S9 0 20 0c2.9 0 5.6.6 8 1.7C26 3 27 4.4 28 6Z" fill="var(--accent)" opacity="0.9" />
      <text x="19" y="26" fontFamily="Fraunces, serif" fontSize="15" fontWeight="600" fill="var(--bg)" textAnchor="middle">8</text>
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Onboarding wizard                                                       */
/* ---------------------------------------------------------------------- */

function Onboarding({ state, update, onFinish }) {
  const [step, setStep] = useState(0);
  const [wake, setWake] = useState("07:00");
  const [hours, setHours] = useState(8);
  const [reminders, setReminders] = useState(true);
  const [wantRoutine, setWantRoutine] = useState(true);

  const bedMin = bedFromWake(timeToMinutes(wake), hours);

  function finish() {
    update((s) => {
      const schedule = {};
      for (let i = 0; i < 7; i++) schedule[i] = { bed: minutesToHHMM(bedMin), wake };
      return {
        ...s,
        weeklySchedule: schedule,
        settings: { ...s.settings, targetHours: hours, remindersEnabled: reminders },
        routine: wantRoutine ? s.routine : [],
      };
    });
    onFinish();
  }

  const steps = [
    {
      title: "Organiza tus noches",
      body: "Configura tu hora de despertar y calcularemos un horario de sueño de aproximadamente 8 horas para ti.",
      content: (
        <button className="s8-btn" onClick={() => setStep(1)} style={primaryBtnStyle}>
          Configurar mi horario
        </button>
      ),
    },
    {
      title: "¿A qué hora necesitas despertarte?",
      content: (
        <>
          <input type="time" className="s8-input" value={wake} onChange={(e) => setWake(e.target.value)} style={{ fontSize: 22, padding: "14px 16px", width: 180 }} />
          <button className="s8-btn" onClick={() => setStep(2)} style={{ ...primaryBtnStyle, marginTop: 22 }}>Continuar</button>
        </>
      ),
    },
    {
      title: "¿Quieres dormir aproximadamente 8 horas?",
      content: (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            {[7, 7.5, 8, 8.5, 9].map((h) => (
              <button key={h} className="s8-btn" onClick={() => setHours(h)} style={{
                padding: "10px 14px", borderRadius: 12, border: "1px solid var(--border)",
                background: hours === h ? "var(--accent)" : "var(--card-2)",
                color: hours === h ? "#fff" : "var(--text)",
              }}>{h} h</button>
            ))}
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 18 }}>
            Para dormir {hours} horas, intenta acostarte alrededor de las {formatTime(bedMin, state.settings.timeFormat24)}.
          </div>
          <button className="s8-btn" onClick={() => setStep(3)} style={primaryBtnStyle}>Continuar</button>
        </>
      ),
    },
    {
      title: "¿Quieres recibir un recordatorio antes de dormir?",
      content: (
        <>
          <ToggleRow label="Recordarme antes de dormir" checked={reminders} onChange={setReminders} />
          <button className="s8-btn" onClick={() => setStep(4)} style={{ ...primaryBtnStyle, marginTop: 22 }}>Continuar</button>
        </>
      ),
    },
    {
      title: "¿Quieres crear una rutina nocturna?",
      content: (
        <>
          <ToggleRow label="Crear una rutina nocturna sugerida" checked={wantRoutine} onChange={setWantRoutine} />
          <button className="s8-btn" onClick={() => setStep(5)} style={{ ...primaryBtnStyle, marginTop: 22 }}>Continuar</button>
        </>
      ),
    },
    {
      title: "Tu horario está listo.",
      content: (
        <>
          <div style={{ ...bigResultCard, marginBottom: 22 }}>
            <ResultRow label="Dormir" value={formatTime(bedMin, state.settings.timeFormat24)} />
            <ResultRow label="Despertar" value={formatTime(timeToMinutes(wake), state.settings.timeFormat24)} />
            <ResultRow label="Objetivo" value={`${hours} horas`} />
          </div>
          <button className="s8-btn" onClick={finish} style={primaryBtnStyle}>Comenzar</button>
        </>
      ),
    },
  ];

  const s = steps[step];

  return (
    <div className="s8 s8-fade-in" style={{
      minHeight: 520, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", textAlign: "center", padding: "40px 24px",
    }}>
      <MoonLogo size={40} />
      <h1 className="s8-display" style={{ fontSize: 26, margin: "18px 0 10px", maxWidth: 420, lineHeight: 1.25 }}>{s.title}</h1>
      {s.body && <p style={{ color: "var(--text-muted)", maxWidth: 380, marginBottom: 26, fontSize: 15, lineHeight: 1.6 }}>{s.body}</p>}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>{s.content}</div>
      {step > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 30 }}>
          {steps.slice(1).map((_, i) => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: 4, background: i + 1 <= step ? "var(--accent)" : "var(--neutral-dot)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{label}</span>
      <span className="s8-display" style={{ fontSize: 17, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const primaryBtnStyle = {
  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
  color: "#fff", padding: "13px 28px", borderRadius: 14, fontSize: 15, fontWeight: 600,
  boxShadow: "0 12px 30px -12px rgba(124,140,255,0.55)",
};

const bigResultCard = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20,
  padding: "18px 22px", width: 280, boxShadow: "var(--shadow)",
};

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="s8-btn" onClick={() => onChange(!checked)} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: "var(--card-2)", borderRadius: 14, border: "1px solid var(--border)", minWidth: 260,
    }}>
      <Toggle checked={checked} />
      <span style={{ fontSize: 14.5 }}>{label}</span>
    </div>
  );
}

function Toggle({ checked }) {
  return (
    <div style={{
      width: 38, height: 22, borderRadius: 20, flexShrink: 0,
      background: checked ? "var(--accent)" : "var(--neutral-dot)", position: "relative", transition: "background .2s",
    }}>
      <div style={{
        position: "absolute", top: 2, left: checked ? 18 : 2, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left .2s",
      }} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Shared: today's schedule getter                                        */
/* ---------------------------------------------------------------------- */

function useTodaySchedule(state, forDate) {
  const dow = forDate.getDay();
  const sched = state.weeklySchedule[dow] || defaultDaySchedule();
  return { bed: timeToMinutes(sched.bed), wake: timeToMinutes(sched.wake), bedStr: sched.bed, wakeStr: sched.wake };
}

/* ---------------------------------------------------------------------- */
/* Home / "Hoy" view                                                      */
/* ---------------------------------------------------------------------- */

function HomeView({ state, update, now }) {
  const { settings } = state;
  const today = useTodaySchedule(state, now);
  const duration = durationBetween(today.bed, today.wake);
  const targetMin = settings.targetHours * 60;
  const onTarget = Math.abs(duration - targetMin) <= 15;

  const prepMin = ((today.bed - settings.prepMinutesBefore) % 1440 + 1440) % 1440;

  // countdown to next bedtime occurrence
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    function tick() {
      const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
      let diff = today.bed - nowMin;
      if (diff <= 0) diff += 1440;
      const totalSec = Math.round(diff * 60);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const sec = totalSec % 60;
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [now, today.bed]);

  const nowMinExact = now.getHours() * 60 + now.getMinutes();
  const isBedtimeNow = nowMinExact === today.bed;
  const isPrepNow = settings.remindersEnabled && nowMinExact === prepMin;

  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 12 ? "Buenos días ☀️" : hour >= 12 && hour < 19 ? "Buenas tardes" : "Buenas noches 🌙";

  const todayKey = dateKey(now);
  const log = state.logs[todayKey];
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="s8-fade-in" style={{ maxWidth: 620 }}>
      <div style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 4 }}>{DOW_LABELS[now.getDay()]}, {now.getDate()} de {MONTH_LABELS[now.getMonth()]}</div>
      <h1 className="s8-display" style={{ fontSize: 27, margin: "0 0 22px" }}>{greeting}</h1>

      {(isPrepNow || isBedtimeNow) && (
        <div style={{
          background: "var(--card-2)", border: "1px solid var(--accent)", borderRadius: 16,
          padding: "14px 18px", marginBottom: 18, fontSize: 14.5, display: "flex", alignItems: "center", gap: 10,
        }}>
          <Sparkles size={18} color="var(--accent)" />
          {isBedtimeNow ? "Es hora de comenzar tu descanso 🌙" : "Tu hora de dormir se acerca."}
        </div>
      )}

      {/* Hero card */}
      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 26, padding: "26px 24px",
        background: "linear-gradient(160deg, var(--card) 0%, var(--card-2) 100%)",
        border: "1px solid var(--border)", boxShadow: "var(--shadow)", marginBottom: 20,
      }}>
        <NightSky />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: 0.3 }}>Objetivo de hoy</div>
            <StatusPill onTarget={onTarget} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <TimeBlock icon={BedDouble} label="Dormir" value={formatTime(today.bed, settings.timeFormat24)} />
            <div style={{ color: "var(--text-faint)", fontSize: 20 }}>→</div>
            <TimeBlock icon={Sunrise} label="Despertar" value={formatTime(today.wake, settings.timeFormat24)} />
          </div>
          <div style={{ marginTop: 18, display: "flex", gap: 22, flexWrap: "wrap" }}>
            <SmallStat label="Duración" value={formatDuration(duration)} />
            <SmallStat label="Faltan para dormir" value={countdown} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <InfoCard icon={Clock} title="Preparación para dormir" value={formatTime(prepMin, settings.timeFormat24)} />
        <InfoCard icon={Moon} title="Hora de dormir" value={formatTime(today.bed, settings.timeFormat24)} />
      </div>

      {/* Register sleep */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: log ? 12 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Registro de sueño</div>
          <button className="s8-btn" onClick={() => setShowLog((v) => !v)} style={{
            background: "var(--card-2)", color: "var(--text)", padding: "8px 14px", borderRadius: 10, fontSize: 13.5, border: "1px solid var(--border)",
          }}>{log ? "Editar" : "Registrar sueño"}</button>
        </div>
        {log && !showLog && (
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>Real: {formatTime(timeToMinutes(log.actualBed), settings.timeFormat24)} → {formatTime(timeToMinutes(log.actualWake), settings.timeFormat24)}</span>
            <span>Duración: {formatDuration(log.duration)}</span>
          </div>
        )}
        {showLog && (
          <LogForm
            defaultBed={log?.actualBed || today.bedStr}
            defaultWake={log?.actualWake || today.wakeStr}
            onCancel={() => setShowLog(false)}
            onSave={(actualBed, actualWake) => {
              const dur = durationBetween(timeToMinutes(actualBed), timeToMinutes(actualWake));
              update((s) => ({
                ...s,
                logs: {
                  ...s.logs,
                  [todayKey]: { plannedBed: today.bedStr, plannedWake: today.wakeStr, actualBed, actualWake, duration: dur },
                },
              }));
              setShowLog(false);
            }}
          />
        )}
      </div>

      <NightRoutineCard state={state} update={update} />
    </div>
  );
}

function NightSky() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 160" style={{ position: "absolute", inset: 0, opacity: 0.5 }} preserveAspectRatio="xMidYMid slice">
      <circle cx="350" cy="26" r="3" fill="var(--gold)" opacity="0.5" />
      <circle cx="310" cy="55" r="1.6" fill="var(--gold)" opacity="0.4" />
      <circle cx="370" cy="70" r="2" fill="var(--gold)" opacity="0.35" />
      <circle cx="30" cy="20" r="1.8" fill="var(--accent-2)" opacity="0.4" />
      <circle cx="70" cy="45" r="1.2" fill="var(--accent-2)" opacity="0.3" />
      <path d="M330 20a20 20 0 1 0 14 34 15 15 0 0 1-14-34Z" fill="var(--gold)" opacity="0.55" />
    </svg>
  );
}

function StatusPill({ onTarget }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, fontSize: 12.5,
      background: onTarget ? "rgba(111,207,151,0.14)" : "rgba(242,201,76,0.14)",
      color: onTarget ? "var(--success)" : "var(--warn)",
      padding: "5px 11px", borderRadius: 100, border: `1px solid ${onTarget ? "var(--success)" : "var(--warn)"}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 4, background: onTarget ? "var(--success)" : "var(--warn)" }} />
      {onTarget ? "Horario recomendado" : "Fuera del objetivo"}
    </div>
  );
}

function TimeBlock({ icon: Icon, label, value }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 12.5, marginBottom: 4 }}>
        <Icon size={14} /> {label}
      </div>
      <div className="s8-display" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function SmallStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, value }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-muted)", fontSize: 12.5, marginBottom: 6 }}>
        <Icon size={14} /> {title}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function LogForm({ defaultBed, defaultWake, onSave, onCancel }) {
  const [bed, setBed] = useState(defaultBed);
  const [wake, setWake] = useState(defaultWake);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-muted)" }}>
          Hora en que te dormiste
          <input type="time" className="s8-input" value={bed} onChange={(e) => setBed(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-muted)" }}>
          Hora en que despertaste
          <input type="time" className="s8-input" value={wake} onChange={(e) => setWake(e.target.value)} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="s8-btn" onClick={() => onSave(bed, wake)} style={{ background: "var(--accent)", color: "#fff", padding: "9px 16px", borderRadius: 10, fontSize: 13.5 }}>Guardar</button>
        <button className="s8-btn" onClick={onCancel} style={{ background: "var(--card-2)", color: "var(--text-muted)", padding: "9px 16px", borderRadius: 10, fontSize: 13.5, border: "1px solid var(--border)" }}>Cancelar</button>
      </div>
    </div>
  );
}

function NightRoutineCard({ state, update }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTime, setNewTime] = useState("22:00");

  function toggleDone(id) {
    update((s) => ({ ...s, routine: s.routine.map((r) => (r.id === id ? { ...r, done: !r.done } : r)) }));
  }
  function removeItem(id) {
    update((s) => ({ ...s, routine: s.routine.filter((r) => r.id !== id) }));
  }
  function addItem() {
    if (!newLabel.trim()) return;
    update((s) => ({ ...s, routine: [...s.routine, { id: `r${Date.now()}`, time: newTime, label: newLabel.trim(), done: false }].sort((a,b)=>a.time.localeCompare(b.time)) }));
    setNewLabel(""); setAdding(false);
  }

  const sorted = [...state.routine].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Rutina nocturna</div>
        <button className="s8-btn" onClick={() => setAdding((v) => !v)} style={{ background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
          <Plus size={14} /> Agregar
        </button>
      </div>
      {sorted.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: 13.5 }}>Aún no hay actividades en tu rutina.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="s8-btn" onClick={() => toggleDone(item.id)} style={{
              width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${item.done ? "var(--success)" : "var(--border)"}`,
              background: item.done ? "var(--success)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {item.done && <Check size={13} color="#08130c" />}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-faint)", width: 48, fontVariantNumeric: "tabular-nums" }}>{item.time}</div>
            <div style={{ fontSize: 14, flex: 1, textDecoration: item.done ? "line-through" : "none", color: item.done ? "var(--text-faint)" : "var(--text)" }}>{item.label}</div>
            <div className="s8-btn" onClick={() => removeItem(item.id)} style={{ color: "var(--text-faint)", padding: 4 }}><Trash2 size={14} /></div>
          </div>
        ))}
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input type="time" className="s8-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          <input className="s8-input" placeholder="Actividad" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          <button className="s8-btn" onClick={addItem} style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 13 }}>Añadir</button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Calendar view                                                          */
/* ---------------------------------------------------------------------- */

function CalendarView({ state, update, now }) {
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selected, setSelected] = useState(now);
  const { settings } = state;

  const firstDow = cursor.getDay(); // 0=Sunday
  const offset = settings.firstDayMonday ? (firstDow + 6) % 7 : firstDow;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weekLabels = settings.firstDayMonday ? [...DOW_SHORT.slice(1), DOW_SHORT[0]] : DOW_SHORT;

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));

  function statusFor(d) {
    if (!d) return null;
    const key = dateKey(d);
    const log = state.logs[key];
    if (!log) return d > now && !sameDate(d, now) ? null : (d <= now ? "none" : null);
    const target = settings.targetHours * 60;
    return Math.abs(log.duration - target) <= 30 ? "good" : "short";
  }

  const selKey = dateKey(selected);
  const selLog = state.logs[selKey];
  const selPlanned = useTodaySchedule(state, selected);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="s8-fade-in" style={{ maxWidth: 680 }}>
      <h1 className="s8-display" style={{ fontSize: 24, marginBottom: 20 }}>Calendario de sueño</h1>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 20, padding: "18px 18px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button className="s8-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} style={navBtnStyle}><ChevronLeft size={16} /></button>
          <div style={{ fontWeight: 600, fontSize: 15, textTransform: "capitalize" }}>{MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <button className="s8-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} style={navBtnStyle}><ChevronRight size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
          {weekLabels.map((l) => <div key={l} style={{ textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>{l}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            const status = statusFor(d);
            const isSel = d && sameDate(d, selected);
            const isToday = d && sameDate(d, now);
            return (
              <div key={i} className={d ? "s8-btn" : ""} onClick={() => d && setSelected(d)} style={{
                aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                borderRadius: 12, fontSize: 13, gap: 3, position: "relative",
                background: isSel ? "var(--accent)" : "transparent",
                color: !d ? "transparent" : isSel ? "#fff" : "var(--text)",
                border: isToday && !isSel ? "1px solid var(--accent)" : "1px solid transparent",
              }}>
                {d ? d.getDate() : "·"}
                {d && status && (
                  <span style={{
                    width: 5, height: 5, borderRadius: 4,
                    background: status === "good" ? "var(--success)" : status === "short" ? "var(--warn)" : "var(--neutral-dot)",
                  }} />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11.5, color: "var(--text-faint)" }}>
          <LegendDot color="var(--success)" label="Objetivo cumplido" />
          <LegendDot color="var(--warn)" label="Menos de lo planeado" />
          <LegendDot color="var(--neutral-dot)" label="Sin registro" />
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px" }}>
        <div style={{ fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 12.5, color: "var(--text-muted)" }}>
          {DOW_LABELS[selected.getDay()]} {selected.getDate()}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 4 }}>Planeado</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatTime(selPlanned.bed, settings.timeFormat24)} → {formatTime(selPlanned.wake, settings.timeFormat24)}</div>
          </div>
          {selLog && (
            <div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 4 }}>Real</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{formatTime(timeToMinutes(selLog.actualBed), settings.timeFormat24)} → {formatTime(timeToMinutes(selLog.actualWake), settings.timeFormat24)}</div>
            </div>
          )}
        </div>
        {selLog && (
          <div style={{ display: "flex", gap: 22, marginBottom: 14, fontSize: 13.5 }}>
            <span>Duración: <strong>{formatDuration(selLog.duration)}</strong></span>
            <span>Objetivo: <strong>{formatDuration(settings.targetHours * 60)}</strong></span>
            <span>Diferencia: <strong style={{ color: Math.abs(selLog.duration - settings.targetHours * 60) <= 30 ? "var(--success)" : "var(--warn)" }}>
              {selLog.duration - settings.targetHours * 60 >= 0 ? "+" : ""}{selLog.duration - settings.targetHours * 60} min
            </strong></span>
          </div>
        )}
        {!showForm && (
          <button className="s8-btn" onClick={() => setShowForm(true)} style={{ background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "var(--text)" }}>
            {selLog ? "Editar registro" : "Registrar este día"}
          </button>
        )}
        {showForm && (
          <LogForm
            defaultBed={selLog?.actualBed || selPlanned.bedStr}
            defaultWake={selLog?.actualWake || selPlanned.wakeStr}
            onCancel={() => setShowForm(false)}
            onSave={(bed, wake) => {
              const dur = durationBetween(timeToMinutes(bed), timeToMinutes(wake));
              update((s) => ({ ...s, logs: { ...s.logs, [selKey]: { plannedBed: selPlanned.bedStr, plannedWake: selPlanned.wakeStr, actualBed: bed, actualWake: wake, duration: dur } } }));
              setShowForm(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />{label}</div>;
}

const navBtnStyle = { background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 10, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text)" };

/* ---------------------------------------------------------------------- */
/* Schedule view: weekly planner + sleep calculator                       */
/* ---------------------------------------------------------------------- */

function ScheduleView({ state, update }) {
  const { settings, weeklySchedule } = state;
  const order = settings.firstDayMonday ? [1,2,3,4,5,6,0] : [0,1,2,3,4,5,6];

  function setDay(dow, field, value) {
    update((s) => {
      const day = { ...s.weeklySchedule[dow], [field]: value };
      // auto-recalculate the paired time to keep target duration
      if (field === "wake") {
        day.bed = minutesToHHMM(bedFromWake(timeToMinutes(value), s.settings.targetHours));
      } else if (field === "bed") {
        day.wake = minutesToHHMM(wakeFromBed(timeToMinutes(value), s.settings.targetHours));
      }
      return { ...s, weeklySchedule: { ...s.weeklySchedule, [dow]: day } };
    });
  }

  function applyToWeek(dow) {
    update((s) => {
      const template = s.weeklySchedule[dow];
      const schedule = {};
      for (let i = 0; i < 7; i++) schedule[i] = { ...template };
      return { ...s, weeklySchedule: schedule };
    });
  }

  return (
    <div className="s8-fade-in" style={{ maxWidth: 640 }}>
      <h1 className="s8-display" style={{ fontSize: 24, marginBottom: 6 }}>Mi horario</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 22 }}>
        Ajusta tu hora de dormir o despertar para cada día. Recomendamos mantener un descanso de aproximadamente {settings.targetHours} horas.
      </p>

      <SleepCalculator settings={settings} />

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px", marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Planificador semanal</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {order.map((dow) => {
            const day = weeklySchedule[dow];
            const dur = durationBetween(timeToMinutes(day.bed), timeToMinutes(day.wake));
            return (
              <div key={dow} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 84, fontSize: 13.5, fontWeight: 500 }}>{DOW_LABELS[dow]}</div>
                <input type="time" className="s8-input" value={day.bed} onChange={(e) => setDay(dow, "bed", e.target.value)} style={{ width: 108 }} />
                <span style={{ color: "var(--text-faint)" }}>→</span>
                <input type="time" className="s8-input" value={day.wake} onChange={(e) => setDay(dow, "wake", e.target.value)} style={{ width: 108 }} />
                <span style={{ fontSize: 12, color: "var(--text-faint)", minWidth: 64 }}>{formatDuration(dur)}</span>
                <button className="s8-btn" onClick={() => applyToWeek(dow)} style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--accent)", background: "transparent", padding: "4px 6px" }}>
                  Aplicar a toda la semana
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SleepCalculator({ settings }) {
  const [mode, setMode] = useState("wake"); // "wake" = quiero despertar a X ; "bed" = quiero dormir a X
  const [time, setTime] = useState("07:00");

  const result = useMemo(() => {
    const m = timeToMinutes(time);
    if (mode === "wake") {
      return { bed: bedFromWake(m, settings.targetHours), wake: m };
    }
    return { bed: m, wake: wakeFromBed(m, settings.targetHours) };
  }, [mode, time, settings.targetHours]);

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px" }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Calculador de sueño</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="s8-btn" onClick={() => setMode("wake")} style={pillBtn(mode === "wake")}>Quiero despertarme a…</button>
        <button className="s8-btn" onClick={() => setMode("bed")} style={pillBtn(mode === "bed")}>Quiero dormirme a…</button>
      </div>
      <input type="time" className="s8-input" value={time} onChange={(e) => setTime(e.target.value)} style={{ fontSize: 16, marginBottom: 16 }} />
      <div style={{
        display: "flex", gap: 20, alignItems: "center", background: "var(--card-2)", borderRadius: 14, padding: "14px 18px", flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Dormir</div>
          <div className="s8-display" style={{ fontSize: 20, fontWeight: 600 }}>{formatTime(result.bed, settings.timeFormat24)}</div>
        </div>
        <div style={{ color: "var(--text-faint)" }}>→</div>
        <div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Despertar</div>
          <div className="s8-display" style={{ fontSize: 20, fontWeight: 600 }}>{formatTime(result.wake, settings.timeFormat24)}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Duración</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{settings.targetHours} horas</div>
        </div>
      </div>
    </div>
  );
}

function pillBtn(active) {
  return {
    padding: "9px 14px", borderRadius: 10, fontSize: 13, border: "1px solid var(--border)",
    background: active ? "var(--accent)" : "var(--card-2)", color: active ? "#fff" : "var(--text-muted)",
  };
}

/* ---------------------------------------------------------------------- */
/* Progress view                                                          */
/* ---------------------------------------------------------------------- */

function ProgressView({ state, now }) {
  const { settings, logs } = state;
  const target = settings.targetHours * 60;

  const last7 = [];
  for (let i = 6; i >= 0; i--) last7.push(addDays(now, -i));

  const entries = last7.map((d) => ({ date: d, log: logs[dateKey(d)] || null }));
  const withLogs = entries.filter((e) => e.log);
  const avg = withLogs.length ? Math.round(withLogs.reduce((a, e) => a + e.log.duration, 0) / withLogs.length) : 0;
  const compliant = withLogs.filter((e) => Math.abs(e.log.duration - target) <= 30).length;
  const compliance = withLogs.length ? Math.round((compliant / withLogs.length) * 100) : 0;
  const best = withLogs.length ? withLogs.reduce((a, e) => (e.log.duration > a.log.duration ? e : a)) : null;
  const worst = withLogs.length ? withLogs.reduce((a, e) => (e.log.duration < a.log.duration ? e : a)) : null;

  let message;
  if (withLogs.length === 0) message = "Registra tus noches para ver tu progreso aquí.";
  else if (compliance >= 80) message = "Tu horario fue bastante constante esta semana.";
  else if (compliance >= 50) message = "Vas por buen camino, sigue ajustando tu rutina.";
  else message = "Cada noche registrada te acerca a tu meta de descanso.";

  const maxDur = Math.max(target, ...withLogs.map((e) => e.log.duration), 1);

  return (
    <div className="s8-fade-in" style={{ maxWidth: 640 }}>
      <h1 className="s8-display" style={{ fontSize: 24, marginBottom: 20 }}>Mi progreso</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Promedio" value={withLogs.length ? formatDuration(avg) : "—"} />
        <StatCard label="Objetivo" value={formatDuration(target)} />
        <StatCard label="Noches registradas" value={`${withLogs.length}/7`} />
        <StatCard label="Cumplimiento" value={`${compliance}%`} />
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>Últimos 7 días</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, position: "relative" }}>
          <div style={{
            position: "absolute", left: 0, right: 0, borderTop: "1px dashed var(--text-faint)",
            bottom: `${(target / maxDur) * 100}%`, opacity: 0.5,
          }} />
          {entries.map((e, i) => {
            const h = e.log ? (e.log.duration / maxDur) * 100 : 0;
            const good = e.log && Math.abs(e.log.duration - target) <= 30;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
                <div style={{
                  width: "60%", borderRadius: 6, minHeight: e.log ? 4 : 0,
                  height: `${h}%`, background: e.log ? (good ? "var(--success)" : "var(--warn)") : "var(--neutral-dot)",
                }} title={e.log ? formatDuration(e.log.duration) : "Sin registro"} />
                <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{DOW_SHORT[e.date.getDay()]}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px" }}>
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>Resumen de tu semana</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14, fontSize: 13.5 }}>
          <SummaryRow label="Mejor noche" value={best ? formatDuration(best.log.duration) : "—"} />
          <SummaryRow label="Menor duración" value={worst ? formatDuration(worst.log.duration) : "—"} />
          <SummaryRow label="Días con horario cumplido" value={`${compliant} de ${withLogs.length || 7}`} />
          <SummaryRow label="Promedio" value={withLogs.length ? formatDuration(avg) : "—"} />
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", fontStyle: "italic" }}>{message}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 6 }}>{label}</div>
      <div className="s8-display" style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Settings view                                                          */
/* ---------------------------------------------------------------------- */

function SettingsView({ state, update }) {
  const { settings } = state;

  function set(field, value) {
    update((s) => ({ ...s, settings: { ...s.settings, [field]: value } }));
  }

  return (
    <div className="s8-fade-in" style={{ maxWidth: 560 }}>
      <h1 className="s8-display" style={{ fontSize: 24, marginBottom: 20 }}>Configuración</h1>

      <SettingsSection title="Objetivo de sueño">
        <RowLabel label="Horas objetivo">
          <div style={{ display: "flex", gap: 6 }}>
            {[6,6.5,7,7.5,8,8.5,9,9.5].map((h) => (
              <button key={h} className="s8-btn" onClick={() => set("targetHours", h)} style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 12.5, border: "1px solid var(--border)",
                background: settings.targetHours === h ? "var(--accent)" : "var(--card-2)",
                color: settings.targetHours === h ? "#fff" : "var(--text-muted)",
              }}>{h}</button>
            ))}
          </div>
        </RowLabel>
      </SettingsSection>

      <SettingsSection title="Recordatorios">
        <RowLabel label="Activar recordatorios">
          <div className="s8-btn" onClick={() => set("remindersEnabled", !settings.remindersEnabled)}><Toggle checked={settings.remindersEnabled} /></div>
        </RowLabel>
        <RowLabel label="Minutos antes de dormir para prepararte">
          <input type="number" min={5} max={90} step={5} className="s8-input" style={{ width: 80 }}
            value={settings.prepMinutesBefore} onChange={(e) => set("prepMinutesBefore", Math.max(0, Number(e.target.value)))} />
        </RowLabel>
      </SettingsSection>

      <SettingsSection title="Preferencias">
        <RowLabel label="Formato de hora 24h">
          <div className="s8-btn" onClick={() => set("timeFormat24", !settings.timeFormat24)}><Toggle checked={settings.timeFormat24} /></div>
        </RowLabel>
        <RowLabel label="La semana empieza en lunes">
          <div className="s8-btn" onClick={() => set("firstDayMonday", !settings.firstDayMonday)}><Toggle checked={settings.firstDayMonday} /></div>
        </RowLabel>
        <RowLabel label="Tema">
          <div style={{ display: "flex", gap: 6 }}>
            <button className="s8-btn" onClick={() => set("theme", "dark")} style={{ ...iconToggleBtn, background: settings.theme === "dark" ? "var(--accent)" : "var(--card-2)", color: settings.theme === "dark" ? "#fff" : "var(--text-muted)" }}><Moon size={14} /></button>
            <button className="s8-btn" onClick={() => set("theme", "light")} style={{ ...iconToggleBtn, background: settings.theme === "light" ? "var(--accent)" : "var(--card-2)", color: settings.theme === "light" ? "#fff" : "var(--text-muted)" }}><Sun size={14} /></button>
          </div>
        </RowLabel>
      </SettingsSection>

      <SettingsSection title="Privacidad">
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
          Sleep8 guarda únicamente los datos necesarios para organizar tu horario de sueño: tus horas de dormir y despertar, tu rutina nocturna y los registros de sueño que decidas guardar. No solicitamos ni almacenamos información médica. Todo se guarda de forma privada en tu cuenta.
        </p>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 18, padding: "18px 20px", marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function RowLabel({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
      <span style={{ fontSize: 14, color: "var(--text)" }}>{label}</span>
      {children}
    </div>
  );
}

const iconToggleBtn = { width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" };
