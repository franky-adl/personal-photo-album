/**
 * Blender-style Color Ramp helpers shared by BasicRampMaterial and PhongRampMaterial.
 *
 * Builds a 1D lookup texture from `colors` / `positions` stops, then injects a
 * fragment shader that remaps a map's luminance (Fac) through that ramp.
 *
 * Example — bake a ramp and patch a material shader:
 *
 *   const rampMap = createRampTexture(256);
 *   rebuildRampTexture(rampMap, ["#000", "#fff"], [0, 1], "linear", new THREE.Color());
 *   material.onBeforeCompile = (shader) => injectColorRampShader(shader, { value: rampMap });
 *
 * Interpolation: "linear" (default), "ease" (smoothstep), or "constant" (hard steps).
 */
import * as THREE from "three";

export const DEFAULT_RAMP_COLORS = ["#000000", "#ffffff"];
export const DEFAULT_RAMP_POSITIONS = [0, 1];
export const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };

export function parseStops(colors, positions) {
    const count = Math.min(colors?.length ?? 0, positions?.length ?? 0);
    const stops = [];

    for (let i = 0; i < count; i++) {
        const color = new THREE.Color();
        color.set(colors[i]);
        color.convertSRGBToLinear();
        stops.push({
            color,
            position: THREE.MathUtils.clamp(Number(positions[i]), 0, 1),
        });
    }

    stops.sort((a, b) => a.position - b.position);
    return stops;
}

export function interpolateFactor(t, interpolation) {
    if (interpolation === "ease") {
        return t * t * (3 - 2 * t);
    }
    if (interpolation === "constant") {
        return 0;
    }
    return t;
}

export function sampleRamp(stops, t, interpolation, target) {
    if (stops.length === 0) {
        return target.set(1, 1, 1);
    }

    if (stops.length === 1 || t <= stops[0].position) {
        return target.copy(stops[0].color);
    }

    const last = stops[stops.length - 1];
    if (t >= last.position) {
        return target.copy(last.color);
    }

    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        if (t > b.position) continue;

        const span = b.position - a.position;
        const f = span < 1e-6 ? 0 : interpolateFactor((t - a.position) / span, interpolation);
        return target.copy(a.color).lerp(b.color, f);
    }

    return target.copy(last.color);
}

export function createRampTexture(width) {
    const texture = new THREE.DataTexture(
        new Uint8Array(width * 4),
        width,
        1,
        THREE.RGBAFormat,
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

export function rebuildRampTexture(rampMap, colors, positions, interpolation, targetColor) {
    if (!rampMap) return;

    const stops = parseStops(colors, positions);
    const data = rampMap.image.data;
    const width = rampMap.image.width;

    for (let i = 0; i < width; i++) {
        const t = width === 1 ? 0 : i / (width - 1);
        sampleRamp(stops, t, interpolation, targetColor);
        targetColor.convertLinearToSRGB();

        const offset = i * 4;
        data[offset] = Math.round(THREE.MathUtils.clamp(targetColor.r, 0, 1) * 255);
        data[offset + 1] = Math.round(THREE.MathUtils.clamp(targetColor.g, 0, 1) * 255);
        data[offset + 2] = Math.round(THREE.MathUtils.clamp(targetColor.b, 0, 1) * 255);
        data[offset + 3] = 255;
    }

    rampMap.needsUpdate = true;
}

export function injectColorRampShader(shader, uRampMap, uvRollUniforms) {
    shader.uniforms.uRampMap = uRampMap;
    if (uvRollUniforms) {
        shader.uniforms.uUvRoll = uvRollUniforms.uUvRoll;
        shader.uniforms.uUvRollOffset = uvRollUniforms.uUvRollOffset;
        shader.uniforms.uUvRollScale = uvRollUniforms.uUvRollScale;
    }

    shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_pars_fragment>",
        /* glsl */ `
        #include <map_pars_fragment>
        uniform sampler2D uRampMap;
        ${
            uvRollUniforms
                ? "uniform float uUvRoll; uniform float uUvRollOffset; uniform float uUvRollScale;"
                : ""
        }
        `,
    );

    const mapSample = uvRollUniforms
        ? /* glsl */ `
            float rampScale = max(uUvRollScale, 1e-6);
            float rampLocalX = (vMapUv.x - uUvRollOffset) / rampScale;
            float rampRolledX = fract(rampLocalX + uUvRoll);
            // Keep bilinear taps inside the packed island so the 0/1 wrap
            // does not bleed empty/white atlas texels.
            float rampInset = max(rampScale * 0.003, 0.00075);
            float rampInnerScale = max(rampScale - 2.0 * rampInset, rampInset);
            vec2 rolledMapUv = vec2(
                uUvRollOffset + rampInset + rampRolledX * rampInnerScale,
                vMapUv.y
            );
            // fract() breaks implicit derivatives; reuse the pre-wrap UV
            // gradients so the seam does not pick a washed-out mip.
            vec4 sampledDiffuseColor = textureGrad(map, rolledMapUv, dFdx(vMapUv), dFdy(vMapUv));
        `
        : /* glsl */ `
            vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        `;

    shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        /* glsl */ `
        #ifdef USE_MAP
            ${mapSample}
            #ifdef DECODE_VIDEO_TEXTURE
                sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
            #endif
            float rampFac = dot(sampledDiffuseColor.rgb, vec3(${LUMINANCE_WEIGHTS.r}, ${LUMINANCE_WEIGHTS.g}, ${LUMINANCE_WEIGHTS.b}));
            sampledDiffuseColor.rgb = texture2D( uRampMap, vec2(rampFac, 0.5) ).rgb;
            diffuseColor *= sampledDiffuseColor;
        #endif
        `,
    );
}
