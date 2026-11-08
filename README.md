# Usmani Cricket Academy website

Two design options for the Usmani Cricket Academy (Bahria Town Karachi) website.

| Folder | Design |
|---|---|
| `public_html/` | **Version 1:** academy brand colours (red, orange, black) with a 3D cricket ball hero |
| `public_html_v2/` | **Version 2, "Under the Lights":** night-match look with a scroll-driven 3D floodlit stadium |

Each folder is a complete site: plain HTML, CSS and JavaScript, with Three.js and GSAP loaded from a CDN. There is no build step.

## Previewing

The GitHub Pages link opens a page that links to both designs. Everything works there except the registration form, because GitHub Pages can't run PHP.

## Deploying to a LAMP server

Upload the contents of **one** folder into the server's web root (usually `public_html`). Then:

1. In `register.php`, set `REGISTRATION_FROM` to an email address on the site's own domain.
2. Make sure the `data/` folder is writable by the web server. Registrations are saved to `data/registrations.csv`, which `data/.htaccess` keeps private, and are also emailed to the academy.
