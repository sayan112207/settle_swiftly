import { useState } from "react";

const clientDefs = [
  {
    name: "Northline Creative",
    avg: "3",
    score: "On time",
    detail: "3 days average. Rarely needs a reminder. Preferred channel: UPI. Payment risk: Low.",
  },
  {
    name: "Vertex Labs",
    avg: "9",
    score: "On time",
    detail:
      "9 days average. Usually pays after 1 reminder. Preferred channel: Email. Payment risk: Low.",
  },
  {
    name: "Patel & Sons",
    avg: "24",
    score: "Slow",
    detail:
      "24 days average. Usually needs 2 reminders. Preferred channel: WhatsApp. Payment risk: Medium.",
  },
  {
    name: "Mira Interiors",
    avg: "41",
    score: "Risky",
    detail:
      "41 days average. Usually needs 3 reminders. Preferred channel: WhatsApp. Payment risk: High.",
  },
];

const scoreClass: Record<string, string> = {
  "On time": "font-semibold text-brand-deep",
  Slow: "font-semibold text-warn",
  Risky: "font-semibold text-danger",
};

/** Landing section on per-client payment scores learned from payment history. */
export function ClientScores() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <section
      aria-labelledby="intel-heading"
      className="mx-auto grid max-w-[1160px] grid-cols-[1fr_1.3fr] items-start gap-16 px-8 py-25 max-[760px]:grid-cols-1"
    >
      <div>
        <h2 id="intel-heading" className="text-[38px] leading-[1.1] font-[650] tracking-[-0.02em]">
          Know who
          <br />
          <span className="text-ink-soft">pays late.</span>
        </h2>
        <p className="mt-[18px] max-w-[340px] text-base leading-[1.6] text-ink-muted">
          Settle Swiftly learns how your clients pay.
        </p>
      </div>

      <div>
        <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-line pb-2.5 text-xs text-ink-faint">
          <span>Client</span>
          <span>Avg. days</span>
          <span>Score</span>
        </div>

        {clientDefs.map((client, i) => (
          <div
            key={client.name}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            className="border-b border-line-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
          >
            <div className="grid cursor-default grid-cols-[2fr_1fr_1fr] items-center py-4 text-[15px]">
              <span className="font-semibold">{client.name}</span>
              <span>{client.avg}</span>
              <span className={scoreClass[client.score]}>{client.score}</span>
            </div>
            {hovered === i && (
              <div className="mb-3.5 rounded-xl bg-surface-alt p-4 text-[13px] leading-[1.7] text-ink-muted">
                {client.detail}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
