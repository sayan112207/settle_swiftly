import { Link } from "@tanstack/react-router";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/** Sticky landing nav with section links, "Sign in" and "Get started". */
export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[rgba(247,247,243,0.82)] backdrop-blur-[10px]">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-[18px]"
      >
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-sm font-bold text-white">
            S
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
            Settle Swiftly
          </span>
        </a>

        <div className="flex items-center gap-8 max-[760px]:hidden">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-ink-secondary transition-colors hover:text-brand"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm text-ink-secondary transition-colors hover:text-brand"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-[10px] bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
