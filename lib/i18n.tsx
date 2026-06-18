"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "de" | "en";

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "de",
  setLang: () => {},
});

// ── Automatischer DOM-Übersetzer (DE -> EN über DeepL) ───────────────────────
// Läuft nur clientseitig wenn lang === "en". Übersetzt Textknoten + Platzhalter/
// Titel/aria-label und hält die Übersetzung auch bei React-Re-Renders stabil.
const cache = new Map<string, string>();   // Quelle (DE) -> Übersetzung (EN)
const outputs = new Set<string>();         // bereits übersetzte Werte (nicht erneut anfragen)

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"]);

function translatable(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)) return false;        // mindestens ein Buchstabe
  if (/^https?:\/\//.test(t) || /\S+@\S+\.\S+/.test(t)) return false; // URL/E-Mail
  if (outputs.has(t)) return false;                       // schon eine Übersetzung
  return true;
}

function inSkippedParent(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute("data-no-translate")) return true;
    if (el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

function collectTextNodes(): { nodes: Text[]; sources: Set<string> } {
  const nodes: Text[] = [];
  const sources = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    const text = n as Text;
    const raw = text.nodeValue ?? "";
    const s = raw.trim();
    if (s && translatable(s) && !inSkippedParent(text)) {
      nodes.push(text);
      if (!cache.has(s)) sources.add(s);
    }
    n = walker.nextNode();
  }
  return { nodes, sources };
}

const ATTRS = ["placeholder", "title", "aria-label"];
function collectAttrEls(): { els: Element[]; sources: Set<string> } {
  const els: Element[] = [];
  const sources = new Set<string>();
  const found = document.querySelectorAll("[placeholder],[title],[aria-label]");
  found.forEach(el => {
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.closest("[data-no-translate]")) return;
    els.push(el);
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && translatable(v) && !cache.has(v.trim())) sources.add(v.trim());
    }
  });
  return { els, sources };
}

function apply(nodes: Text[], els: Element[]) {
  for (const text of nodes) {
    const raw = text.nodeValue ?? "";
    const s = raw.trim();
    const en = cache.get(s);
    if (en && en !== s) text.nodeValue = raw.replace(s, en);
  }
  for (const el of els) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const en = cache.get(v.trim());
      if (en && en !== v.trim()) el.setAttribute(a, en);
    }
  }
}

let scheduled = false;
async function runTranslate() {
  scheduled = false;
  const { nodes, sources: tSrc } = collectTextNodes();
  const { els, sources: aSrc } = collectAttrEls();
  const sources = Array.from(new Set([...tSrc, ...aSrc]));

  if (sources.length > 0) {
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: sources, target: "EN" }),
      });
      if (res.ok) {
        const { translations } = (await res.json()) as { translations: string[] };
        sources.forEach((src, i) => {
          const en = translations[i] ?? src;
          cache.set(src, en);
          outputs.add(en);
        });
      }
    } catch { /* offline – Original bleibt stehen */ }
  }
  apply(nodes, els);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(runTranslate, 200);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("de");

  useEffect(() => {
    // localStorage erst clientseitig lesen (vermeidet Hydration-Mismatch)
    const stored = (localStorage.getItem("equiplan-lang") as Lang | null);
    const nav = navigator.language?.toLowerCase().startsWith("en") ? "en" : "de";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLangState(stored ?? nav);
  }, []);

  // DOM-Übersetzer aktivieren, wenn Englisch gewählt ist
  useEffect(() => {
    if (lang !== "en") return;
    document.documentElement.lang = "en";
    schedule();
    const obs = new MutationObserver(() => schedule());
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => obs.disconnect();
  }, [lang]);

  function setLang(l: Lang) {
    localStorage.setItem("equiplan-lang", l);
    // Voller Reload: sauberer Wechsel in beide Richtungen
    window.location.reload();
  }

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
