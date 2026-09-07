/**
 * Lit MeshPhongMaterial that remaps `map` through a Blender-style Color Ramp.
 * Map luminance (0–1) is Fac; `colors` / `positions` define the stops.
 * Optional UV roll (`uvRoll`, `uvRollOffset`, `uvRollScale`) scrolls the map
 * along U without bleeding atlas seams.
 *
 * Three.js:
 *
 *   const mat = new PhongRampMaterial({
 *     map: texture,
 *     shininess: 50,
 *     colors: ["#263584", "#7194b9", "#f2efe6"],
 *     positions: [0, 0.03, 0.6],
 *   });
 *   mat.uvRoll = 0.25; // scroll the map
 *
 * React Three Fiber (after `extend({ PhongRampMaterial })`):
 *
 *   <phongRampMaterial
 *     map={texture}
 *     shininess={50}
 *     colors={["#263584", "#7194b9", "#f2efe6"]}
 *     positions={[0, 0.03, 0.6]}
 *   />
 *
 * Live updates: set `colors`, `positions`, or `interpolation`
 * ("linear" | "ease" | "constant") — the ramp texture rebuilds automatically.
 */
import * as THREE from "three";
import {
    DEFAULT_RAMP_COLORS,
    DEFAULT_RAMP_POSITIONS,
    createRampTexture,
    injectColorRampShader,
    rebuildRampTexture,
} from "./colorRamp";

export class PhongRampMaterial extends THREE.MeshPhongMaterial {
    constructor(parameters = {}) {
        const {
            colors = DEFAULT_RAMP_COLORS,
            positions = DEFAULT_RAMP_POSITIONS,
            interpolation = "linear",
            rampResolution = 256,
            ...rest
        } = parameters;

        super(rest);

        this.isPhongRampMaterial = true;
        this.rampResolution = rampResolution;
        this._colors = colors;
        this._positions = positions;
        this._interpolation = interpolation;
        this._rampColor = new THREE.Color();

        this.rampMap = createRampTexture(this.rampResolution);
        this.uniforms = {
            uRampMap: { value: this.rampMap },
            uUvRoll: { value: 0 },
            uUvRollOffset: { value: 0 },
            uUvRollScale: { value: 1 },
        };

        this.rebuildRamp();
    }

    get colors() {
        return this._colors;
    }

    set colors(value) {
        this._colors = value;
        this.rebuildRamp();
    }

    get positions() {
        return this._positions;
    }

    set positions(value) {
        this._positions = value;
        this.rebuildRamp();
    }

    get interpolation() {
        return this._interpolation;
    }

    set interpolation(value) {
        this._interpolation = value;
        this.rebuildRamp();
    }

    get uvRoll() {
        return this.uniforms.uUvRoll.value;
    }

    set uvRoll(value) {
        this.uniforms.uUvRoll.value = value;
    }

    get uvRollOffset() {
        return this.uniforms.uUvRollOffset.value;
    }

    set uvRollOffset(value) {
        this.uniforms.uUvRollOffset.value = value;
    }

    get uvRollScale() {
        return this.uniforms.uUvRollScale.value;
    }

    set uvRollScale(value) {
        this.uniforms.uUvRollScale.value = value;
    }

    customProgramCacheKey() {
        return "PhongRampMaterial.uvRollSeam";
    }

    onBeforeCompile(shader) {
        injectColorRampShader(shader, this.uniforms.uRampMap, this.uniforms);
    }

    rebuildRamp() {
        rebuildRampTexture(
            this.rampMap,
            this._colors,
            this._positions,
            this._interpolation,
            this._rampColor,
        );
    }

    copy(source) {
        super.copy(source);

        if (source.isPhongRampMaterial) {
            this.rampResolution = source.rampResolution;
            this._interpolation = source.interpolation;
            this._colors = Array.isArray(source.colors) ? source.colors.slice() : DEFAULT_RAMP_COLORS;
            this._positions = Array.isArray(source.positions)
                ? source.positions.slice()
                : DEFAULT_RAMP_POSITIONS;
            this.uvRoll = source.uvRoll;
            this.uvRollOffset = source.uvRollOffset;
            this.uvRollScale = source.uvRollScale;
            this.rebuildRamp();
        }

        return this;
    }

    dispose() {
        this.rampMap?.dispose();
        super.dispose();
    }
}
