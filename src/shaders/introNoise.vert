varying vec2 v_uv;

void main() {
    v_uv = uv;
    // fullscreen quad: PlaneGeometry(2, 2) mapped straight to clip space, ignoring camera
    gl_Position = vec4(position.xy, 0., 1.);
}
