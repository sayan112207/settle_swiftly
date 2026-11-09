import { Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import { BOOK_IS_EXTERNAL, LINKS, NAV_FEATURE_GROUPS, type FeatureSlug } from "./content";
import { FeatureScene } from "./FeatureScene";
import { LogoMark, Wordmark } from "./marks";
import { useMotion } from "./motion";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Panel = "product" | "integrations" | "company";
type Opener = "click" | "hover" | "key";

const ALL_FEATURES = NAV_FEATURE_GROUPS.flatMap((g) => g.items);

/** Chevron after a dropdown trigger; flips when open. */
function Chevron() {
  return (
    <svg viewBox="0 0 10 6" aria-hidden="true">
      <path d="M1 1L5 5L9 1" />
    </svg>
  );
}

/** The plus that turns into a minus on mobile accordions. */
function PlusMinus() {
  return (
    <span className="pmx" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

/** Opens in a new tab only when "Talk to the founders" leaves the site. */
const bookProps = BOOK_IS_EXTERNAL ? { target: "_blank", rel: "noopener" } : {};

/**
 * The marketing site's top bar.
 *
 * Desktop: three dropdowns (Product, Integrations, Company) that open on a
 * 150ms hover or a click, one at a time, close on Escape or outside click, and
 * support arrow keys inside. Product previews each feature's scene as you
 * hover it. A mint underline sits under the current section and slides to
 * whatever is hovered. Below 1024px it collapses to a full-screen menu.
 *
 * `hero`: transparent over the home hero until the page scrolls.
 */
export function SiteNav({ current, hero = false }: { current: string; hero?: boolean }) {
  const { armed } = useMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const ulRef = useRef<HTMLElement>(null);
  const uShown = useRef(false);
  const hovT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeT = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [w, setW] = useState(1280);
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState<Panel | "">("");
  const [by, setBy] = useState<Opener | "">("");
  const [menu, setMenu] = useState(false);
  const [acc, setAcc] = useState<Panel | "">("");
  const [pv, setPv] = useState<FeatureSlug>("chasing");
  const [hov, setHov] = useState<Panel | "pricing" | "">("");

  const isHome = current === "home";
  const navOf: Record<string, Panel | "pricing"> = {
    features: "product",
    feature: "product",
    integrations: "integrations",
    pricing: "pricing",
    about: "company",
    security: "company",
    contact: "company",
  };

  const close = useCallback(
    (focus = false) => {
      clearTimeout(closeT.current);
      clearTimeout(hovT.current);
      const k = open;
      if (k) {
        setOpen("");
        setBy("");
        if (focus) document.getElementById(`snt-${k}`)?.focus();
      }
    },
    [open],
  );

  /** Opens panel `k`, remembering how (hover-opened panels close on mouse leave). */
  const openP = (k: Panel, how: Opener) => {
    clearTimeout(closeT.current);
    clearTimeout(hovT.current);
    setOpen(k);
    setBy(how);
  };

  /** Closes a hover-opened panel after a short grace period. */
  const later = () => {
    clearTimeout(closeT.current);
    if (open && by === "hover") closeT.current = setTimeout(() => close(), 200);
  };

  // Scroll (solid bar), resize (reset at the breakpoint), outside click and Escape.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const nw = window.innerWidth;
        setW((pw) => {
          if (nw >= 1024 !== pw >= 1024) {
            setOpen("");
            setMenu(false);
            setAcc("");
          }
          return nw;
        });
      }, 100);
    };
    onScroll();
    setW(window.innerWidth);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(rt);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (open && barRef.current && !barRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (menu) {
        setMenu(false);
        rootRef.current?.querySelector<HTMLElement>(".snmb")?.focus();
      } else if (open) close(true);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, menu, close]);

  // Lock page scroll behind the mobile menu.
  useEffect(() => {
    if (!menu) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [menu]);

  useEffect(
    () => () => {
      clearTimeout(hovT.current);
      clearTimeout(closeT.current);
    },
    [],
  );

  // The underline: under the current section, sliding to whatever is hovered or open.
  useIsoLayoutEffect(() => {
    const u = ulRef.current,
      bar = barRef.current;
    if (!u || !bar) return;
    const key = hov || open || navOf[current] || "";
    const el = key ? bar.querySelector(`[data-nk="${key}"]`) : null;
    if (!el || w < 1024) {
      u.style.opacity = "0";
      uShown.current = false;
      return;
    }
    const b = bar.getBoundingClientRect(),
      r = el.getBoundingClientRect();
    const x = r.left - b.left + 12,
      width = Math.max(1, r.width - 24),
      y = r.bottom - b.top - 5;
    const t = `translateX(${x.toFixed(1)}px) scaleX(${width.toFixed(1)})`;
    u.style.top = `${y.toFixed(1)}px`;
    if (!uShown.current) {
      u.style.transition = "none";
      u.style.transform = t;
      void u.offsetWidth;
      u.style.transition = "";
    }
    u.style.transform = t;
    u.style.opacity = "1";
    uShown.current = true;
  });

  /** Handlers for one dropdown trigger. */
  const trig = (k: Panel) => ({
    onClick: () => (open === k && by !== "hover" ? close() : openP(k, "click")),
    onMouseEnter: () => {
      if (w < 1024) return;
      clearTimeout(closeT.current);
      clearTimeout(hovT.current);
      setHov(k);
      if (open && open !== k) openP(k, by || "hover");
      else if (!open) hovT.current = setTimeout(() => openP(k, "hover"), 150);
    },
    onMouseLeave: () => {
      clearTimeout(hovT.current);
      setHov("");
      later();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openP(k, "key");
        setTimeout(() => focusItem(k, 0), 40);
      }
    },
  });

  const items = (k: Panel) =>
    Array.from(document.querySelectorAll<HTMLElement>(`#snp-${k} a[href]`));
  /** Focuses item `i` of panel `k`, wrapping around. */
  const focusItem = (k: Panel, i: number) => {
    const it = items(k);
    if (it.length) it[(i + it.length) % it.length]?.focus();
  };

  /** Handlers for one dropdown panel: hover keeps it open, arrows move focus. */
  const panel = (k: Panel) => ({
    onMouseEnter: () => clearTimeout(closeT.current),
    onMouseLeave: later,
    onKeyDown: (e: KeyboardEvent) => {
      const it = items(k),
        i = it.indexOf(document.activeElement as HTMLElement);
      let j: number | null = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") j = i < 0 ? 0 : i + 1;
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = i <= 0 ? it.length - 1 : i - 1;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = it.length - 1;
      else if (e.key === "Escape") {
        e.preventDefault();
        close(true);
        return;
      }
      if (j !== null) {
        e.preventDefault();
        focusItem(k, j);
      }
    },
  });

  /** Closes the open panel when focus leaves both it and its trigger. */
  const onBlur = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (!open || !to) return;
    const pnl = document.getElementById(`snp-${open}`),
      t = document.getElementById(`snt-${open}`);
    if (to === t || pnl?.contains(to)) return;
    close();
  };

  const pg = (c: string) => (current === c ? ("page" as const) : undefined);
  const preview = ALL_FEATURES.find((f) => f.slug === pv) ?? { slug: pv, name: "", short: "" };
  const ctaHref = isHome ? "#access" : LINKS.earlyAccess;
  const closeMenu = () => setMenu(false);
  const toggleAcc = (k: Panel) => () => setAcc((a) => (a === k ? "" : k));

  return (
    <div
      className="sn"
      ref={rootRef}
      data-armed={armed ? "true" : "false"}
      data-solid={!hero || solid || !!open || menu ? "true" : "false"}
    >
      <header className="snb" ref={barRef} onBlur={onBlur}>
        <div className="wrap snbar">
          <a className="logo" href={isHome ? "#top" : LINKS.home} aria-label="Settle Swiftly, home">
            <LogoMark drawTick />
            <Wordmark />
          </a>
          <nav aria-label="Primary">
            <ul className="snl">
              <li>
                <button
                  className="snt"
                  type="button"
                  id="snt-product"
                  data-nk="product"
                  aria-expanded={open === "product"}
                  aria-controls="snp-product"
                  {...trig("product")}
                >
                  Product
                  <Chevron />
                </button>
                <div
                  className="snp"
                  id="snp-product"
                  data-open={open === "product" ? "true" : "false"}
                  {...panel("product")}
                >
                  <div className="wrap snpi">
                    <p className="lbl snph">Coming soon · Enterprise first</p>
                    <div className="snpg">
                      {NAV_FEATURE_GROUPS.map((g) => (
                        <div className="snc" key={g.label}>
                          <p className="lbl">{g.label}</p>
                          {g.items.map((f) => (
                            <a
                              key={f.slug}
                              className="sni"
                              href={LINKS.feature(f.slug)}
                              data-pv={pv === f.slug ? "true" : "false"}
                              onMouseEnter={() => setPv(f.slug)}
                              onFocus={() => setPv(f.slug)}
                              onClick={() => close()}
                            >
                              <b>{f.name}</b>
                              <span>{f.short}</span>
                            </a>
                          ))}
                        </div>
                      ))}
                      <div className="snpv" aria-hidden="true">
                        <p className="snpvn">{preview.name}</p>
                        <p className="snpvd">{preview.short}</p>
                        <div className="snpvb">
                          <FeatureScene
                            slug={pv}
                            mode="mini"
                            run={open === "product"}
                            armed={armed}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="snpf">
                      <a
                        href={LINKS.features}
                        aria-current={pg("features")}
                        onClick={() => close()}
                      >
                        See all features →
                      </a>
                      <a href={isHome ? "#how" : LINKS.how} onClick={() => close()}>
                        How it works →
                      </a>
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <button
                  className="snt"
                  type="button"
                  id="snt-integrations"
                  data-nk="integrations"
                  aria-expanded={open === "integrations"}
                  aria-controls="snp-integrations"
                  {...trig("integrations")}
                >
                  Integrations
                  <Chevron />
                </button>
                <div
                  className="snp"
                  id="snp-integrations"
                  data-open={open === "integrations" ? "true" : "false"}
                  {...panel("integrations")}
                >
                  <div className="wrap snpi">
                    <p className="lbl snph">Coming soon</p>
                    <div className="snp2">
                      <div className="snc">
                        <p className="lbl">Accounting</p>
                        <div className="snlist">
                          <a href={LINKS.integrations} onClick={() => close()}>
                            Tally
                          </a>
                          <a href={LINKS.integrations} onClick={() => close()}>
                            Zoho Books
                          </a>
                        </div>
                      </div>
                      <div className="snc">
                        <p className="lbl">Import from</p>
                        <div className="snlist">
                          {["Google Sheets", "Excel", "QuickBooks", "Any CSV"].map((n) => (
                            <a key={n} href={LINKS.integrations} onClick={() => close()}>
                              {n}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div className="snx">
                        <p>
                          Built to connect to the books you already keep. Your books stay where they
                          are.
                        </p>
                        <a
                          className="snk"
                          href={LINKS.integrations}
                          aria-current={pg("integrations")}
                          onClick={() => close()}
                        >
                          All integrations →
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <a
                  className="snt"
                  href={isHome ? "#pricing" : LINKS.pricing}
                  data-nk="pricing"
                  aria-current={pg("pricing")}
                  onMouseEnter={() => {
                    clearTimeout(hovT.current);
                    setHov("pricing");
                    later();
                  }}
                  onMouseLeave={() => setHov("")}
                >
                  Pricing
                </a>
              </li>
              <li>
                <button
                  className="snt"
                  type="button"
                  id="snt-company"
                  data-nk="company"
                  aria-expanded={open === "company"}
                  aria-controls="snp-company"
                  {...trig("company")}
                >
                  Company
                  <Chevron />
                </button>
                <div
                  className="snp"
                  id="snp-company"
                  data-open={open === "company" ? "true" : "false"}
                  {...panel("company")}
                >
                  <div className="wrap snpi">
                    <div className="snp1">
                      <div className="snlist">
                        <a href={LINKS.about} aria-current={pg("about")}>
                          About
                        </a>
                        <a href={LINKS.security} aria-current={pg("security")}>
                          Security
                        </a>
                        <a href={LINKS.contact} aria-current={pg("contact")}>
                          Contact
                        </a>
                        <a href={LINKS.book} {...bookProps}>
                          Talk to the founders
                          <span className="ext" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </nav>
          <div className="snr">
            <Link className="sn-in" to={LINKS.signIn}>
              Sign in
            </Link>
            <a className="btn btn-p on-dk" href={ctaHref}>
              Get early access
            </a>
            <button
              className="snmb"
              type="button"
              aria-expanded={menu}
              aria-controls="snm"
              aria-label={menu ? "Close menu" : "Open menu"}
              onClick={() => {
                setMenu((m) => !m);
                setOpen("");
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d={menu ? "M4 4L16 16M16 4L4 16" : "M2 5H18M2 10H18M2 15H18"} />
              </svg>
            </button>
          </div>
        </div>
        <i className="snu" ref={ulRef} data-a="N4" data-in="" />
      </header>

      <div className="snm" id="snm" data-open={menu ? "true" : "false"}>
        <nav className="snms" aria-label="Menu">
          <div className="sna" data-open={acc === "product" ? "true" : "false"}>
            <button
              className="snab"
              type="button"
              aria-expanded={acc === "product"}
              aria-controls="sna-product"
              onClick={toggleAcc("product")}
            >
              Product
              <PlusMinus />
            </button>
            <div className="snac" id="sna-product">
              {NAV_FEATURE_GROUPS.map((g) => (
                <div key={g.label}>
                  <span className="lbl">{g.label}</span>
                  {g.items.map((f) => (
                    <a key={f.slug} href={LINKS.feature(f.slug)} onClick={closeMenu}>
                      {f.name}
                    </a>
                  ))}
                </div>
              ))}
              <span className="lbl">More</span>
              <a href={LINKS.features} aria-current={pg("features")} onClick={closeMenu}>
                See all features
              </a>
              <a href={isHome ? "#how" : LINKS.how} onClick={closeMenu}>
                How it works
              </a>
            </div>
          </div>
          <div className="sna" data-open={acc === "integrations" ? "true" : "false"}>
            <button
              className="snab"
              type="button"
              aria-expanded={acc === "integrations"}
              aria-controls="sna-integrations"
              onClick={toggleAcc("integrations")}
            >
              Integrations
              <PlusMinus />
            </button>
            <div className="snac" id="sna-integrations">
              <span className="lbl">Accounting</span>
              <a href={LINKS.integrations} onClick={closeMenu}>
                Tally
              </a>
              <a href={LINKS.integrations} onClick={closeMenu}>
                Zoho Books
              </a>
              <span className="lbl">Import from</span>
              {["Google Sheets", "Excel", "QuickBooks", "Any CSV"].map((n) => (
                <a key={n} href={LINKS.integrations} onClick={closeMenu}>
                  {n}
                </a>
              ))}
              <span className="lbl">More</span>
              <a href={LINKS.integrations} aria-current={pg("integrations")} onClick={closeMenu}>
                All integrations
              </a>
            </div>
          </div>
          <div className="sna" data-open={acc === "company" ? "true" : "false"}>
            <button
              className="snab"
              type="button"
              aria-expanded={acc === "company"}
              aria-controls="sna-company"
              onClick={toggleAcc("company")}
            >
              Company
              <PlusMinus />
            </button>
            <div className="snac" id="sna-company">
              <a href={LINKS.about} aria-current={pg("about")}>
                About
              </a>
              <a href={LINKS.security} aria-current={pg("security")}>
                Security
              </a>
              <a href={LINKS.contact} aria-current={pg("contact")}>
                Contact
              </a>
              <a href={LINKS.book} {...bookProps}>
                Talk to the founders
                <span className="ext" aria-hidden="true">
                  ↗
                </span>
              </a>
            </div>
          </div>
          <a
            className="snml"
            href={isHome ? "#pricing" : LINKS.pricing}
            aria-current={pg("pricing")}
            onClick={closeMenu}
          >
            Pricing
          </a>
          <Link className="snml" to={LINKS.signIn}>
            Sign in
          </Link>
        </nav>
        <div className="snmf">
          <a className="btn btn-p on-dk" href={ctaHref} onClick={closeMenu}>
            Get early access
          </a>
        </div>
      </div>
      {!hero && <div className="snsp" />}
    </div>
  );
}
