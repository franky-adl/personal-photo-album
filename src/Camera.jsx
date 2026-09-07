import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { button, useControls } from "leva";
import * as THREE from "three";

const FRAME_FILL = 0.95;
const DEFAULT_NEAR = 0.1;
const PAGE_NEAR = 1; // not too close to the pages or else the flipping pages get clipped as well

const desiredPosition = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
const desiredUp = new THREE.Vector3();
const desiredOffset = new THREE.Vector3();
const desiredSpherical = new THREE.Spherical();
const pageAxisX = new THREE.Vector3();
const pageAxisZ = new THREE.Vector3();
const pagePoint = new THREE.Vector3();
const pageOrigin = new THREE.Vector3();
const bookFocusListeners = new Set();

export const bookFocus = { current: false, amount: 0 };

export function setBookFocus(focused) {
    if (bookFocus.current === focused) return;
    bookFocus.current = focused;
    for (const listener of bookFocusListeners) listener(focused);
}

export function subscribeBookFocus(listener) {
    bookFocusListeners.add(listener);
    return () => bookFocusListeners.delete(listener);
}

let desiredNear = DEFAULT_NEAR;

function findBookPages(scene) {
    let left = null;
    let right = null;
    scene.traverse((object) => {
        if (object.name === "LeftPage") left = object;
        if (object.name === "RightPage") right = object;
    });
    if (!left || !right) return null;
    return [left, right];
}

function computeBookView(pages, camera) {
    const [leftPage, rightPage] = pages;
    leftPage.updateWorldMatrix(true, false);
    rightPage.updateWorldMatrix(true, false);

    pageAxisX.set(1, 0, 0).transformDirection(leftPage.matrixWorld).normalize();
    pageAxisZ.set(0, 0, 1).transformDirection(leftPage.matrixWorld).normalize();

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const page of pages) {
        const position = page.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            pagePoint
                .fromBufferAttribute(position, i)
                .applyMatrix4(page.matrixWorld);
            const x = pagePoint.dot(pageAxisX);
            const z = pagePoint.dot(pageAxisZ);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            minY = Math.min(minY, pagePoint.y);
            maxY = Math.max(maxY, pagePoint.y);
        }
    }

    pageOrigin.setFromMatrixPosition(leftPage.matrixWorld);
    desiredTarget
        .copy(pageOrigin)
        .addScaledVector(
            pageAxisX,
            (minX + maxX) * 0.5 - pageOrigin.dot(pageAxisX),
        )
        .addScaledVector(
            pageAxisZ,
            (minZ + maxZ) * 0.5 - pageOrigin.dot(pageAxisZ),
        );
    desiredTarget.y = (minY + maxY) * 0.5;

    const fov = THREE.MathUtils.degToRad(camera.fov);
    const halfHeight = Math.tan(fov / 2);
    const halfWidth = halfHeight * camera.aspect;
    // how far above the book the camera must sit so both pages fit in the frame at 95% fill
    const distance = Math.max(
        (maxZ - minZ) / (2 * halfHeight * FRAME_FILL),
        (maxX - minX) / (2 * halfWidth * FRAME_FILL),
    );

    desiredPosition.set(
        desiredTarget.x,
        desiredTarget.y + distance,
        desiredTarget.z,
    );
    // -page Z puts the left page on the left when looking down +Y.
    desiredUp.copy(pageAxisZ).negate();
    // Adjust page near so that nothing gets between the camera and the pages
    desiredNear = PAGE_NEAR;
}

export default function Camera() {
    const { camera, pointer, scene } = useThree();
    const smoothedPosition = useRef(new THREE.Vector3());
    const smoothedTarget = useRef(new THREE.Vector3());
    const smoothedUp = useRef(new THREE.Vector3(0, 1, 0));
    const smoothedNear = useRef(DEFAULT_NEAR);
    const { position, target, easing, orbit } = useControls("Camera", {
        position: {
            value: { x: 6, y: 3.8, z: 1.5 },
            step: 0.01,
        },
        target: {
            value: { x: 0.6, y: 1.1, z: 0.2 },
            step: 0.01,
        },
        easing: { value: 4, min: 0.5, max: 20, step: 0.1 },
        orbit: { value: 0.08, min: 0, max: 0.8, step: 0.01 },
        "Focus book": button(() => {
            setBookFocus(true);
        }),
        "Default view": button(() => {
            setBookFocus(false);
        }),
    });

    const restSpherical = useMemo(() => {
        return new THREE.Spherical().setFromVector3(
            new THREE.Vector3(
                position.x - target.x,
                position.y - target.y,
                position.z - target.z,
            ),
        );
    }, [position, target]);

    useEffect(() => {
        if (bookFocus.current) return;
        smoothedPosition.current.set(position.x, position.y, position.z);
        smoothedTarget.current.set(target.x, target.y, target.z);
        smoothedUp.current.set(0, 1, 0);
        camera.up.set(0, 1, 0);
        camera.near = DEFAULT_NEAR;
        camera.updateProjectionMatrix();
        smoothedNear.current = DEFAULT_NEAR;
        camera.position.set(position.x, position.y, position.z);
        camera.lookAt(target.x, target.y, target.z);
    }, [camera, position, target]);

    useFrame((_, delta) => {
        const t = 1 - Math.exp(-easing * delta);

        if (bookFocus.current) {
            const pages = findBookPages(scene);
            if (pages) computeBookView(pages, camera); // this updates desiredNear
        } else {
            desiredTarget.set(target.x, target.y, target.z);
            desiredSpherical.copy(restSpherical);
            desiredSpherical.theta += pointer.x * orbit;
            desiredSpherical.phi -= pointer.y * orbit;
            desiredSpherical.makeSafe();
            desiredOffset.setFromSpherical(desiredSpherical);
            desiredPosition.copy(desiredTarget).add(desiredOffset);
            desiredUp.set(0, 1, 0);
            desiredNear = DEFAULT_NEAR;
        }

        smoothedPosition.current.lerp(desiredPosition, t);
        smoothedTarget.current.lerp(desiredTarget, t);
        smoothedUp.current.lerp(desiredUp, t).normalize();
        smoothedNear.current = THREE.MathUtils.lerp(
            smoothedNear.current,
            desiredNear,
            t,
        );
        bookFocus.amount = THREE.MathUtils.lerp(
            bookFocus.amount,
            bookFocus.current ? 1 : 0,
            t,
        );

        camera.up.copy(smoothedUp.current);
        camera.position.copy(smoothedPosition.current);
        camera.lookAt(smoothedTarget.current);

        if (Math.abs(camera.near - smoothedNear.current) > 1e-4) {
            camera.near = smoothedNear.current;
            camera.updateProjectionMatrix();
        }
    });

    return null;
}
