import React, { useEffect, useMemo, useRef } from "react";
import { Html, useGLTF, useTexture } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { BasicRampMaterial } from "../materials/BasicRampMaterial";
import { PhongRampMaterial } from "../materials/PhongRampMaterial";
import BookPages from "./BookPages.jsx";
import { BOOK_PAGES } from "./bookPagesData";
import { bookFocus } from "../Camera";
import { registerPageImages, subscribeOverlayGone } from "../utils/sceneLoader";

extend({ BasicRampMaterial, PhongRampMaterial });

const GLOBE_BASE_SPEED = 0.04;
const GLOBE_MAX_SPEED = 3;
const GLOBE_EASE = 1.2;
const GLOBE_DRAG_SENSITIVITY = 0.0016;
const GLOBE_HAND_SMOOTH = 22;
const GLOBE_FLICK_MIN = 0.08;

function SceneHint({
    position,
    color = "#09e3ea",
    shadowColor = "rgba(187, 230, 255, 0.95)",
    delay = 0,
    children,
}) {
    const hintRef = useRef(null);
    const intro = useRef({ value: 0 });
    const hide = useRef(1);

    useEffect(() => {
        let tween;
        const unsub = subscribeOverlayGone(() => {
            tween = gsap.to(intro.current, {
                value: 1,
                duration: 0.75,
                delay,
                ease: "power2.out",
            });
        });
        return () => {
            unsub();
            tween?.kill();
        };
    }, [delay]);

    useFrame((_, delta) => {
        const el = hintRef.current;
        if (!el) return;
        const hideTarget = bookFocus.amount > 0.2 ? 0 : 1;
        hide.current +=
            (hideTarget - hide.current) * (1 - Math.exp(-10 * delta));
        el.style.opacity = String(intro.current.value * hide.current);
    });

    return (
        <Html
            position={position}
            center
            distanceFactor={1.8}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: "none" }}
        >
            <div
                ref={hintRef}
                className="float-hint"
                style={{
                    color,
                    textShadow: `0 2px 16px ${shadowColor}`,
                    opacity: 0,
                }}
            >
                {children}
            </div>
        </Html>
    );
}

function InteractiveGlobe({
    geometry,
    position,
    rotation,
    bakedTexture,
    uvRollOffset,
    uvRollScale,
}) {
    const materialRef = useRef();
    const hovering = useRef(false);
    const spin = useRef({
        speed: GLOBE_BASE_SPEED,
        restSign: 1,
        grabbing: false,
        pointerId: null,
        lastClientX: 0,
        lastTime: 0,
        handSpeed: 0,
    });

    const setCursor = (value) => {
        document.body.style.cursor = value;
    };

    useEffect(() => {
        const endGrab = (event) => {
            const state = spin.current;
            if (!state.grabbing) return;
            if (
                event.pointerId != null &&
                state.pointerId != null &&
                event.pointerId !== state.pointerId
            ) {
                return;
            }

            const now = performance.now();
            const idle = (now - state.lastTime) / 1000;
            if (idle > 0) {
                state.handSpeed *= Math.exp(-14 * idle);
            }

            if (Math.abs(state.handSpeed) >= GLOBE_FLICK_MIN) {
                state.speed = THREE.MathUtils.clamp(
                    state.handSpeed,
                    -GLOBE_MAX_SPEED,
                    GLOBE_MAX_SPEED,
                );
                state.restSign = Math.sign(state.speed);
            } else {
                state.speed = 0;
            }

            state.grabbing = false;
            state.pointerId = null;
            state.handSpeed = 0;
            setCursor(hovering.current ? "grab" : "auto");
        };

        const onMove = (event) => {
            const state = spin.current;
            if (!state.grabbing || event.pointerId !== state.pointerId) return;

            const dx = event.movementX || event.clientX - state.lastClientX;
            state.lastClientX = event.clientX;
            const now = performance.now();
            const dt = Math.min(
                Math.max((now - state.lastTime) / 1000, 1 / 240),
                0.05,
            );
            state.lastTime = now;

            if (dx === 0) {
                state.handSpeed *= Math.exp(-10 * dt);
                return;
            }

            const du = -dx * GLOBE_DRAG_SENSITIVITY;
            if (materialRef.current) {
                materialRef.current.uvRoll += du;
            }

            const instant = THREE.MathUtils.clamp(du / dt, -8, 8);
            const smooth = 1 - Math.exp(-GLOBE_HAND_SMOOTH * dt);
            state.handSpeed += (instant - state.handSpeed) * smooth;
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", endGrab);
        window.addEventListener("pointercancel", endGrab);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", endGrab);
            window.removeEventListener("pointercancel", endGrab);
        };
    }, []);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const state = spin.current;
        if (state.grabbing) return;

        if (Math.abs(state.speed) > 1e-5) {
            state.restSign = Math.sign(state.speed);
        }
        const target = state.restSign * GLOBE_BASE_SPEED;
        state.speed +=
            (target - state.speed) * (1 - Math.exp(-GLOBE_EASE * dt));
        if (materialRef.current) {
            materialRef.current.uvRoll += state.speed * dt;
        }
    });

    return (
        <group position={position}>
            <mesh
                castShadow
                receiveShadow
                geometry={geometry}
                rotation={rotation}
                onPointerOver={() => {
                    hovering.current = true;
                    if (!spin.current.grabbing) setCursor("grab");
                }}
                onPointerOut={() => {
                    hovering.current = false;
                    if (!spin.current.grabbing) setCursor("auto");
                }}
                onPointerDown={(event) => {
                    if (event.nativeEvent.button !== 0) return;
                    event.stopPropagation();
                    const state = spin.current;
                    state.grabbing = true;
                    state.pointerId = event.nativeEvent.pointerId;
                    state.lastClientX = event.nativeEvent.clientX;
                    state.lastTime = performance.now();
                    state.handSpeed = 0;
                    setCursor("grabbing");
                }}
            >
                <phongRampMaterial
                    ref={materialRef}
                    map={bakedTexture}
                    shininess={50}
                    colors={["#263584", "#7194b9", "#f2efe6"]}
                    positions={[0, 0.03, 0.6]}
                    uvRollOffset={uvRollOffset}
                    uvRollScale={uvRollScale}
                />
            </mesh>
            <SceneHint
                position={[0.15, 0.02, 0.06]}
                color="#84deff"
                shadowColor="rgba(127, 221, 255, 0.95)"
                delay={0.28}
            >
                Spin me!
            </SceneHint>
        </group>
    );
}

