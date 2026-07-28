import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import vertexShader from '../shaders/img.vert?raw';
import fragmentShader from '../shaders/img.frag?raw';
import introNoiseVertexShader from '../shaders/introNoise.vert?raw';
import introNoiseFragmentShader from '../shaders/introNoise.frag?raw';

gsap.registerPlugin(ScrollTrigger);

// DOM elements
const domWrapper = document.getElementById('wrapper');
let canvas;

// Three.js core objects
let scene;
let camera;
let renderer;
let geometry;
let introNoiseMesh;

// State variables
let time = 0;
let padding = 0;
let isNoFix = false;
let isFixedWithPadding = false;
let viewportWidth;
let viewportHeight;
let prevScrollY = 0;
let strength = 0;

// Case 1 proxy: a plain object GSAP can tween, added on top of the scroll-driven
// `strength` above instead of replacing it — both want to drive the same uniform
// each frame, so they're combined rather than one overwriting the other.
// Starts at 0 so nothing pulses until its ScrollTrigger fires.
const introStrengthProxy = { value: 0 };

// Environment variables
const dpr = window.devicePixelRatio;
let colorBackground;

// Uniform variables for shaders
const resolution = new THREE.Vector2(1, 1);
const scrollOffset = new THREE.Vector2(0, 0);
const sharedUniforms = {
	u_resolution: { value: resolution },
	u_scrollOffset: { value: scrollOffset },
	u_time: { value: 0 },
	u_strength: { value: 0 },
	// Case 1 channel: fed from introStrengthProxy each frame in updateUniforms()
	u_intro: { value: 0 },
	// Page background color for the Case 2 curtain wipe; set from the CSS variable in init()
	u_bgColor: { value: new THREE.Color(0, 0, 0) },
};

// Items tracking
const itemList = [];

/**
 * Initialize the application
 */
function init() {
	colorBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-background');
	// Declare the style as linear so three.js skips its sRGB→linear conversion: the raw
	// ShaderMaterials here write gl_FragColor without the inverse transform, so a converted
	// value would render far darker than the CSS background (near-black instead of maroon).
	sharedUniforms.u_bgColor.value.setStyle(colorBackground.trim(), THREE.LinearSRGBColorSpace);

	// Set up Three.js scene
	setupThreeJS();

	// Create meshes for all images
	createImageMeshes();

	// Set up event listeners
	setupEventListeners();

	// Wire up GSAP tweens and ScrollTriggers (see README for the reasoning behind each case)
	setupGsapAnimations();

	// Initialize state
	time = performance.now() / 1000;
	prevScrollY = window.scrollY;

	// Start animation loop. Using gsap.ticker instead of our own requestAnimationFrame call
	// means the Three.js render always happens in the same tick as GSAP/ScrollTrigger updates -
	// two independent rAF loops here would reintroduce the exact one-frame drift this repo exists to avoid.
	gsap.ticker.add(animate);

	console.log(
		// credit
		'%c Created by Lusion: https://lusion.co/',
		'border:2px solid gray; padding:5px; font-family:monospace; font-size:11px;',
	);
}

/**
 * Set up Three.js scene, camera and renderer
 */
function setupThreeJS() {
	canvas = document.querySelector('#canvas');
	scene = new THREE.Scene();
	camera = new THREE.Camera();
	renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(colorBackground);
	geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

	// Case 1 surface: fullscreen noise quad drawn behind the images. At page load
	// the image meshes are covered or offscreen, so the intro pulse needs a surface
	// of its own that is guaranteed visible.
	introNoiseMesh = new THREE.Mesh(
		new THREE.PlaneGeometry(2, 2, 1, 1),
		new THREE.ShaderMaterial({
			uniforms: {
				u_intro: sharedUniforms.u_intro,
				u_time: sharedUniforms.u_time,
				u_bgColor: sharedUniforms.u_bgColor,
			},
			vertexShader: introNoiseVertexShader,
			fragmentShader: introNoiseFragmentShader,
			depthTest: false,
			depthWrite: false,
		}),
	);
	introNoiseMesh.renderOrder = -1;
	introNoiseMesh.frustumCulled = false;
	scene.add(introNoiseMesh);
}

/**
 * Create meshes for all image containers
 */
