# “Solution” to Connect WebGL Visuals to Multiple DOM Elements with One Canvas - Without Scroll-Jacking

**TL;DR:** An imperfect solution. One that creates another issue, but it's a problem we can mitigate.

👉 [Live Demo](https://webgl-scroll-sync.lusion.co/)

---

In the world of web development, it's basically gospel that scroll-jacking is bad. If you're a developer who hasn't worked much with WebGL or animation-heavy interactions, you might wonder why so many award-winning websites (like our own at [Lusion](https://lusion.co)) seem to always be scroll-jacked.

The truth is, aside from the aesthetic of smooth scrolling, scroll-jacking actually solves a key synchronization issue - especially on mobile. The problem? Native scrolling doesn’t run on the same thread as `requestAnimationFrame (rAF)`. Since WebGL rendering relies on `rAF` to keep visuals smooth and efficient, this desync causes issues.

---

## The Problem

Let’s say you want to render a 3D box inside a DOM element - maybe a `<div>`. The obvious approach: create a WebGL canvas and place it inside that div. Done, right?

Not quite.

The problem is:

-   You can’t have infinite WebGL contexts on a single page.
-   Resources can’t be shared across different contexts.
    (👀 Looking at you, WebGPU…)
-   You can't apply shader effect outside that DOM element area.

A better approach is to create a single fullscreen WebGL canvas, fixed to the viewport, and render everything there. Then, during each `rAF`, you get the bounding box of your DOM elements and scroll position (`window.scrollY`) to position your 3D objects accordingly.

But here comes the kicker:
If the scroll happens between two `rAF` calls, the canvas doesn’t get the updated scroll info in time - so your visuals start drifting, lagging behind where they’re meant to be.

This is why scroll-jacking became the go-to workaround. It gives you full control over the scroll timing, which helps ensure the WebGL visuals stay in sync with your DOM elements.

---

## A “New” (but kinda overlooked) Approach

Here’s an idea that I haven’t seen many used - and it's super simple:

**What if the WebGL canvas isn't fixed to the viewport?**

Wait, what?

Yeah - instead of setting the canvas `position: fixed` and pinning it behind everything, let it scroll with the page. Set it to `position: absolute`, and during each `rAF`, offset the canvas to match the current scroll position.

At first glance, it sounds like the same thing. But here’s the difference:
If the scroll happens between two `rAF`s, the canvas will physically scroll _with_ the page, keeping your 3D visuals attached to the DOM elements they’re linked to. No drift.

Pretty cool, right?

---

## The Tradeoff (and Fix)

There is a catch:
Since the canvas now scrolls, it may get clipped when parts of the viewport move outside the canvas bounds. You’ll notice some visual issues during fast scrolls.

But this can be mitigated:

-   Simply add **vertical padding** to your canvas - render extra pixels offscreen. In our demo, we added 25% top and bottom padding to the canvas.
-   Or, for better performance, render to a **fullscreen framebuffer** and apply **edge blending or fading** to mask the overflow areas.

Of course, this isn't free. You'll be rendering more pixels, which can be a concern depending on performance requirements. But in many use cases, it’s a totally acceptable tradeoff. The bottm-line to us is that drifting is visually distributing but clipping isn't, so you can based on your needed to apply different fixes to this solution.

---

## In Summary

This approach won’t magically fix the `rAF` desync problem - but it offers a neat workaround for keeping WebGL visuals visually in sync with DOM elements, _without_ scroll-jacking.

It's not perfect, but sometimes, "good enough" is what gets the job done.

**Hope you find this useful!**

---

## How to Use This Demo

Clone the repo and run it locally:

```bash
# Clone the repo
git clone https://github.com/lusionltd/WebGL-Scroll-Sync
cd WebGL-Scroll-Sync

# Install dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build
```

Explore the source code in the `/src` folder to see how the WebGL canvas is managed and synced with DOM elements.

---

## GSAP Integration

This demo also shows how to wire [GSAP](https://gsap.com) (with ScrollTrigger) into the same WebGL/DOM sync setup described above, without reintroducing the scroll/rAF desync the rest of this repo works around.

### Decisions

**GSAP never touches Three.js objects directly - it tweens plain "proxy" objects that the render loop reads.**
There's no official GSAP/Three.js binding, so the pattern is: create a plain object like `{ value: 0 }`, `gsap.to()` it, and read `.value` inside your own `animate()` loop to feed it into a uniform, position, etc. `introStrengthProxy` in `main.js` is one; each mesh's `u_progress` uniform (a plain object itself) is tweened the same way for Case 2.

**The GSAP-driven intro pulse gets its own uniform (`u_intro`), not a share of `u_strength`.**
`updateStrength()` already writes to `u_strength` every frame based on scroll speed, so tweening `u_strength` directly from GSAP would just get overwritten on the next frame. The first attempt added the proxy into `u_strength` instead - but scroll alone already saturates that uniform's visual effect, so the pulse was invisible precisely when its ScrollTrigger fires (mid-scroll). When GSAP and per-frame code fight over one value, giving the GSAP effect a dedicated channel is cleaner than arithmetic tricks to share one.

**GSAP effects layered on an already-animated shader must be visually distinct from what the shader does on its own.**
The first version of the scroll reveal reused the shader's existing band-glitch, just stronger. It worked (verified via `onUpdate` logs), but was invisible in practice: the demo already glitches proportionally to scroll speed, so the reveal was masked by the very effect it imitated - you scroll to see it, and scrolling triggers the lookalike. The reveal became a curtain wipe instead, which nothing else in the demo resembles.

**The render loop is driven by `gsap.ticker`, not its own `requestAnimationFrame`.**
Originally `animate()` scheduled itself via `requestAnimationFrame`. That's a second, independent rAF loop running alongside GSAP's own internal ticker (which also drives ScrollTrigger's scrub updates). Two independent loops can land on different frames, which is exactly the kind of one-frame drift this whole repo exists to avoid - just moved from "scroll vs. render" to "GSAP vs. render". Calling `gsap.ticker.add(animate)` instead makes the Three.js render happen on the same tick as every GSAP/ScrollTrigger update.

**`scrub` for continuous WebGL uniforms, `toggleActions` for discrete DOM reveals.**
Case 2 uses `scrub: true` because the shader effect should track the scrollbar position 1:1, with no animation duration of its own. Case 3 uses `toggleActions: 'play none none reverse'` because a text reveal is a one-shot animation with its own easing/duration - `scrub` would make it feel like it's dragging behind the mouse/trackpad instead of playing.

**Everything animated goes through `gsap.matchMedia()` gated on `prefers-reduced-motion`.**
Users who set this OS-level preference get the fully revealed end state immediately (`u_progress = 1`, `introStrengthProxy.value = 0`) instead of the animated version.

**CSS colors passed into raw `ShaderMaterial`s must skip three.js's color-space conversion.**
`u_bgColor` is read from the CSS variable `--color-background` so the wipe cover and the intro noise match the page exactly. By default `THREE.Color.setStyle()` converts sRGB to linear, but a raw `ShaderMaterial` writes `gl_FragColor` without the inverse transform - so the converted maroon rendered as near-black, and the intro pulse ended with a visible snap from black to the real background. Passing `THREE.LinearSRGBColorSpace` as the color space (`setStyle(css, THREE.LinearSRGBColorSpace)`) stores the raw value and makes the shader output match the CSS pixel-for-pixel.

### Cases

**Case 1 - Intro pulse (`setupIntroPulse`, proxy tween).**
On page load, `introStrengthProxy.value` tweens from `1` to `0` over 1.4s; the render loop copies it into `u_intro` each frame. A one-shot WebGL effect needs a surface that is actually visible when it fires, and at load every image mesh is covered by its Case 2 wipe or offscreen - so `u_intro` drives a dedicated fullscreen noise quad (`introNoise.frag`, drawn behind the images with `renderOrder = -1` and hidden again once the pulse settles): the whole canvas loads as TV static and resolves to the flat background. Any partially revealed image also gets a horizontal RGB channel split (chromatic aberration) from the same uniform - deliberately unlike the demo's own vertical band glitch so it stays readable mid-scroll.

**Case 2 - Per-image reveal on scroll (`setupImageRevealOnScroll`, ScrollTrigger scrub).**
Each image gets its own `ScrollTrigger` (`trigger: item.domContainer`) tweening its `u_progress` uniform from `0` to `1` as it moves from the bottom of the viewport to the center. The fragment shader (`img.frag`) turns that into a bottom-to-top curtain wipe with a per-band torn edge and a bright scanline at the reveal boundary (both fade out as the wipe completes). Nothing here is read back into JS - GSAP writes straight into the Three.js uniform object every tick.

**Case 3 - DOM-only timeline (`setupTextRevealTimeline`, `#section05`).**
A `gsap.timeline()` with `toggleActions` fades in the heading and description in `#section05`, no canvas involved at all. This is here to show that ordinary DOM animation and the WebGL cases above can live on the same page without any special coordination - they're both just reading the same scroll position, each in the way that suits what they're animating.

### Files Involved

-   `src/js/main.js` - GSAP/ScrollTrigger setup (`setupGsapAnimations` and the three `setup*` case functions), the `gsap.ticker`-driven render loop, and the proxy-to-uniform plumbing in `updateUniforms()`.
-   `src/shaders/img.frag` - Case 2 curtain wipe (`u_progress`) and the Case 1 RGB split on revealed images (`u_intro`).
-   `src/shaders/introNoise.vert` / `introNoise.frag` - the Case 1 fullscreen noise quad.
-   `src/index.html` / `src/css/style.css` - the Case 3 `#section05` markup and styles.

---

## Contribution

We don't expect any contribution to this repo as it is just a demo.

---

## License

MIT License.