registerPageImages(BOOK_PAGES);

export default function Model(props) {
    const desk1 = useRef();
    const desk2 = useRef();
    const { nodes, materials } = useGLTF("./Desk.glb");
    const bakedTexture = useTexture("./BakeMap.webp");
    bakedTexture.channel = 1; // Use the BakeMap UV channel from Blender
    bakedTexture.flipY = false;
    bakedTexture.minFilter = THREE.LinearFilter; // sharper textures at grazing angles
    const bakedTexture2 = useTexture("./BakeMap2.webp");
    bakedTexture2.channel = 1; // Use the BakeMap UV channel from Blender
    bakedTexture2.flipY = false;
    bakedTexture2.minFilter = THREE.LinearFilter; // sharper textures at grazing angles

    const ATATTexture = useTexture("./AT_AT.jpg");
    ATATTexture.flipY = false;

    const globeUvRoll = useMemo(() => {
        const uv1 = nodes.Globe.geometry.attributes.uv1;
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = 0; i < uv1.count; i++) {
            const x = uv1.getX(i);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
        }
        return { offset: minX, scale: maxX - minX };
    }, [nodes.Globe.geometry]);

    useFrame(() => {
        const showDesk = bookFocus.amount <= 0.99;
        if (desk1.current) desk1.current.visible = showDesk;
        if (desk2.current) desk2.current.visible = showDesk;
    });

    return (
        <group {...props} dispose={null}>
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.Desk.geometry}
                position={[0, 1, -0.088]}
                scale={[0.567, 1, 0.545]}
            >
                <meshBasicMaterial map={bakedTexture} />
            </mesh>
            <mesh
                ref={desk1}
                castShadow
                receiveShadow
                geometry={nodes.Desk1.geometry}
                position={[0, 1, -0.088]}
                scale={[0.567, 1, 0.545]}
            >
                <meshBasicMaterial map={bakedTexture} />
            </mesh>
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.BookCover.geometry}
                position={[0, 1, -0.088]}
                scale={[0.567, 1, 0.545]}
            >
                <meshBasicMaterial map={bakedTexture2} />
            </mesh>
            <mesh
                ref={desk2}
                castShadow
                receiveShadow
                geometry={nodes.Desk2.geometry}
                position={[0, 1, -0.088]}
                scale={[0.567, 1, 0.545]}
            >
                <meshBasicMaterial map={bakedTexture2} />
            </mesh>
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.DoubleSides.geometry}
                material={nodes.DoubleSides.material}
                position={[-0.228, 1.524, 0.454]}
                rotation={[-Math.PI, 0.78, -Math.PI]}
            >
                <meshBasicMaterial map={bakedTexture} side={THREE.DoubleSide} />
            </mesh>
            <mesh
                castShadow
                receiveShadow
                geometry={nodes.AT_AT.geometry}
                position={[-0.21, 1.111, -0.389]}
                rotation={[-Math.PI / 2, 0, -3.004]}
                scale={0.026}
            >
                <basicRampMaterial
                    map={ATATTexture}
                    colors={["#1c1612", "#f3ece3"]}
                    positions={[0, 1]}
                />
            </mesh>
            <InteractiveGlobe
                geometry={nodes.Globe.geometry}
                position={[-0.243, 1.081, -0.666]}
                rotation={[Math.PI, -0.182, Math.PI]}
                bakedTexture={bakedTexture2}
                uvRollOffset={globeUvRoll.offset}
                uvRollScale={globeUvRoll.scale}
            />
            <SceneHint
                position={[0.25, 1.055, 0.04]}
                color="#ffa5e2"
                shadowColor="rgba(253, 210, 15, 0.95)"
                delay={0.05}
            >
                View my album!
            </SceneHint>
            <BookPages
                geometry={nodes.LeftPage.geometry}
                rightGeometry={nodes.RightPage.geometry}
                pages={BOOK_PAGES}
                position={[0.127, 1.081, -0.065]}
                rotation={[0, 1.483, 0]}
                scale={[1.2, 1, 0.949]}
            />
        </group>
    );
}