function createImageMeshes() {
	const domImageContainerList = document.querySelectorAll('.image');
	const textureLoader = new THREE.TextureLoader();

	for (let i = 0; i < domImageContainerList.length; i++) {
		const domContainer = domImageContainerList[i];
		const mesh = new THREE.Mesh(
			geometry,
			new THREE.ShaderMaterial({
				uniforms: {
					u_texture: { value: textureLoader.load(`/images/${i}.webp`) },
					u_domXY: { value: new THREE.Vector2(0, 0) },
					u_domWH: { value: new THREE.Vector2(1, 1) },
					u_resolution: sharedUniforms.u_resolution,
					u_scrollOffset: sharedUniforms.u_scrollOffset,
					u_time: sharedUniforms.u_time,
					u_strength: sharedUniforms.u_strength,
					u_intro: sharedUniforms.u_intro,
					u_bgColor: sharedUniforms.u_bgColor,
					u_rands: { value: new THREE.Vector4(0, 0, 0, 0) },
					u_id: { value: i },
					// Case 2: driven exclusively by a ScrollTrigger scrub tween, never touched in the rAF loop.
					u_progress: { value: 0 },
				},
				vertexShader,
				fragmentShader,
				side: THREE.DoubleSide,
			}),
		);

		itemList.push({
			domContainer,
			mesh,
			width: 1,
			height: 1,
			x: 0,
			top: 0,
		});

		scene.add(mesh);
		mesh.frustumCulled = false;
	}
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
	// Resize events
	window.addEventListener('resize', onResize);
	if (window.ResizeObserver) {
		new ResizeObserver(onResize).observe(domWrapper);
	}

	// Overlay toggle
	setupOverlayEvents();

	// Settings panel
	setupSettingsEvents();
}

/**
 * Set up overlay toggle events
 */
function setupOverlayEvents() {
	let aboutToggle = false;

	document.getElementById('overlay-open').addEventListener('click', () => {
		aboutToggle = !aboutToggle;
		document.documentElement.classList.toggle('is-overlay-active', aboutToggle);
	});

	document.getElementById('overlay-close').addEventListener('click', () => {
		aboutToggle = false;
		document.documentElement.classList.toggle('is-overlay-active', aboutToggle);
	});
}

/**
 * Set up settings panel events
 */
function setupSettingsEvents() {
	document.querySelector('#settings__button').addEventListener('click', () => {
		document.querySelector('#settings').classList.toggle('is-active');
	});

	document.querySelectorAll('#settings__items li').forEach((li) => {
		li.addEventListener('click', () => {
			document.querySelectorAll('#settings__items li').forEach((item) => {
				item.classList.remove('is-active');
			});

			li.classList.add('is-active');

			isNoFix = li.dataset.noFix === '1';
			isFixedWithPadding = li.dataset.fixedWithPadding === '1';
			document.documentElement.classList.toggle('no-fix', isNoFix);
			onResize();

			document.querySelector('#settings').classList.toggle('is-active', false);
		});
	});
	document.querySelectorAll('#settings__items li')[0].click();
}

/**
 * Handle resize events
 */
function onResize() {
	padding = isFixedWithPadding && !isNoFix ? 0.25 : 0;

	viewportWidth = domWrapper.clientWidth;
	viewportHeight = window.innerHeight;

	const canvasHeight = viewportHeight * (1 + padding * 2);

	resolution.set(viewportWidth, canvasHeight);

	renderer.setSize(viewportWidth * dpr, canvasHeight * dpr);
	canvas.style.width = `${viewportWidth}px`;
	canvas.style.height = `${canvasHeight}px`;

	scrollOffset.set(window.scrollX, window.scrollY);

	updateItemPositions();
}

/**
 * Update item positions and dimensions
 */
function updateItemPositions() {
	for (let i = 0; i < itemList.length; i++) {
		const item = itemList[i];
		const rect = item.domContainer.getBoundingClientRect();

		item.width = rect.width;
		item.height = rect.height;
		item.x = rect.left + scrollOffset.x;
		item.y = rect.top + scrollOffset.y;

		item.mesh.material.uniforms.u_domWH.value.set(item.width, item.height);
	}
}

/**
 * Wire up every GSAP case. Wrapped in gsap.matchMedia() so prefers-reduced-motion
 * users get the end state instantly instead of the animated versions.
 */
function setupGsapAnimations() {
	const mm = gsap.matchMedia();

	mm.add('(prefers-reduced-motion: reduce)', () => {
		introStrengthProxy.value = 0;
		itemList.forEach((item) => {
			item.mesh.material.uniforms.u_progress.value = 1;
		});
	});

	mm.add('(prefers-reduced-motion: no-preference)', () => {
		setupIntroPulse();
		setupImageRevealOnScroll();
		setupTextRevealTimeline();
	});
}

/**
 * Case 1 — Proxy tween: GSAP never touches Three.js directly, it tweens a plain
 * object (`introStrengthProxy`) that the rAF loop reads each frame in updateUniforms().
 * This is the general pattern for animating anything WebGL-related with GSAP.
 */
