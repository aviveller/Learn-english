const { useState, useEffect, useRef } = React;

/* ---------- Firebase ---------- */
firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth();
const fs = firebase.firestore();
const families = fs.collection("families");
const LOCAL_KEY = "wq_family_code";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // בלי 0/O ו-1/I/L שמתבלבלים
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const fmtCode = (c) => (c ? `${c.slice(0, 3)}-${c.slice(3)}` : "");
const normCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const localGet = () => { try { return localStorage.getItem(LOCAL_KEY); } catch { return null; } };
const localSet = (v) => { try { v ? localStorage.setItem(LOCAL_KEY, v) : localStorage.removeItem(LOCAL_KEY); } catch {} };

async function ensureAuth() {
  if (auth.currentUser) return;
  await auth.signInAnonymously();
}

/* ---------- צבעים ---------- */
const INK = "#1B2A4A", SUN = "#FFD93D", GRAPE = "#7A5CFA", LEAF = "#2BB673", CORAL = "#FF6B6B", PAPER = "#FFFFFF";

/* ---------- מילים התחלתיות ---------- */
const STARTER = [
  ["test", "מבחן"], ["bat", "עטלף"], ["ask", "לשאול"], ["ant", "נמלה"],
  ["apple", "תפוח"], ["school", "בית ספר"], ["snake", "נחש"], ["afraid", "מפוחד"],
  ["mad", "כועס"], ["woman", "אישה"], ["cut", "לגזור"],
];
const FALLBACK = ["בית", "שמש", "מים", "לאכול", "חתול", "גדול", "קטן", "ירוק", "שולחן", "לשחק", "חבר", "עץ"];

const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const WEEK = 7 * 24 * 60 * 60 * 1000;

/* ---------- צלילים ---------- */
let audioCtx = null;
const SOUNDS = {
  correct: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]],
  wrong: [[330, 0, 0.2, "triangle"], [247, 0.18, 0.35, "triangle"]],
  click: [[700, 0, 0.06, "square", 0.04]],
  streak: [[784, 0, 0.1], [988, 0.09, 0.1], [1175, 0.18, 0.1], [1568, 0.27, 0.3]],
  finish: [[523, 0, 0.16], [659, 0.16, 0.16], [784, 0.32, 0.16], [1047, 0.48, 0.5]],
};
function playSound(kind, enabled) {
  if (!enabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;
    SOUNDS[kind].forEach(([f, s, d, type = "sine", v = 0.18]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + s);
      g.gain.exponentialRampToValueAtTime(v, t + s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s + d);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + s); o.stop(t + s + d + 0.05);
    });
  } catch {}
}

