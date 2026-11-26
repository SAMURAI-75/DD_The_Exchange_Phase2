# Tiny Terra 🌍

## Team Name
RuReSa

Members: Renya, Sriya

## Track Number & Name
Track IV: Living Worlds & Simulations

## Problem Statement Name
Tiny Terra

## Idea
Tiny Terra is a miniature planet generator. Type any seed and it creates a unique world with oceans, mountains, forests, deserts and snowy regions, which you can explore as a rotating 3D globe or a flat 2D map, with a moving day-and-night cycle. Sliders for temperature, water level, moisture and terrain roughness reshape the planet live, so you can see how a hot planet becomes a desert world or a cold one freezes over. To make every planet feel different, it has three world themes (Earth, Candy, Alien), themed creatures living in each biome, a side-view landscape preview of any spot, and "Creature Catcher", a mini-game where you fly around the planet catching creatures in daylight, with sound effects.

## How to Run

### Prerequisites
- Any modern web browser (Chrome, Edge, Firefox or Safari).
- Optional: Python 3, only if you prefer to run a local server.
- No internet, API keys or package installs needed.

### Installation
No installation is needed. The project is plain HTML, CSS and JavaScript with no dependencies.

### Commands to run locally
```bash
git clone https://github.com/renyapeter/RRS_The_Exchange.git
cd RRS_The_Exchange
```
Then either open the page directly:
```bash
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```
or run a local server:
```bash
python3 -m http.server 8000
```
and visit http://localhost:8000

---


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
- **🔊 Sound effects**, synthesised live with the Web Audio API (no audio files): generate whoosh, a theme chime for each world, inspect blip, catch jingles that rise in pitch for rarer creatures, a buzz for sleeping creatures, a countdown tick in the last 5 seconds, game start and game over fanfares, a camera shutter on Save PNG, and soft UI clicks. The 🔊/🔇 button mutes them, and the setting is remembered.
- **🎮 Creature Catcher mini-game:** fly a themed craft (✈️ plane on Earth, 🍭 lollipop plane on Candy, 🛸 UFO on Alien) with **arrow keys / WASD**, or the on-screen D-pad for touch and mouse. The planet turns beneath you. You have 60 seconds to catch creatures under your craft. Creatures on the **night side are asleep 💤 and can't be caught**, so you have to chase the daylight. Rare creatures are worth 2, ⭐ is worth 5, and your best score is saved. Press **Esc** to quit.
- **Themed wildlife** lives on the planet, matched to each biome: whales in the ocean, camels in deserts and penguins on ice on Earth; gummy bears, unicorns and cupcakes on Candy; aliens, octopi and invaders on Alien. They doze and dim at night.
- **Landscape preview:** clicking a spot draws a side-on scene of the terrain there, using the real elevation profile, sea level, biome colours, themed plants and creatures, and a day or night sky with the sun or moon.
- **World themes: 🌍 Earth / 🍭 Candy / 👽 Alien.** The same terrain and climate rules, dressed as different worlds. Candy turns seas into strawberry milk, mountains into chocolate and snow into whipped cream. Alien has acid seas, fungal forests and obsidian spires. Biome names in the legend and inspector, clouds, city lights and the atmosphere glow all change with the theme. The theme is saved in share links.
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
js/sound.js    Web Audio synthesised sound effects + mute
js/life.js     creatures, landscape preview, Creature Catcher game
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
