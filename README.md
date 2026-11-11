# Emirates Business Club — V2

A static site. No build step: open the folder in VS Code and press **Go Live**, or push the folder to GitHub Pages as it is.

## Things to fill in later

All three live in `js/config.js`:

| Setting | What to paste |
| --- | --- |
| `FORM_ENDPOINT` | Your Formspree URL, e.g. `https://formspree.io/f/abcdwxyz`. Until then the questionnaire works but sends nothing. |
| `APP_STORE_URL` | The App Store link. Until then the button is a greyed-out placeholder. |
| `GOOGLE_PLAY_URL` | The Google Play link. Same as above. |

## Where things are

- `index.html` — all the page text. Elements carry `data-i18n` keys ready for a language switcher.
- `css/style.css` — colours, type and layout. The palette is at the top under `:root`.
- `js/scene.js` — the gold particle scene (globe, flight arcs, skyline, network, logo).
- `js/main.js` — loader, smooth scrolling, scroll story and reveals.
- `js/form.js` — the join questionnaire. The industry list is at the top.
- `assets/img` — compressed photos, the wordmark and favicon.
- `assets/data` — the world map, skyline and logo masks the particles are placed from.
- `vendor/` — Three.js, GSAP and Lenis, stored locally so the site has no outside dependencies.

## Testing the scene quality

The site picks a lighter version of the scene on phones and low-power devices.
Add `?quality=high` or `?quality=low` to the address to force one or the other.
