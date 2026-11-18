/* Hand-drawn stroke icon set — injected as trusted markup only. */
(function () {
  'use strict';

  const svg = (body, extra) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra || ''}>${body}</svg>`;

  window.Icons = {
    logo: svg(
      `<path d="M8.4 6.2H7.2A2.2 2.2 0 0 0 5 8.4v10.4a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2V8.4a2.2 2.2 0 0 0-2.2-2.2h-1.2"/><rect x="8.4" y="3.4" width="7.2" height="4.6" rx="1.8"/><path d="M8.6 11.6h6.8M8.6 15h4.6"/>`,
    ),
    search: svg(`<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/>`),
    close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
    text: svg(`<path d="M5 7h14M5 12h10M5 17h7"/>`),
    link: svg(
      `<path d="M10.2 13.8a4.6 4.6 0 0 0 6.5 0l2-2a4.6 4.6 0 0 0-6.5-6.5l-1.2 1.2"/><path d="M13.8 10.2a4.6 4.6 0 0 0-6.5 0l-2 2a4.6 4.6 0 0 0 6.5 6.5l1.2-1.2"/>`,
    ),
    image: svg(
      `<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="m5.6 17 4.2-4.2a2 2 0 0 1 2.8 0l4 4M14 14.6l1.5-1.5a2 2 0 0 1 2.8 0l1.5 1.5"/>`,
    ),
    code: svg(`<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.4 5.4l-2.8 13.2"/>`),
    copy: svg(
      `<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2.6"/><path d="M15.6 8.4V6.8A2.4 2.4 0 0 0 13.2 4.4H6.8a2.4 2.4 0 0 0-2.4 2.4v6.4a2.4 2.4 0 0 0 2.4 2.4h1.6"/>`,
    ),
    check: svg(`<path d="m5 12.4 4.3 4.3L19 6.9"/>`),
    pin: svg(
      `<path d="M9.2 3.8h5.6l-.8 5 3.4 2.9v1.9H6.6v-1.9l3.4-2.9-.8-5Z"/><path d="M12 13.6V20"/>`,
    ),
    trash: svg(
      `<path d="M4.6 6.6h14.8M9.4 6.6V4.8h5.2v1.8M6.6 6.6l.9 12a2 2 0 0 0 2 1.9h5a2 2 0 0 0 2-1.9l.9-12M10.2 10.4v6M13.8 10.4v6"/>`,
    ),
    spark: svg(`<path d="M12 3.4c.6 4.3 2.3 6 6.6 6.6-4.3.6-6 2.3-6.6 6.6-.6-4.3-2.3-6-6.6-6.6 4.3-.6 6-2.3 6.6-6.6Z"/>`),
    alert: svg(`<path d="M12 4.6 2.9 20h18.2L12 4.6Z"/><path d="M12 9.6v4.2M12 17.2v.1"/>`),
    pause: svg(`<path d="M9 5.6v12.8M15 5.6v12.8"/>`),
    play: svg(`<path d="M8 5.4 18.4 12 8 18.6V5.4Z"/>`),
    clock: svg(`<circle cx="12" cy="12" r="8"/><path d="M12 7.6V12l3 1.8"/>`),
    edge: svg(`<path d="M3.6 7.5h16.8M12 7.5v11M8.4 14.7 12 18.3l3.6-3.6"/>`),
    corner: svg(`<path d="M4 4h7M4 4v7"/>`),
  };
})();
