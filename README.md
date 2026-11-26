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
- **☄️ Disasters (Earth theme):** pick an asteroid, earthquake, tsunami, volcano or wildfire, set its strength, press **Arm**, then click anywhere on the planet. You get an animated impact, a scar on the surface (crater, ash, flood mud or burn) and a **disaster report** with deaths (and % of the world), injured, displaced, km² affected, animals and species hit, environmental effects, global effects and **recovery time**. Large asteroids and super-volcanoes cause an **impact winter** that cools the whole planet (the temperature slider drops and ice spreads). **⏩ Simulate recovery** animates the planet healing year by year. Figures come from simplified models, for illustration.
- **👥 Population:** each planet gets a population (about 8 billion on an Earthlike world), concentrated in temperate, low, habitable regions. The inspector shows how many people live at the clicked spot.
- **☀️ Visible sun and planet clock:** a glowing sun shows where light comes from, and a clock shows the day number, local time at the view centre and the season.
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
js/disasters.js disaster models, impact report, recovery
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

---

## Phase 2 additions (team Ding Ding)

- **18 bugs fixed** (bug report on the original version with screenshots: `Phase2_Report/Phase2_Bug_Report_Original.docx`; fixes and re-tests: `Phase2_Report/Phase2_Fixes_and_Retests.docx`), including a share link that crashed the whole app.
- **New look:** Apple-style frosted-glass panels floating over a full-screen starfield; sharper globe with ocean glint and atmosphere; a real sun (corona, rays, lens flare, eclipse halo).
- **🌍 Real Earth:** one click loads the real planet: NASA Blue Marble satellite imagery, NASA Black Marble night lights, real elevation (mountains are cold), and all 177 Natural Earth countries with real borders, populations and income levels, plus ~130 major cities. Search any country or city (e.g. *Bangalore*): the globe flies there and a card shows weather, population, how people feel, public approval, economy, crops, fresh water, wars and public opinion of other nations, seeded from real alliances (NATO, EU, CSTO, US partners, the Russia–China axis) and real rivalries (India–Pakistan, the two Koreas, Saudi Arabia–Iran, Russia–Ukraine, …). Disputed territories are labelled as disputed.
- **Nations everywhere:** generated planets get their own named nations.
- **⚔️ War:** pick two nations. Fronts burn, casualties mount, governments get a rally then war-weariness. Every other nation takes a stance (neutral, backs a side, or joins the fight) based on alliances, neighbours and opinion, and you can change any country's stance from its card.
- **🧪 Pandemic lab:** design a pathogen (type, R₀, lethality, cure difficulty, air/land/water spread), release it anywhere and watch it spread while countries respond with masks, lockdowns and vaccines.
- **⏩ Time & human impact:** fast-forward to watch population-driven warming, drying, deforestation, extinctions and lost wildlife.
- **☄️ End of the world:** meteor storm, planet collision, the sun going supernova, or a black hole.
- **Close-ups:** clicking a spot shows a real photo of what is happening there (war, outbreak, flood, wildfire, eruption, earthquake, impact crater, drought, molten planet), otherwise a smoothed landscape view.
- **♻️ The Great Reset** puts everything (sliders, switches, wars, plagues, disasters, time) back to normal; a splash screen plays on every load.
- Candy and Alien themes removed.

### Data credits
- Satellite imagery: NASA Earth Observatory, Blue Marble and Black Marble (public domain), via the three-globe example images.
- Country borders, populations, income groups: Natural Earth 1:110m Admin 0 (public domain).
All of it is bundled in `js/earth-data.js` and `js/earth-tex.js`, so the project still runs offline with no server.

### Close-up photos (Wikimedia Commons)
- `assets/scenes/drought.jpg`: "California Drought Dry Lakebed 2009.jpg" by National Oceanic and Atmospheric Administration, Public domain (https://commons.wikimedia.org/wiki/File:California_Drought_Dry_Lakebed_2009.jpg)
- `assets/scenes/quake.jpg`: "2023 Turkey Earthquake Damage 4.jpg" by VOA, Public domain (https://commons.wikimedia.org/wiki/File:2023_Turkey_Earthquake_Damage_4.jpg)
- `assets/scenes/war.jpg`: "Destroyed buildings in Mekelle, Tigray (2022).jpg" by Mulugeta Atsbeha, Public domain (https://commons.wikimedia.org/wiki/File:Destroyed_buildings_in_Mekelle,_Tigray_(2022).jpg)
- `assets/scenes/flood.jpg`: "Flood water in Cumberland Street - geograph.org.uk - 8195991.jpg" by DS Pugh, CC BY-SA 2.0 (https://commons.wikimedia.org/wiki/File:Flood_water_in_Cumberland_Street_-_geograph.org.uk_-_8195991.jpg)
- `assets/scenes/fire.jpg`: "Lick Fire on the Umatilla National Forest burning at night.jpg" by U.S. Forest Service- Pacific Northwest Region, Public domain (https://commons.wikimedia.org/wiki/File:Lick_Fire_on_the_Umatilla_National_Forest_burning_at_night.jpg)
- `assets/scenes/volcano.jpg`: "Fimmvorduhals second fissure 2010 04 02.JPG" by Boaworm, CC BY 3.0 (https://commons.wikimedia.org/wiki/File:Fimmvorduhals_second_fissure_2010_04_02.JPG)
- `assets/scenes/impact.jpg`: "Meteor Crater - Arizona.jpg" by National Map Seamless Server, Public domain (https://commons.wikimedia.org/wiki/File:Meteor_Crater_-_Arizona.jpg)
- `assets/scenes/plague.jpg`: "Pandemic masks NYC.jpg" by Shanluan, CC BY-SA 4.0 (https://commons.wikimedia.org/wiki/File:Pandemic_masks_NYC.jpg)
- `assets/scenes/lava.jpg`: "Pāhoehoe Lava flow.JPG" by Brocken Inaglory, CC BY-SA 3.0 (https://commons.wikimedia.org/wiki/File:P%C4%81hoehoe_Lava_flow.JPG)
