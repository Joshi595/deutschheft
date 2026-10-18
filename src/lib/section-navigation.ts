/** Tracks sections by their position, including long sections and late React hydration. */
export function installSectionNavigation() {
  const nav = document.querySelector<HTMLElement>('[data-local-nav]');
  if (!nav) return;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('[data-section-link]')];
  let scheduled = false;
  let lastId = '';
  function update() {
    scheduled = false;
    const threshold = nav!.getBoundingClientRect().bottom + 24;
    const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    let active = sections[0]!;
    for (const section of sections) {
      // Browsers round scroll offsets to device pixels, but rects retain fractions.
      if (section.getBoundingClientRect().top <= threshold + 2) active = section;
    }
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = sections.at(-1)!;
    links.forEach((link) => {
      if (link.hash === `#${active.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    if (lastId !== active.id) {
      lastId = active.id;
      const selected = links.find((link) => link.hash === `#${active.id}`);
      // Reveal a clipped tab without scrolling the page or interrupting reading.
      if (selected) nav!.querySelector('ul')?.scrollTo({ left: selected.offsetLeft - 16, behavior: 'instant' });
    }
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }
  let pendingHash = window.location.hash;
  function followHash() {
    pendingHash = window.location.hash;
    const section = document.getElementById(pendingHash.slice(1));
    if (section) {
      section.scrollIntoView({ behavior: 'instant' });
    }
    schedule();
  }
  // Fonts and client-rendered content can shift a direct anchor after the initial jump.
  // Keep it aligned during layout changes until the learner starts interacting.
  function cancelAnchor() { pendingHash = ''; }
  for (const name of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
    window.addEventListener(name, cancelAnchor, { passive: true });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', followHash);
  window.addEventListener('popstate', schedule);
  const observer = new MutationObserver(() => {
    if (pendingHash) followHash();
    else schedule();
  });
  // Only content changes matter; observing aria-current would create an update loop.
  const main = document.getElementById('main');
  if (main) observer.observe(main, { childList: true, subtree: true });
  const resize = new ResizeObserver(() => {
    if (pendingHash) followHash();
    else schedule();
  });
  if (main) resize.observe(main);
  const header = document.querySelector('[data-location-header]');
  if (header) resize.observe(header);
  resize.observe(nav);
  void document.fonts.ready.then(() => { if (pendingHash) followHash(); });
  followHash();
}
