import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { joinWaitlistSchema } from "@/lib/schemas/waitlist";
import { joinWaitlist } from "@/lib/services/waitlist.service";

import { LINKS } from "./content";
import { StampSvg } from "./marks";
import { stampDate, vars } from "./style";

type WaitlistState = {
  busy: boolean;
  done: boolean;
  doneEmail: string;
  submit: (email: string, source: string, company?: string) => Promise<string | null>;
};

const WaitlistContext = createContext<WaitlistState | null>(null);

/**
 * Shares one signup across every early-access form on the page: join from the
 * hero and the closing form and footer show "On the list" too.
 */
export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [doneEmail, setDoneEmail] = useState("");

  const value = useMemo<WaitlistState>(
    () => ({
      busy,
      done: doneEmail !== "",
      doneEmail,
      submit: async (email, source, company) => {
        setBusy(true);
        try {
          const res = await joinWaitlist({ data: { email, source, company } });
          if (!res.ok) return res.message;
          setDoneEmail(email);
          return null;
        } catch {
          return "That didn’t go through. Try again in a moment.";
        } finally {
          setBusy(false);
        }
      },
    }),
    [busy, doneEmail],
  );

  return <WaitlistContext.Provider value={value}>{children}</WaitlistContext.Provider>;
}

/** The page's shared waitlist state; must sit under a WaitlistProvider. */
function useWaitlist(): WaitlistState {
  const ctx = useContext(WaitlistContext);
  if (!ctx) throw new Error("useWaitlist must be used inside <WaitlistProvider>");
  return ctx;
}

/** The "ON THE LIST" stamp dated today, which lands when a signup succeeds. */
function ListStamp({ width, rot }: { width?: number; rot: string }) {
  return (
    <span
      className="cst stp"
      style={vars({ "--rot": rot, ...(width ? { width: `${width}px` } : {}) })}
    >
      <span className="k-stamp" data-a="C1" style={{ display: "block" }}>
        <StampSvg word="ON THE LIST" date={<tspan>{stampDate()}</tspan>} filter="ssInk" wide />
      </span>
    </span>
  );
}

/**
 * An early-access signup form.
 *
 * - `hero`: email only; on success the stamp and a line replace the form.
 * - `cta`: email plus optional company; on success the email stays, greyed, beside the stamp.
 * - `footer`: the compact email-only form in the site footer.
 */
export function EarlyAccessForm({ variant }: { variant: "hero" | "cta" | "footer" }) {
  const { busy, done, doneEmail, submit } = useWaitlist();
  const id = useId();
  const emailId = `${id}-email`;
  const errId = `${id}-err`;
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const parsed = joinWaitlistSchema.safeParse({
      email,
      company: variant === "cta" ? company : undefined,
    });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Enter a work email, like name@company.com");
      document.getElementById(emailId)?.focus();
      return;
    }
    setErr("");
    const msg = await submit(parsed.data.email, `home-${variant}`, parsed.data.company);
    if (msg) setErr(msg);
  };

  const label = busy ? "Sending…" : "Get early access";

  return (
    <div aria-live="polite">
      {!done ? (
        <form className="form" noValidate onSubmit={onSubmit}>
          <label htmlFor={emailId} className="sr">
            Work email
          </label>
          <input
            id={emailId}
            className="inp"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Work email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
            aria-invalid={err ? "true" : "false"}
            aria-required="true"
            aria-describedby={err ? errId : undefined}
            style={variant === "cta" ? { flex: "2 1 260px" } : undefined}
          />
          {variant === "cta" && (
            <>
              <label htmlFor={`${id}-company`} className="sr">
                Company (optional)
              </label>
              <input
                id={`${id}-company`}
                className="inp"
                name="company"
                type="text"
                autoComplete="organization"
                placeholder="Company (optional)"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                style={{ flex: "1 1 200px" }}
              />
            </>
          )}
          <button className="btn btn-p" type="submit" disabled={busy}>
            {label}
          </button>
          <p className="consent">
            By joining, you agree to our <a href={LINKS.terms}>Terms</a> and{" "}
            <a href={LINKS.privacy}>Privacy Policy</a>
          </p>
          {err && (
            <p id={errId} className="err">
              {err}
            </p>
          )}
        </form>
      ) : variant === "hero" ? (
        <div className="hdone" data-t="">
          <ListStamp rot="-5deg" width={176} />
          <p className="cline k-in" data-a="C1" style={vars({ "--dl": "0.45s", margin: 0 })}>
            We&apos;ll write when your place opens.
          </p>
        </div>
      ) : (
        <div data-t="">
          <div className="cdone">
            <input
              className="inp"
              type="email"
              value={doneEmail}
              disabled
              aria-label="Work email"
              readOnly
            />
            <ListStamp rot="-6deg" />
          </div>
          <p className="cline k-in" data-a="C1" style={vars({ "--dl": "0.45s" })}>
            We&apos;ll write when your place opens.
          </p>
        </div>
      )}
    </div>
  );
}
