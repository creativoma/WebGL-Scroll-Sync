uniform sampler2D u_texture;
uniform vec4 u_rands;
uniform float u_strength;
uniform float u_time;
uniform float u_id;
uniform float u_progress;
uniform float u_intro;
uniform vec3 u_bgColor;

varying vec2 v_uv;

#define NUM_SAMPLES 5

// hash function by Dave_Hoskins from https://www.shadertoy.com/view/4djSRW
vec4 hash43(vec3 p) {
	vec4 p4 = fract(vec4(p.xyzx)  * vec4(.1031, .1030, .0973, .1099));
    p4 += dot(p4, p4.wzxy+33.33);
    return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}

void main() {

    // get some white noise
    vec4 noises = hash43(vec3(gl_FragCoord.xy, u_id));

    // extra distortion near the wipe edge while the reveal is in progress
    float revealStrength = 1. - smoothstep(0., 1., u_progress);

    // get lazy random glitchy uv offset
    vec4 rands = hash43(vec3(floor(sin(v_uv.x * 2. + u_rands.x * 6.283) * mix(3., 40., u_rands.y)) * 30., u_id, u_rands.z));
    vec2 uvOffset = vec2(0., (rands.x - .5) * 0.5 * (rands.y > .7 ? 1. : 0.)) / float(NUM_SAMPLES) * (0.05 + u_strength * 0.3 + revealStrength * 1.5);

    vec2 uv = v_uv + noises.xy * uvOffset;
    vec3 color = vec3(0.);

    // accumulate samples
    for (int i = 0; i < NUM_SAMPLES; i++) {
        color += texture2D(u_texture, uv).rgb;
        uv += uvOffset;
    }

    // normalize and apply strength
    color /= float(NUM_SAMPLES);
    color *= (1. + u_strength * 2.);

    // Case 1 intro pulse: horizontal RGB channel split. Deliberately unlike the
    // vertical band glitch above, so it stays readable even mid-scroll.
    if (u_intro > 0.001) {
        float ca = u_intro * 0.06;
        color.r = texture2D(u_texture, v_uv + vec2(ca, 0.)).r * (1. + u_strength * 2.);
        color.b = texture2D(u_texture, v_uv - vec2(ca, 0.)).b * (1. + u_strength * 2.);
    }

    // Curtain wipe driven by GSAP ScrollTrigger (u_progress 0 to 1): the image
    // uncovers bottom-to-top as it scrolls into view. A wipe (rather than a fade
    // or more glitch) is used because the demo's own scroll glitch would mask
    // anything subtler. The 1.1 overshoot guarantees the top edge fully clears.
    float th = u_progress * 1.1;
    // tear the edge per vertical band while revealing; settles flat as progress completes
    float y = v_uv.y + (rands.x - .5) * 0.3 * revealStrength;
    float reveal = 1. - smoothstep(th - 0.05, th, y);
    // bright leading edge so the wipe reads as a scanline, not a flat mask
    color += vec3(1., 0.35, 0.15) * (1. - smoothstep(0., 0.06, abs(y - th + 0.05))) * revealStrength;
    color = mix(u_bgColor, color, reveal);

    gl_FragColor = vec4(color, 1.);
}