function setupIntroPulse() {
	// Fires at page load. The fullscreen noise quad guarantees the pulse is visible
	// even though every image mesh is covered by its Case 2 wipe (or offscreen) at
	// that moment; images that ARE partially revealed also get the RGB split.
	gsap.fromTo(introStrengthProxy, { value: 1 }, { value: 0, duration: 1.4, ease: 'power3.out' });
}

/**
 * Case 2 — ScrollTrigger scrub per item: each image's u_progress uniform is tied
 * to its own scroll range with `scrub: true`, so it reveals in lockstep with the
 * scrollbar instead of on a fixed-duration timer. No onUpdate/manual reads needed -
 * GSAP writes item.mesh.material.uniforms.u_progress.value directly every tick.
 */
function setupImageRevealOnScroll() {
	itemList.forEach((item) => {
		gsap.fromTo(
			item.mesh.material.uniforms.u_progress,
			{ value: 0 },
			{
				value: 1,
				ease: 'none',
				scrollTrigger: {
					trigger: item.domContainer,
					start: 'top bottom',
					end: 'top center',
					scrub: true,
				},
			},
		);
	});
}

/**
 * Case 3 — Plain DOM timeline with toggleActions instead of scrub: proves the
 * canvas-based cases above and ordinary DOM animation can share the same page
 * without any special coordination, since both read from the same scroll position.
 */
function setupTextRevealTimeline() {
	gsap.timeline({
		scrollTrigger: {
			trigger: '#section05',
			start: 'top 80%',
			toggleActions: 'play none none reverse',
		},
	})
		.from('#section05__title', { autoAlpha: 0, y: 40, duration: 0.8, ease: 'power3.out' })
		.from('#section05__description', { autoAlpha: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.4');
}

/**
 * Animation loop
 */
function animate() {
	const scrollY = window.scrollY;
	const scrollDelta = scrollY - prevScrollY;

	// Calculate time delta
	const newTime = performance.now() / 1000;
	const dt = newTime - time;
	time = newTime;

	// Update animation strength based on scroll speed
	updateStrength(scrollDelta, dt);

	// Update uniform values
	updateUniforms(dt, scrollY);

	// Position canvas based on scroll
	updateCanvasPosition();

	// Update and optimize mesh visibility
	updateMeshes(dt);

	// Render the scene
	renderer.render(scene, camera);

	prevScrollY = scrollY;
}

/**
 * Update animation strength based on scroll speed
 */
function updateStrength(scrollDelta, dt) {
	const targetStrength = (Math.abs(scrollDelta) * 10) / viewportHeight;

	strength *= Math.exp(-dt * 10);
	strength += Math.min(targetStrength, 5);
}

/**
 * Update uniform values for shaders
 */
function updateUniforms(dt, scrollY) {
	sharedUniforms.u_time.value += dt;
	sharedUniforms.u_strength.value = Math.min(1, strength);
	// The intro pulse gets its own uniform rather than being added into u_strength:
	// scroll alone already saturates u_strength's visual effect, so anything mixed
	// into it is masked while the user is scrolling - which is exactly when the
	// pulse's ScrollTrigger fires.
	sharedUniforms.u_intro.value = introStrengthProxy.value;
	// skip the fullscreen noise pass entirely once the pulse has settled
	introNoiseMesh.visible = introStrengthProxy.value > 0.001;
	scrollOffset.set(window.scrollX, scrollY - viewportHeight * padding);
}

/**
 * Update canvas position based on settings
 */
function updateCanvasPosition() {
	if (!isNoFix) {
		canvas.style.transform = `translate(${scrollOffset.x}px, ${scrollOffset.y}px)`;
	} else {
		canvas.style.transform = `translateZ(0)`;
	}
}

/**
 * Update meshes and optimize visibility
 */
function updateMeshes(dt) {
	const canvasTop = scrollOffset.y;
	const canvasBottom = canvasTop + resolution.y;

	for (let i = 0; i < itemList.length; i++) {
		const item = itemList[i];

		// Update position
		item.mesh.material.uniforms.u_domXY.value.set(item.x, item.y);

		// Randomly update random values
		if (Math.random() > Math.exp(-dt * 25 * (1 + strength))) {
			item.mesh.material.uniforms.u_rands.value = new THREE.Vector4(Math.random(), Math.random(), Math.random(), Math.random());
		}

		// Optimize by hiding items that are not visible
		item.mesh.visible = item.y < canvasBottom && item.y + item.height > canvasTop;
	}
}

// wait one frame before initializing to ensure the css properties are set
requestAnimationFrame(init);
