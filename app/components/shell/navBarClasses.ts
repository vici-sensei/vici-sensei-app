// Desktop-only sidebar. On mobile all items live in the full-screen menu instead
// (see MobileNavMenu), toggled from the hamburger button in the header.
// md:top-17 matches the header's h-17 so the sidebar docks right below it instead of overlapping.
// md:self-start overrides the row's default `align-items: stretch`, which otherwise stretches
// the sidebar to match `main`'s full height -- leaving `sticky` with zero room to move (its box
// would already span the entire scrollable container, so it never visibly "sticks").
// md:max-h-[calc(100vh-...)] + md:overflow-y-auto cap the sidebar to the viewport space below the
// header, so on short screens (or once Settings' always-open sub-items push it past that) it grows
// its own scrollbar instead of running off the bottom of the screen.
export const navBarClasses =
  "hidden md:sticky md:top-17 md:flex md:max-h-[calc(100vh_-_4.25rem)] md:w-fit md:shrink-0 md:flex-col md:justify-start md:gap-1.5 md:self-start md:overflow-y-auto md:px-0 md:py-0 md:pl-2 md:pt-2";
