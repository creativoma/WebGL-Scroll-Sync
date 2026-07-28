uniform float u_intro;
uniform float u_time;
uniform vec3 u_bgColor;

varying vec2 v_uv;

// hash function by Dave_Hoskins from https://www.shadertoy.com/view/4djSRW
vec4 hash43(vec3 p) {
	vec4 p4 = fract(vec4(p.xyzx)  * vec4(.1031, .1030, .0973, .1099));
    p4 += dot(p4, p4.wzxy+33.33);
    return fract((p4.xxyz+p4.yzzw)*p4.zywx);
}

void main() {
    // TV-static noise tinted with the page background, plus brighter horizontal
    // bands sliding upward. Opacity follows u_intro (Case 1), so the whole canvas
    // loads "broken" and resolves to the flat background as GSAP eases it to 0.
    vec4 noise = hash43(vec3(gl_FragCoord.xy, fract(u_time) * 100.));
    float band = step(0.8, hash43(vec3(floor(v_uv.y * 90. + u_time * 30.), 1., floor(u_time * 24.))).x);

    vec3 color = u_bgColor * (0.4 + noise.x * 3.);
    color += vec3(1., 0.35, 0.15) * band * noise.y * 0.4;

    gl_FragColor = vec4(mix(u_bgColor, color, u_intro), 1.);
}
