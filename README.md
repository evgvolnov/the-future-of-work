# The Future Of Work Map

Interactive knowledge map for future-of-work concepts, semantic links, evidence fragments, and source metadata.

## Files

- `index.html` - static page entry point.
- `styles.css` - visual system and responsive layout.
- `app.js` - graph rendering, filters, details panel, and interactions.
- `graph-data.js` - exported taxonomy data used by the frontend.

## Deployment

This project is a static site. It can be published with GitHub Pages from the repository root.

PDF source links are intentionally not published as local `file://` paths. Add public source URLs in the taxonomy database and regenerate `graph-data.js` to make PDF sources clickable.