/* ---------- הקראה ---------- */
let voicesCache = [];
let onSpeechFail = null;
function loadVoices() { try { voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch { voicesCache = []; } }
function speakFallback(text) {
  try {
    const a = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`);
    a.play().catch(() => onSpeechFail && onSpeechFail());
  } catch { onSpeechFail && onSpeechFail(); }
}
function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") { speakFallback(text); return; }
  try {
    if (!voicesCache.length) loadVoices();
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.85; u.volume = 1;
    const voice = voicesCache.find((v) => v.lang && v.lang.toLowerCase().replace("_", "-").startsWith("en-us"))
      || voicesCache.find((v) => v.lang && v.lang.toLowerCase().startsWith("en"));
    if (voice) u.voice = voice;
    let started = false;
    u.onstart = () => { started = true; };
    u.onerror = (e) => { if (!started && e.error !== "interrupted" && e.error !== "canceled") speakFallback(text); };
    synth.speak(u);
    setTimeout(() => { if (!started && !synth.speaking) speakFallback(text); }, 1500);
  } catch { speakFallback(text); }
}

/* ---------- עיצוב ---------- */
const CSS = `
.wq { direction: rtl; font-family: 'Fredoka', 'Rubik', system-ui, sans-serif; min-height: 100vh; background: ${SUN}; color: ${INK};
  padding: calc(20px + env(safe-area-inset-top, 0px)) 16px calc(48px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box; }
.wq * { box-sizing: border-box; }
.wq-wrap { max-width: 560px; margin: 0 auto; }
.wq-card { background: ${PAPER}; border: 3px solid ${INK}; border-radius: 24px; box-shadow: 6px 6px 0 ${INK}; padding: 22px; }
.wq-btn { font-family: inherit; font-weight: 600; font-size: 18px; color: ${INK}; background: ${PAPER}; border: 3px solid ${INK};
  border-radius: 16px; box-shadow: 4px 4px 0 ${INK}; padding: 12px 18px; cursor: pointer; display: inline-flex; align-items: center;
  justify-content: center; gap: 8px; transition: transform .08s, box-shadow .08s; }
.wq-btn:active:not(:disabled) { transform: translate(3px,3px); box-shadow: 1px 1px 0 ${INK}; }
.wq-btn:disabled { opacity: .45; cursor: not-allowed; }
.wq-btn:focus-visible, .wq-input:focus-visible, .wq-chip:focus-visible { outline: 4px solid ${GRAPE}; outline-offset: 3px; }
.wq-btn.primary { background: ${GRAPE}; color: #fff; font-size: 22px; padding: 16px 22px; }
.wq-btn.small { font-size: 15px; padding: 8px 12px; box-shadow: 3px 3px 0 ${INK}; border-radius: 12px; }
.wq-btn.icon { padding: 8px 11px; border-radius: 50%; font-size: 20px; line-height: 1; }
.wq-input { font-family: inherit; font-size: 18px; color: ${INK}; background: #fff; border: 3px solid ${INK}; border-radius: 14px; padding: 10px 12px; width: 100%; }
.wq-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; gap: 10px; }
.wq-h1 { font-size: 34px; font-weight: 700; margin: 0; line-height: 1.15; }
.wq-sub { font-size: 18px; margin: 6px 0 0; opacity: .8; }
.wq-word { direction: ltr; font-size: clamp(56px, 15vw, 96px); font-weight: 700; text-align: center; line-height: 1; margin: 6px 0 14px; }
.wq-speak { width: 76px; height: 76px; border-radius: 50%; background: ${GRAPE}; color: #fff; border: 3px solid ${INK};
  box-shadow: 4px 4px 0 ${INK}; display: grid; place-items: center; margin: 0 auto; cursor: pointer; font-size: 34px; }
.wq-speak:active { transform: translate(3px,3px); box-shadow: 1px 1px 0 ${INK}; }
.wq-speak:focus-visible { outline: 4px solid ${INK}; outline-offset: 3px; }
.wq-options { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
.wq-opt { font-size: 24px; min-height: 84px; padding: 12px; }
.wq-opt.correct { background: ${LEAF}; color: #fff; animation: wq-pop .35s ease; }
.wq-opt.wrong { background: ${CORAL}; color: #fff; animation: wq-shake .4s ease; }
.wq-opt.dim { opacity: .4; }
.wq-progress { display: flex; gap: 5px; margin: 0 0 18px; }
.wq-seg { flex: 1; height: 14px; border: 2.5px solid ${INK}; border-radius: 8px; background: #fff; }
.wq-seg.ok { background: ${LEAF}; } .wq-seg.no { background: ${CORAL}; } .wq-seg.now { background: ${GRAPE}; }
.wq-feedback { min-height: 64px; margin-top: 18px; text-align: center; font-size: 22px; font-weight: 600; }
.wq-chip { font-family: inherit; display: flex; align-items: center; gap: 10px; width: 100%; text-align: right; padding: 10px 12px;
  border: 2.5px solid ${INK}; border-radius: 14px; background: #fff; color: ${INK}; cursor: pointer; font-size: 18px; }
.wq-chip.on { background: #E9E3FF; }
.wq-box { width: 26px; height: 26px; border: 2.5px solid ${INK}; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; font-weight: 700; color: #fff; }
.wq-chip.on .wq-box { background: ${GRAPE}; }
.wq-en { direction: ltr; font-weight: 700; }
.wq-code { direction: ltr; font-size: 44px; font-weight: 700; letter-spacing: .12em; text-align: center; background: #E9E3FF;
  border: 3px dashed ${INK}; border-radius: 18px; padding: 12px; margin: 16px 0; }
.wq-score { font-size: 96px; font-weight: 700; text-align: center; line-height: 1; margin: 6px 0; }
.wq-stars { text-align: center; font-size: 52px; letter-spacing: 6px; }
.wq-star { display: inline-block; animation: wq-pop .5s ease both; }
.wq-confetti { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.wq-confetti span { position: absolute; top: -20px; width: 12px; height: 18px; border: 2px solid ${INK}; border-radius: 3px; animation: wq-fall linear forwards; }
.wq-toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); max-width: 528px; margin: 0 auto;
  background: #FFE3E3; border: 3px solid ${INK}; border-radius: 16px; box-shadow: 4px 4px 0 ${INK}; padding: 12px 14px; font-size: 17px; z-index: 10; }
@keyframes wq-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes wq-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
@keyframes wq-fall { to { transform: translateY(110vh) rotate(540deg); } }
@media (prefers-reduced-motion: reduce) { .wq-opt.correct, .wq-opt.wrong, .wq-star { animation: none; } .wq-confetti { display: none; } }
`;

/* ================================================================ */

function App() {
  const [phase, setPhase] = useState("loading"); // loading | welcome | newcode | app
  const [code, setCode] = useState(null);
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("m");
  const [words, setWords] = useState([]);
  const [soundOn, setSoundOn] = useState(true);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState("");

  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const answersRef = useRef([]);
  const streakRef = useRef(0);
  const timerRef = useRef(null);
  const toastRef = useRef(null);

  const g = (m, f) => (gender === "f" ? f : m);
  const showToast = (t) => { setToast(t); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(""), 5000); };

  const applyData = (d) => {
    setName(d.name || ""); setGender(d.gender || "m"); setWords(d.words || []);
    setHistory(d.history || []); setSoundOn(d.soundOn !== false);
  };

  useEffect(() => {
    (async () => {
      try {
        await ensureAuth();
        const saved = localGet();
        if (saved) {
          const snap = await families.doc(saved).get();
          if (snap.exists) { setCode(saved); applyData(snap.data()); setPhase("app"); return; }
          localSet(null);
        }
        setPhase("welcome");
      } catch (e) {
        console.error(e);
        setPhase("welcome");
        showToast("אין חיבור לשרת. בדקו את האינטרנט ונסו לרענן את הדף.");
      }
    })();
    if ("speechSynthesis" in window) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
    onSpeechFail = () => showToast("ההשמעה לא עובדת. בדקו שהטלפון לא על שקט ושהעוצמה למעלה.");
    return () => { clearTimeout(timerRef.current); onSpeechFail = null; };
  }, []);

  // שמירה לשרת
  const persist = (patch, c = code) => {
    if (!c) return Promise.resolve();
    return families.doc(c).set({ ...patch, updatedAt: Date.now() }, { merge: true })
      .catch((e) => { console.error(e); showToast("השינוי לא נשמר – אין חיבור לשרת. נסו שוב."); });
  };

  const createFamily = async (n, gd) => {
    await ensureAuth();
    let c;
    for (let i = 0; i < 5; i++) {
      const candidate = genCode();
      const snap = await families.doc(candidate).get();
      if (!snap.exists) { c = candidate; break; }
    }
    if (!c) throw new Error("no code");
    const data = {
      name: n, gender: gd, soundOn: true, history: [], createdAt: Date.now(), updatedAt: Date.now(),
      words: STARTER.map(([en, he]) => ({ id: uid(), en, he, active: true, addedAt: Date.now() })),
    };
    await families.doc(c).set(data);
    localSet(c); setCode(c); applyData(data); setPhase("newcode");
  };

  const joinFamily = async (raw) => {
    const c = normCode(raw);
    if (c.length !== 6) return "הקוד צריך להיות 6 תווים, למשל ABC-234";
    await ensureAuth();
    const snap = await families.doc(c).get();
    if (!snap.exists) return "לא מצאנו את הקוד הזה. בדקו שהוא הוקלד נכון.";
    localSet(c); setCode(c); applyData(snap.data()); setScreen("home"); setPhase("app");
    return null;
  };

  const logout = () => { localSet(null); setCode(null); setScreen("home"); setPhase("welcome"); };

  const updateWords = (next) => { setWords(next); persist({ words: next }); };
  const toggleSound = () => { const v = !soundOn; setSoundOn(v); persist({ soundOn: v }); };
  const sfx = (k) => playSound(k, soundOn);

  /* ---------- מבחן ---------- */
  const buildOptions = (word) => {
    const pool = shuffle([...new Set(words.map((w) => w.he).filter((h) => h !== word.he))]).slice(0, 3);
    const extra = shuffle(FALLBACK.filter((h) => h !== word.he && !pool.includes(h)));
    while (pool.length < 3) pool.push(extra.shift());
    return shuffle([word.he, ...pool]);
  };

  const startQuiz = (list) => {
    clearTimeout(timerRef.current);
    const qs = shuffle(list).map((w) => ({ word: w, options: buildOptions(w) }));
    setQuestions(qs); setIndex(0); setSelected(null); setFeedback(null);
    answersRef.current = []; setAnswers([]); streakRef.current = 0;
    setScreen("quiz"); sfx("click");
    if (qs[0]) speak(qs[0].word.en); // בטלפון ההקראה הראשונה חייבת לצאת ישירות מהלחיצה
  };

  useEffect(() => {
    if (screen === "quiz" && index > 0 && questions[index]) {
      const t = setTimeout(() => speak(questions[index].word.en), 250);
      return () => clearTimeout(t);
    }
  }, [screen, index, questions]);

  const finishQuiz = () => {
    const res = answersRef.current;
    const correct = res.filter((a) => a.correct).length;
    const score = Math.round((correct / res.length) * 100);
    const nextHist = [{ date: Date.now(), score, total: res.length }, ...history].slice(0, 20);
    setHistory(nextHist); persist({ history: nextHist });
    sfx("finish"); setScreen("result");
  };

  const goNext = () => {
    clearTimeout(timerRef.current); setSelected(null); setFeedback(null);
    if (index + 1 >= questions.length) finishQuiz(); else setIndex(index + 1);
  };

  const handleAnswer = (i) => {
    if (selected !== null) return;
    const q = questions[index];
    const isCorrect = q.options[i] === q.word.he;
    setSelected(i);
    const nextA = [...answersRef.current, { word: q.word, correct: isCorrect }];
    answersRef.current = nextA; setAnswers(nextA);
    if (isCorrect) {
      streakRef.current += 1;
      const s = streakRef.current;
      if (s === 3 || s === 5 || s === 10) {
        sfx("streak");
        setFeedback({ ok: true, text: `${s} ברצף! ${g("אתה בוער", "את בוערת")}, ${name} 🔥` });
      } else {
        sfx("correct");
        setFeedback({ ok: true, text: pick([`כל הכבוד ${name}! ⭐`, `מעולה ${name}! 🎉`, `יפה מאוד ${name}! 👏`, `${g("איזה תותח", "איזו תותחית")} ${name}! 💪`, `בול, ${name}! ✨`]) });
      }
      timerRef.current = setTimeout(goNext, 1400);
    } else {
      streakRef.current = 0; sfx("wrong");
      setFeedback({ ok: false, text: pick([`לא נורא ${name}, התשובה הנכונה בירוק 💚`, `כמעט ${name}! ${g("תסתכל", "תסתכלי")} על התשובה בירוק`, `${g("ממשיך", "ממשיכה")} הלאה, ${name}! עכשיו ${g("אתה יודע", "את יודעת")} 😊`]) });
      setTimeout(() => speak(q.word.en), 500);
    }
  };

  const activeWords = words.filter((w) => w.active);

  return (
    <div className="wq">
      <style>{CSS}</style>
      <div className="wq-wrap">
        {phase === "loading" && <div style={{ textAlign: "center", paddingTop: 80, fontSize: 24 }}>טוען…</div>}

        {phase === "welcome" && <WelcomeScreen onCreate={createFamily} onJoin={joinFamily} />}

        {phase === "newcode" && <NewCodeScreen code={code} name={name} onDone={() => { sfx("correct"); setPhase("app"); setScreen("home"); }} />}

        {phase === "app" && (
          <>
            {screen === "name" && (
              <NameForm title="עריכת שם" initialName={name} initialGender={gender} submitLabel="שמירה"
                onCancel={() => setScreen("home")}
                onSubmit={async (n, gd) => { setName(n); setGender(gd); await persist({ name: n, gender: gd }); setScreen("home"); }} />
            )}
            {screen === "home" && (
              <HomeScreen name={name} g={g} code={code} activeCount={activeWords.length} totalCount={words.length} history={history}
                soundOn={soundOn} onToggleSound={toggleSound} onStart={() => startQuiz(activeWords)}
                onBank={() => { sfx("click"); setScreen("bank"); }} onEditName={() => setScreen("name")} onLogout={logout} />
            )}
            {screen === "bank" && <BankScreen words={words} onChange={updateWords} onBack={() => { sfx("click"); setScreen("home"); }} sfx={sfx} />}
            {screen === "quiz" && questions[index] && (
              <QuizScreen q={questions[index]} index={index} total={questions.length} answers={answers} selected={selected}
                feedback={feedback} soundOn={soundOn} onToggleSound={toggleSound} onAnswer={handleAnswer} onNext={goNext}
                onExit={() => { clearTimeout(timerRef.current); setScreen("home"); }} />
            )}
            {screen === "result" && (
              <ResultScreen name={name} g={g} answers={answers} onRetryAll={() => startQuiz(activeWords)}
                onRetryMistakes={() => startQuiz(answers.filter((a) => !a.correct).map((a) => a.word))} onHome={() => setScreen("home")} />
            )}
          </>
        )}
      </div>
      {toast && <div className="wq-toast" role="alert">{toast}</div>}
    </div>
  );
}

/* ================================================================ */

function WelcomeScreen({ onCreate, onJoin }) {
  const [mode, setMode] = useState(null);
  const [codeInput, setCodeInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (mode === "new") {
    return (
      <NameForm title="איך קוראים לילד או לילדה?" subtitle="ככה נדע את מי לעודד 🙂" submitLabel="יצירת חשבון"
        initialName="" initialGender="m" onCancel={() => setMode(null)}
        onSubmit={async (n, gd) => {
          try { await onCreate(n, gd); } catch (e) { console.error(e); alert("לא הצלחנו ליצור חשבון. בדקו את החיבור לאינטרנט ונסו שוב."); }
        }} />
    );
  }

  if (mode === "join") {
    const submit = async () => {
      setBusy(true); setErr("");
      try { const e = await onJoin(codeInput); if (e) setErr(e); }
      catch (e) { console.error(e); setErr("אין חיבור לשרת. נסו שוב."); }
      setBusy(false);
    };
    return (
      <div className="wq-card" style={{ marginTop: 30 }}>
        <h1 className="wq-h1">הזינו את קוד המשפחה</h1>
        <p className="wq-sub">הקוד שקיבלתם כשפתחתם את האפליקציה בפעם הראשונה</p>
        <input className="wq-input" dir="ltr" style={{ fontSize: 30, textAlign: "center", letterSpacing: ".1em", marginTop: 18 }}
          value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="ABC-234" maxLength={7} autoFocus
          autoCapitalize="characters" autoComplete="off" onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <p style={{ color: "#B3261E", fontWeight: 600 }}>{err}</p>}
        <button className="wq-btn primary" style={{ width: "100%", marginTop: 18 }} disabled={busy || !codeInput.trim()} onClick={submit}>
          {busy ? "בודק…" : "כניסה"}
        </button>
        <button className="wq-btn small" style={{ marginTop: 12 }} onClick={() => setMode(null)}>חזרה</button>
      </div>
    );
  }

  return (
    <div className="wq-card" style={{ marginTop: 30, textAlign: "center", padding: "30px 22px" }}>
      <div style={{ fontSize: 64, lineHeight: 1 }}>🔤</div>
      <h1 className="wq-h1" style={{ marginTop: 10 }}>מתרגלים מילים באנגלית</h1>
      <p className="wq-sub">שומעים את המילה, בוחרים את התרגום, ואוספים כוכבים</p>
      <button className="wq-btn primary" style={{ width: "100%", marginTop: 24 }} onClick={() => setMode("new")}>זו הפעם הראשונה שלנו</button>
      <button className="wq-btn" style={{ width: "100%", marginTop: 14 }} onClick={() => setMode("join")}>יש לנו קוד משפחה</button>
    </div>
  );
}

function NewCodeScreen({ code, name, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(fmtCode(code)); setCopied(true); } catch {} };
  return (
    <div className="wq-card" style={{ marginTop: 30, textAlign: "center" }}>
      <h1 className="wq-h1">החשבון של {name} מוכן!</h1>
      <p className="wq-sub">זה קוד המשפחה שלכם. שמרו אותו – בעזרתו פותחים את האפליקציה בכל טלפון או מחשב.</p>
      <div className="wq-code">{fmtCode(code)}</div>
      <button className="wq-btn small" onClick={copy}>{copied ? "הועתק ✓" : "העתקת הקוד"}</button>
      <button className="wq-btn primary" style={{ width: "100%", marginTop: 20 }} onClick={onDone}>שמרתי, ממשיכים</button>
    </div>
  );
}

function NameForm({ title, subtitle, initialName, initialGender, submitLabel, onSubmit, onCancel }) {
  const [n, setN] = useState(initialName);
  const [gd, setGd] = useState(initialGender);
  const [busy, setBusy] = useState(false);
  const valid = n.trim().length > 0 && !busy;
  const submit = async () => { if (!valid) return; setBusy(true); await onSubmit(n.trim(), gd); setBusy(false); };
  return (
    <div className="wq-card" style={{ marginTop: 30 }}>
      <h1 className="wq-h1">{title}</h1>
      {subtitle && <p className="wq-sub">{subtitle}</p>}
      <input className="wq-input" style={{ fontSize: 26, marginTop: 18 }} value={n} onChange={(e) => setN(e.target.value)}
        placeholder="שם" maxLength={20} autoFocus onKeyDown={(e) => e.key === "Enter" && submit()} />
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {[["m", "ילד"], ["f", "ילדה"]].map(([k, label]) => (
          <button key={k} className="wq-btn" style={{ flex: 1, background: gd === k ? "#E9E3FF" : PAPER }} aria-pressed={gd === k} onClick={() => setGd(k)}>{label}</button>
        ))}
      </div>
      <button className="wq-btn primary" style={{ width: "100%", marginTop: 22 }} disabled={!valid} onClick={submit}>{busy ? "שומר…" : submitLabel}</button>
      {onCancel && <button className="wq-btn small" style={{ marginTop: 12 }} onClick={onCancel}>ביטול</button>}
    </div>
  );
}

function SoundButton({ on, onToggle }) {
  return <button className="wq-btn icon" onClick={onToggle} aria-label={on ? "השתקת צלילים" : "הפעלת צלילים"}>{on ? "🔊" : "🔇"}</button>;
}

function HomeScreen({ name, g, code, activeCount, totalCount, history, soundOn, onToggleSound, onStart, onBank, onEditName, onLogout }) {
  const last = history[0];
  const best = history.length ? Math.max(...history.map((h) => h.score)) : null;
  return (
    <>
      <div className="wq-top">
        <button className="wq-btn small" onClick={onEditName}>✏️ החלפת שם</button>
        <SoundButton on={soundOn} onToggle={onToggleSound} />
      </div>
      <div className="wq-card" style={{ textAlign: "center", padding: "30px 22px" }}>
        <div style={{ fontSize: 64, lineHeight: 1 }}>👋</div>
        <h1 className="wq-h1" style={{ fontSize: 44, marginTop: 10 }}>היי {name}!</h1>
        <p className="wq-sub">{activeCount > 0 ? `${activeCount} מילים באנגלית מחכות לך` : "עוד לא נבחרו מילים לתרגול"}</p>
        <button className="wq-btn primary" style={{ width: "100%", marginTop: 24 }} disabled={activeCount === 0} onClick={onStart}>
          ▶ {g("מוכן? מתחילים!", "מוכנה? מתחילים!")}
        </button>
        {activeCount === 0 && <p style={{ marginTop: 12, fontSize: 16 }}>סמנו מילים בבנק המילים כדי להתחיל.</p>}
      </div>
      {last && (
        <div className="wq-card" style={{ marginTop: 18, display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <div><div style={{ fontSize: 15, opacity: 0.75 }}>תרגול אחרון</div><div style={{ fontSize: 36, fontWeight: 700 }}>{last.score}</div></div>
          <div><div style={{ fontSize: 15, opacity: 0.75 }}>השיא</div><div style={{ fontSize: 36, fontWeight: 700 }}>{best} 🏆</div></div>
          <div><div style={{ fontSize: 15, opacity: 0.75 }}>תרגולים</div><div style={{ fontSize: 36, fontWeight: 700 }}>{history.length}</div></div>
        </div>
      )}
      <button className="wq-btn" style={{ width: "100%", marginTop: 18 }} onClick={onBank}>📚 בנק המילים ({totalCount})</button>
      <div style={{ marginTop: 28, textAlign: "center", fontSize: 15 }}>
        <div>קוד המשפחה: <span dir="ltr" style={{ fontWeight: 700, letterSpacing: ".08em" }}>{fmtCode(code)}</span></div>
        <button className="wq-btn small" style={{ marginTop: 10 }}
          onClick={() => { if (confirm(`לצאת מהמכשיר הזה? כדי לחזור תצטרכו את הקוד ${fmtCode(code)}`)) onLogout(); }}>
          יציאה מהמכשיר הזה
        </button>
      </div>
    </>
  );
}

function BankScreen({ words, onChange, onBack, sfx }) {
  const [en, setEn] = useState("");
  const [he, setHe] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [msg, setMsg] = useState("");
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  const addMany = (pairs) => {
    const existing = new Set(words.map((w) => w.en.toLowerCase()));
    const fresh = [];
    pairs.forEach(([e, h]) => {
      const key = e.toLowerCase();
      if (e && h && !existing.has(key)) { existing.add(key); fresh.push({ id: uid(), en: e, he: h, active: true, addedAt: Date.now() }); }
    });
    if (fresh.length) { onChange([...fresh, ...words]); sfx("correct"); }
    const skipped = pairs.length - fresh.length;
    flash(fresh.length ? `נוספו ${fresh.length} מילים${skipped ? ` (${skipped} כבר היו בבנק)` : ""}` : "המילים האלה כבר בבנק");
  };
  const addOne = () => { if (!en.trim() || !he.trim()) return; addMany([[en.trim(), he.trim()]]); setEn(""); setHe(""); };
  const addBulk = () => {
    const pairs = bulk.split("\n").map((line) => {
      const parts = line.split(/\s*[-=:,–]\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      const [a, b] = parts;
      return /[a-zA-Z]/.test(a) ? [a, b] : [b, a];
    }).filter(Boolean);
    if (!pairs.length) { flash("לא נמצאו מילים. כתבו בכל שורה: cut - לגזור"); return; }
    addMany(pairs); setBulk(""); setShowBulk(false);
  };
  const setAll = (fn) => onChange(words.map((w) => ({ ...w, active: fn(w) })));
  const activeCount = words.filter((w) => w.active).length;

  return (
    <>
      <div className="wq-top">
        <button className="wq-btn small" onClick={onBack}>→ חזרה</button>
        <h1 className="wq-h1" style={{ fontSize: 28 }}>בנק המילים</h1>
      </div>
      <div className="wq-card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>הוספת מילה</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input className="wq-input" dir="ltr" placeholder="English" value={en} onChange={(e) => setEn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOne()} aria-label="המילה באנגלית" />
          <input className="wq-input" placeholder="עברית" value={he} onChange={(e) => setHe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOne()} aria-label="התרגום לעברית" />
          <button className="wq-btn icon" style={{ borderRadius: 14, background: GRAPE, color: "#fff" }} onClick={addOne} aria-label="הוספה">＋</button>
        </div>
        <button className="wq-btn small" style={{ marginTop: 12 }} onClick={() => setShowBulk(!showBulk)}>{showBulk ? "סגירה" : "הוספת הרבה מילים בבת אחת"}</button>
        {showBulk && (
          <div style={{ marginTop: 12 }}>
            <textarea className="wq-input" rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"מילה בכל שורה, למשל:\ncut - לגזור\njump - לקפוץ"} />
            <button className="wq-btn small" style={{ marginTop: 10, background: GRAPE, color: "#fff" }} onClick={addBulk}>הוספת כל המילים</button>
          </div>
        )}
        {msg && <div style={{ marginTop: 12, fontWeight: 600 }} role="status">{msg}</div>}
      </div>
      <div className="wq-card" style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 600 }}>מה מתרגלים? {activeCount} מתוך {words.length} מילים מסומנות</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 16px" }}>
          <button className="wq-btn small" onClick={() => setAll(() => true)}>הכול</button>
          <button className="wq-btn small" onClick={() => setAll((w) => Date.now() - w.addedAt < WEEK)}>רק החדשות מהשבוע</button>
          <button className="wq-btn small" onClick={() => setAll(() => false)}>ניקוי בחירה</button>
        </div>
        {words.length === 0 && <p>הבנק ריק. הוסיפו את המילים הראשונות למעלה.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {words.map((w) => (
            <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className={`wq-chip ${w.active ? "on" : ""}`} aria-pressed={w.active}
                onClick={() => onChange(words.map((x) => (x.id === w.id ? { ...x, active: !x.active } : x)))}>
                <span className="wq-box">{w.active ? "✓" : ""}</span>
                <span className="wq-en">{w.en}</span>
                <span style={{ opacity: 0.75 }}>{w.he}</span>
              </button>
              <button className="wq-btn icon small" onClick={() => speak(w.en)} aria-label={`השמעת ${w.en}`}>🔊</button>
              <button className="wq-btn icon small" onClick={() => onChange(words.filter((x) => x.id !== w.id))} aria-label={`מחיקת ${w.en}`}>🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function QuizScreen({ q, index, total, answers, selected, feedback, soundOn, onToggleSound, onAnswer, onNext, onExit }) {
  const correctIdx = q.options.indexOf(q.word.he);
  return (
    <>
      <div className="wq-top">
        <button className="wq-btn icon" onClick={onExit} aria-label="יציאה לדף הבית">🏠</button>
        <div style={{ fontSize: 20, fontWeight: 600 }}>שאלה {index + 1} מתוך {total}</div>
        <SoundButton on={soundOn} onToggle={onToggleSound} />
      </div>
      <div className="wq-progress" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`wq-seg ${i < answers.length ? (answers[i].correct ? "ok" : "no") : i === index ? "now" : ""}`} />
        ))}
      </div>
      <div className="wq-card" style={{ textAlign: "center" }}>
        <div className="wq-word">{q.word.en}</div>
        <button className="wq-speak" onClick={() => speak(q.word.en)} aria-label="השמעת המילה">🔊</button>
        <div style={{ marginTop: 10, fontSize: 17 }}>מה התרגום בעברית?</div>
      </div>
      <div className="wq-options">
        {q.options.map((opt, i) => {
          let cls = "wq-btn wq-opt";
          if (selected !== null) cls += i === correctIdx ? " correct" : i === selected ? " wrong" : " dim";
          return <button key={i} className={cls} onClick={() => onAnswer(i)} disabled={selected !== null && i !== correctIdx && i !== selected}>{opt}</button>;
        })}
      </div>
      <div className="wq-feedback" role="status">
        {feedback && <div style={{ color: feedback.ok ? "#0E7A47" : "#B3261E" }}>{feedback.text}</div>}
        {feedback && !feedback.ok && (
          <button className="wq-btn primary" style={{ marginTop: 14 }} onClick={onNext} autoFocus>{index + 1 >= total ? "לסיום" : "לשאלה הבאה"}</button>
        )}
      </div>
    </>
  );
}

function ResultScreen({ name, g, answers, onRetryAll, onRetryMistakes, onHome }) {
  const correct = answers.filter((a) => a.correct).length;
  const score = Math.round((correct / answers.length) * 100);
  const stars = score >= 90 ? 3 : score >= 65 ? 2 : 1;
  const mistakes = answers.filter((a) => !a.correct);
  const message =
    score === 100 ? `מושלם, ${name}! ${g("אתה אלוף", "את אלופה")} המילים 🏆`
    : score >= 80 ? `עבודה מצוינת, ${name}! 🎉`
    : score >= 60 ? `יפה מאוד, ${name}! עוד קצת תרגול ו${g("תהיה אלוף", "תהיי אלופה")} 💪`
    : `${name}, כל תרגול מקדם אותך. ${g("בוא", "בואי")} ננסה שוב! 🌱`;
  const confetti = useRef(Array.from({ length: 36 }).map(() => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.2 + Math.random() * 1.6, color: pick([GRAPE, LEAF, CORAL, "#fff", "#4FC3F7"]),
  }))).current;

  return (
    <>
      {score >= 80 && (
        <div className="wq-confetti" aria-hidden="true">
          {confetti.map((c, i) => <span key={i} style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}
        </div>
      )}
      <div className="wq-card" style={{ textAlign: "center", marginTop: 10 }}>
        <div className="wq-stars">
          {[0, 1, 2].map((i) => <span key={i} className="wq-star" style={{ animationDelay: `${0.2 + i * 0.25}s`, opacity: i < stars ? 1 : 0.2 }}>⭐</span>)}
        </div>
        <div className="wq-score">{score}</div>
        <div style={{ fontSize: 20 }}>{correct} תשובות נכונות מתוך {answers.length}</div>
        <p style={{ fontSize: 24, fontWeight: 600, margin: "18px 0 0" }}>{message}</p>
      </div>
      {mistakes.length > 0 && (
        <div className="wq-card" style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>מילים לחזור עליהן</div>
          <div style={{ display: "grid", gap: 8 }}>
            {mistakes.map((a) => (
              <div key={a.word.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 20 }}>
                <button className="wq-btn icon small" onClick={() => speak(a.word.en)} aria-label={`השמעת ${a.word.en}`}>🔊</button>
                <span className="wq-en">{a.word.en}</span><span>= {a.word.he}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {mistakes.length > 0 && <button className="wq-btn primary" onClick={onRetryMistakes}>🔁 תרגול רק של הטעויות</button>}
        <button className={`wq-btn ${mistakes.length ? "" : "primary"}`} onClick={onRetryAll}>▶ עוד סיבוב על כל המילים</button>
        <button className="wq-btn" onClick={onHome}>🏠 לדף הבית</button>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
