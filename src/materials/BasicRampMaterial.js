/**
 * Unlit MeshBasicMaterial that remaps `map` through a Blender-style Color Ramp.
 * Map luminance (0–1) is Fac; `colors` / `positions` define the stops.
 *
 * Three.js:
 *
 *   const mat = new BasicRampMaterial({
 *     map: texture,
 *     colors: ["#1c1612", "#f3ece3"],
 *     positions: [0, 1],
 *   });
 *
 * React Three Fiber (after `extend({ BasicRampMaterial })`):
 *
 *   <basicRampMaterial map={texture} colors={["#1c1612", "#f3ece3"]} positions={[0, 1]} />
 *
 * Live updates: set `mat.colors`, `mat.positions`, or `mat.interpolation`
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

export class BasicRampMaterial extends THREE.MeshBasicMaterial {
    constructor(parameters = {}) {
        const {
            colors = DEFAULT_RAMP_COLORS,
            positions = DEFAULT_RAMP_POSITIONS,
            interpolation = "linear",
            rampResolution = 256,
            ...rest
        } = parameters;

        super(rest);

        this.isBasicRampMaterial = true;
        this.rampResolution = rampResolution;
        this._colors = colors;
        this._positions = positions;
        this._interpolation = interpolation;
        this._rampColor = new THREE.Color();

        this.rampMap = createRampTexture(this.rampResolution);
        this.uniforms = {
            uRampMap: { value: this.rampMap },
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

    customProgramCacheKey() {
        return "BasicRampMaterial";
    }

    onBeforeCompile(shader) {
        injectColorRampShader(shader, this.uniforms.uRampMap);
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

        if (source.isBasicRampMaterial) {
            this.rampResolution = source.rampResolution;
            this._interpolation = source.interpolation;
            this._colors = Array.isArray(source.colors) ? source.colors.slice() : DEFAULT_RAMP_COLORS;
            this._positions = Array.isArray(source.positions)
                ? source.positions.slice()
                : DEFAULT_RAMP_POSITIONS;
            this.rebuildRamp();
        }

        return this;
    }

    dispose() {
        this.rampMap?.dispose();
        super.dispose();
    }
}
