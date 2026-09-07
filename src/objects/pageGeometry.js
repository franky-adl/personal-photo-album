/**
 * Synopsis:
 *
 * Page-turn geometry: bind a sheet to the book gutter, then interpolate each
 * vertex from a flat page (t = 0) to the opposite curl (t = 1) without the
 * turning surface intersecting the resting pages.
 */

const TWO_PI = Math.PI * 2;

/**
 * Where the sheet is bound, read off the original RightPage: the gutter edge,
 * the height of its plane, and how far a flat page reaches from there.
 */
export function readSpine(rightGeometry) {
    const position = rightGeometry.attributes.position;
    let minX = Infinity;
    let maxX = -Infinity;
    let sumY = 0;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        sumY += position.getY(i);
    }

    return { x: minX, y: sumY / position.count, length: maxX - minX };
}

/**
 * Describe every vertex in polar coordinates around the gutter, once. `uv.x`
 * is the material coordinate along the page, so it survives the curl and gives
 * each vertex its place on the flat sheet.
 */
export function createFlippableGeometry(source, spine) {
    const geometry = source.clone();
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const count = position.count;

    let uMin = Infinity;
    let uMax = -Infinity;
    for (let i = 0; i < count; i++) {
        const u = uv.getX(i);
        if (u < uMin) uMin = u;
        if (u > uMax) uMax = u;
    }
    const uSpan = uMax - uMin || 1;

    const curledRadius = new Float32Array(count);
    const curledAngle = new Float32Array(count);
    const flatRadius = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const dx = position.getX(i) - spine.x;
        const dy = position.getY(i) - spine.y;
        const radius = Math.hypot(dx, dy);

        let angle = Math.atan2(dy, dx);
        // Keep one counter-clockwise branch so the sheet sweeps up and over
        // rather than doubling back behind the gutter.
        if (angle < -Math.PI / 2) angle += TWO_PI;

        curledRadius[i] = radius;
        curledAngle[i] = angle;
        // The flat reach must stay outside the curled reach; that is what keeps
        // the turning sheet clear of the page it is about to land on.
        flatRadius[i] = Math.max(
            ((uMax - uv.getX(i)) / uSpan) * spine.length,
            radius,
        );
    }

    geometry.userData.flip = { spine, curledRadius, curledAngle, flatRadius };
    return geometry;
}

/**
 * t = 0: flat on the original RightPage plane.
 * t = 1: the LeftPage curl, vertex for vertex.
 *
 * Each vertex swings around the gutter on its own arc. Because the curl angle
 * grows along the page, a vertex at a given sweep angle always sits further out
 * than the resting page below it, so the two surfaces only meet at the ends of
 * the turn instead of crossing through each other.
 */
export function posePageGeometry(geometry, t) {
    const { spine, curledRadius, curledAngle, flatRadius } =
        geometry.userData.flip;
    const dest = geometry.attributes.position.array;

    for (let i = 0, offset = 0; offset < dest.length; i++, offset += 3) {
        const angle = curledAngle[i] * t;
        const radius = flatRadius[i] + (curledRadius[i] - flatRadius[i]) * t;
        dest[offset] = spine.x + radius * Math.cos(angle);
        dest[offset + 1] = spine.y + radius * Math.sin(angle);
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
}

export function reverseWinding(geometry) {
    const index = geometry.index;
    if (!index) return geometry;

    const array = index.array;
    for (let i = 0; i < array.length; i += 3) {
        const tmp = array[i];
        array[i] = array[i + 2];
        array[i + 2] = tmp;
    }
    index.needsUpdate = true;
    return geometry;
}
