# Tiny Terra 🌍

**Track IV: Living Worlds & Simulations, problem statement "Tiny Terra"**

A planet generator that builds miniature worlds from a seed. You can see each planet as a rotating 3D globe or a flat 2D map, watch day and night sweep across it, and reshape its climate live.

## Run it

No install, no build, no internet, no API keys.

1. Open `index.html` in any modern browser (Chrome, Edge, Firefox), **or**
2. Serve the folder: `python -m http.server 8000`, then open <http://localhost:8000>

## Features

### Required by the brief
| Requirement | Where |
|---|---|
| Oceans, mountains, forests, deserts, snowy regions | 13 biomes: deep ocean, ocean, shallow sea, sea ice, beach, desert, grassland, savanna, forest, rainforest, tundra, snow & ice, mountain rock |
| Placement follows generation rules | Elevation from layered 3D simplex noise. Temperature from latitude and altitude (lapse rate). Moisture from noise, with a subtropical dry belt near 25°, like Earth's Hadley cells |
| New planets from random seeds | Seed box, the 🎲 button, or press **R**. The same seed always gives the same planet |
| 2D map **and** rotating globe | 🌍 Globe / 🗺️ Map toggle (keys **G** / **M**). Drag the globe to spin and tilt it |
| Day-and-night cycle | The sun moves across the surface, with a soft terminator line, a twilight glow and seasons from axial tilt |
| Temperature, water level, terrain variation | Sliders for temperature (±30 °C), ocean coverage (5–95% of surface area), terrain roughness, and moisture as an extra |
| Hot → deserts, cold → snow | Climate is recalculated live as you drag a slider |

### Extras
- **Warming time-lapse:** sweeps the global temperature from −25 °C to +25 °C. Ice caps retreat, deserts spread and, with "melting ice raises sea level" on, coastlines flood.
- **City lights** glow on the night side wherever land is temperate, low and habitable.
- **Drifting cloud layer.**
- **Location inspector:** click any point to see its biome, coordinates, altitude or depth, temperature, moisture, settlements and day/night.
- **Planet census:** area-weighted coverage of each biome, average temperature, habitable %, and an automatic planet class (Ice World, Desert World, Garden World, …).
- **Procedural planet name** made from the seed.
- **Shareable links:** the seed and every slider value are stored in the URL. 🔗 Copy link, or paste a link or a bare seed into "Load".
- **Presets:** Earthlike, Ice Age, Hothouse, Water World, Dune, Jungle.
- **📸 Save PNG** of the current view.
- **Clickable biome legend:** click a biome to highlight everywhere it occurs; other areas go grey.
- **Scroll-wheel zoom** on the globe.
- **Axial tilt slider (0–60°):** controls how strongly the seasons swing the day/night line.
- **Saved planets gallery:** save favourites with thumbnails, click one to reload it, × to remove. Stored in your browser, up to 12.
- Keyboard shortcuts: **Space** pause, **R** random, **G/M** globe or map.

## How it works

```
js/noise.js    seeded PRNG (cyrb53 hash -> mulberry32) + 3D simplex noise + fBm
js/planet.js   generate(): noise fields; classify(): climate -> biome -> colour -> stats
js/render.js   software renderer: orthographic globe via per-pixel lookup table, map view, lighting
js/app.js      UI, animation loop, inspector, presets, time-lapse, share links
```

- **No seams:** noise is sampled on the 3D unit sphere, not on the 2D map, so nothing breaks at the date line or pinches at the poles.
- **Two-stage pipeline:** the expensive noise generation runs only when the seed or roughness changes. Climate sliders re-run only the cheap classification pass, so they respond in real time.
- **True ocean coverage:** sea level comes from an area-weighted elevation histogram, with rows weighted by cos(latitude). "60% ocean" therefore means 60% of the planet's surface, not 60% of map pixels.
- **Fast globe:** for each screen pixel the renderer precomputes latitude and base longitude, rebuilt only when the tilt changes. Spinning the globe is then just a longitude offset per pixel.

## Robustness
- An empty or whitespace-only seed shows an error instead of generating. Seeds are trimmed and capped at 40 characters.
- Values loaded from a link are validated and clamped to the slider ranges. Bad links show a message instead of crashing.
- A newer generate request cancels an older one that hasn't finished.
- Frame time is clamped, so switching tabs doesn't make the simulation jump.
- Clipboard and download failures fall back gracefully.
