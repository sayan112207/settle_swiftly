const columns = [
  {
    title: "PRODUCT",
    links: [
      { href: "#how", label: "How it works" },
      { href: "#pricing", label: "Pricing" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { href: "#", label: "About" },
      { href: "#", label: "Contact" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
    ],
  },
];

/** Site footer with the wordmark, section links and copyright. */
export function Footer() {
  return (
    <footer className="border-t border-line px-8 py-14">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 max-[700px]:grid-cols-2 max-[420px]:grid-cols-1">
        <div>
          <div className="text-base font-semibold">Settle Swiftly</div>
          <p className="mt-2 max-w-[260px] text-sm text-ink-faint">
            Invoicing that chases unpaid revenue for you.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <div className="mb-3 text-xs font-bold tracking-[0.06em] text-ink-faint">
              {column.title}
            </div>
            <div className="flex flex-col gap-2 text-sm">
              {column.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-brand-deep transition-colors hover:text-brand"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-[1280px] text-[13px] text-ink-ghost">
        © 2026 Settle Swiftly
      </div>
    </footer>
  );
}
