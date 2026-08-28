// The house nav, in one place: the desktop row (NavLinks) and the phone-width
// hamburger menu (MobileNav) are two presentations of the SAME list, and a link
// added to only one of them is a page that exists on exactly one form factor.
export const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/boards", label: "Boards" },
  { href: "/frames", label: "Frames" },
  { href: "/editor", label: "Editor" },
];
