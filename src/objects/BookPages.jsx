/**
 * Synopsis:
 *
 * Interactive album: left and right page meshes plus a turning sheet, each
 * textured from pageTexture. Flips spreads with pageGeometry, focuses the
 * camera on first click, plays video on media hits, and exposes
 * requestPageFlip / subscribePageNav for UI controls.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { button, useControls } from "leva";
import * as THREE from "three";
import { bookFocus, setBookFocus } from "../Camera";
import {
    EMPTY_STAMPS,
    EMPTY_TEXTS,
    mediaHitAt,
    usePageTexture,
} from "./pageTexture";
import { notifyInitialPagesReady } from "../utils/sceneLoader";
import {
    createFlippableGeometry,
    posePageGeometry,
    readSpine,
    reverseWinding,
} from "./pageGeometry";

const FLIP_DURATION = 1.05;
const AUDIO_FADE = 0.45;
const HOVER_BRIGHTNESS = 0.95;
const HOVER_EASE = 12;
const PHOTO_FADE_EASE = 4.2;
const PAPER = "#efe6d6";
const PAPER_COLOR = new THREE.Color(PAPER);
const flipCommand = { current: 0 };
const pageNavListeners = new Set();
const pageNav = { canPrev: false, canNext: true };

function publishPageNav(spread, lastSpread) {
    const canPrev = spread > 0;
    const canNext = spread < lastSpread;
    if (pageNav.canPrev === canPrev && pageNav.canNext === canNext) return;
    pageNav.canPrev = canPrev;
    pageNav.canNext = canNext;
    const snapshot = { canPrev, canNext };
    for (const listener of pageNavListeners) listener(snapshot);
}

export function requestPageFlip(direction) {
    flipCommand.current = direction;
}

export function subscribePageNav(listener) {
    listener({ canPrev: pageNav.canPrev, canNext: pageNav.canNext });
    pageNavListeners.add(listener);
    return () => pageNavListeners.delete(listener);
}

const hoverRaycaster = new THREE.Raycaster();
const hoverNdc = new THREE.Vector2();
const idlePlayback = () => ({
    pageIndex: -1,
    photoIndex: -1,
    fading: false,
    fadeElapsed: 0,
});

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function pageIndicesForSpread(spread, pageCount) {
    const start = spread * 2;
    const indices = [];
    if (start < pageCount) indices.push(start);
    if (start + 1 < pageCount) indices.push(start + 1);
    return indices;
}

function PageTextureSlot({ page, flipX, onSlot, enabled }) {
    const gutter = page.gutter ?? (flipX ? "left" : "right");
    const slot = usePageTexture(
        page.photos,
        gutter,
        page.texts ?? EMPTY_TEXTS,
        page.stamps ?? EMPTY_STAMPS,
        flipX,
        enabled,
    );

    useEffect(() => {
        onSlot(slot);
        return () => onSlot(null);
    }, [slot, onSlot]);

    return null;
}

function ndcFromPointerEvent(event, canvas, target) {
    const rect = canvas.getBoundingClientRect();
    target.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
}

function intersectPages(camera, objects, ndc) {
    const valid = objects.filter(Boolean);
    if (valid.length === 0) return [];
    hoverRaycaster.setFromCamera(ndc, camera);
    return hoverRaycaster.intersectObjects(valid, false);
}

function stylePageMaterial(material, fade, diffuse, emit) {
    if (!material) return;
    material.color.copy(PAPER_COLOR).multiplyScalar(diffuse);
    if (!material.map) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
        material.emissiveIntensity = 0;
        return;
    }
    material.opacity = fade;
    material.transparent = fade < 0.999;
    material.depthWrite = fade >= 0.999;
    material.emissiveIntensity = emit;
}

function SheetFace({
    geometry,
    map,
    side,
    name,
    renderOrder = 0,
    lift = 0,
    meshRef,
    materialRef,
}) {
    return (
        <group>
            <mesh
                ref={meshRef}
                name={name}
                geometry={geometry}
                position={[0, lift, 0]}
                renderOrder={renderOrder}
            >
                <meshLambertMaterial
                    color={PAPER}
                    emissive="#ffffff"
                    emissiveIntensity={0}
                    side={side}
                />
            </mesh>
            {map && (
                <mesh
                    geometry={geometry}
                    position={[0, lift + 0.00008, 0]}
                    renderOrder={renderOrder}
                    raycast={() => {}}
                >
                    <meshLambertMaterial
                        ref={materialRef}
                        color={PAPER}
                        map={map}
                        emissive="#ffffff"
                        emissiveMap={map}
                        emissiveIntensity={0}
                        side={side}
                        transparent
                        opacity={0}
                        depthWrite={false}
                    />
                </mesh>
            )}
        </group>
    );
}

export default function BookPages({
    geometry,
    rightGeometry,
    pages,
    position,
    rotation,
    scale,
}) {
    const spreadCount = Math.floor(pages.length / 2);
    const lastSpread = Math.max(0, spreadCount - 1);
    const spine = useMemo(() => readSpine(rightGeometry), [rightGeometry]);

    const leftGeo = useMemo(() => {
        const geo = createFlippableGeometry(geometry, spine);
        posePageGeometry(geo, 1);
        return geo;
    }, [geometry, spine]);

    const rightGeo = useMemo(() => {
        const geo = createFlippableGeometry(geometry, spine);
        posePageGeometry(geo, 0);
        reverseWinding(geo);
        geo.computeVertexNormals();
        return geo;
    }, [geometry, spine]);

    const turnGeo = useMemo(
        () => createFlippableGeometry(geometry, spine),
        [geometry, spine],
    );

    useEffect(
        () => () => {
            leftGeo.dispose();
            rightGeo.dispose();
            turnGeo.dispose();
        },
        [leftGeo, rightGeo, turnGeo],
    );

    const [slots, setSlots] = useState(() => pages.map(() => null));
    const setSlotAt = useCallback((index, slot) => {
        setSlots((prev) => {
            if (prev[index] === slot) return prev;
            const next = prev.slice();
            next[index] = slot;
            return next;
        });
    }, []);

    const slotSetters = useMemo(
        () => pages.map((_, index) => (slot) => setSlotAt(index, slot)),
        [pages, setSlotAt],
    );

    const [spread, setSpread] = useState(0);
    const [turning, setTurning] = useState(false);
    const spreadRef = useRef(0);
    const turningRef = useRef(false);
    const flip = useRef(null);
    const slotsRef = useRef(slots);
    const pagesRef = useRef(pages);
    const photoFade = useRef(pages.map(() => 0));
    const playback = useRef(idlePlayback());
    const leftMat = useRef();
    const rightMat = useRef();
    const turnFrontMat = useRef();
    const turnBackMat = useRef();
    const leftMesh = useRef();
    const rightMesh = useRef();
    const leftIndexRef = useRef(0);
    const rightIndexRef = useRef(0);
    const hovering = useRef(false);
    const hoverAmount = useRef(0);
    const cursorOwned = useRef(false);
    const pointerOverCanvas = useRef(false);
    slotsRef.current = slots;
    pagesRef.current = pages;

    const { camera, gl, pointer } = useThree();

    useEffect(() => {
        publishPageNav(spread, lastSpread);
    }, [spread, lastSpread]);

    const initialPageIndices = useMemo(() => {
        const indices = [];
        for (const next of [0, 1]) {
            if (next > lastSpread) continue;
            indices.push(...pageIndicesForSpread(next, pages.length));
        }
        return indices;
    }, [lastSpread, pages.length]);

    useEffect(() => {
        if (initialPageIndices.length === 0) {
            notifyInitialPagesReady();
            return;
        }
        if (!initialPageIndices.every((index) => slots[index]?.texture)) {
            return;
        }
        for (const index of initialPageIndices) {
            photoFade.current[index] = 1;
        }
        notifyInitialPagesReady();
    }, [slots, initialPageIndices]);

    const stopPlayback = useCallback((reset = true) => {
        const { pageIndex, photoIndex } = playback.current;
        const slot = slotsRef.current[pageIndex];
        const video = slot?.assets?.[photoIndex]?.video;
        if (video) {
            video.pause();
            if (reset) {
                try {
                    video.currentTime = 0;
                } catch {
                    /* ignore */
                }
            }
            video.volume = 1;
        }
        slot?.redraw(-1);
        playback.current = idlePlayback();
    }, []);

    const beginFade = useCallback(() => {
        if (playback.current.pageIndex < 0 || playback.current.fading) return;
        playback.current.fading = true;
        playback.current.fadeElapsed = 0;
    }, []);

    const beginFlip = useCallback(
        (direction) => {
            if (turningRef.current) return;
            const current = spreadRef.current;
            if (direction > 0 && current >= lastSpread) return;
            if (direction < 0 && current <= 0) return;

            const destSpread = current + direction;
            const playingPage = playback.current.pageIndex;
            if (
                playingPage >= 0 &&
                playingPage !== destSpread * 2 &&
                playingPage !== destSpread * 2 + 1
            ) {
                beginFade();
            }

            const sheet = direction > 0 ? current : current - 1;
            flip.current = {
                sheet,
                from: direction > 0 ? 0 : 1,
                to: direction > 0 ? 1 : 0,
                elapsed: 0,
            };
            posePageGeometry(turnGeo, flip.current.from);
            turningRef.current = true;
            setTurning(true);
            publishPageNav(destSpread, lastSpread);
        },
        [beginFade, lastSpread, turnGeo],
    );

    const handleMediaClick = useCallback(
        async (pageIndex, uv, flipX) => {
            if (turningRef.current) return;
            const slot = slotsRef.current[pageIndex];
            const page = pagesRef.current[pageIndex];
            if (!slot || !page) return;

            const hit = mediaHitAt(page.photos, slot.assets, uv, flipX);
            if (!hit) return;

            const active =
                playback.current.pageIndex === pageIndex &&
                playback.current.photoIndex === hit.photoIndex &&
                !playback.current.fading;
            const video = slot.assets[hit.photoIndex]?.video;
            if (active && video && !video.paused) {
                stopPlayback(false);
                return;
            }

            if (!hit.onIcon || !video) return;

            if (
                playback.current.pageIndex >= 0 &&
                (playback.current.pageIndex !== pageIndex ||
                    playback.current.photoIndex !== hit.photoIndex)
            ) {
                stopPlayback(true);
            }

            video.muted = false;
            video.volume = 1;
            video.loop = true;
            try {
                await video.play();
            } catch {
                return;
            }

            playback.current = {
                pageIndex,
                photoIndex: hit.photoIndex,
                fading: false,
                fadeElapsed: 0,
            };
            slot.redraw(hit.photoIndex);
        },
        [stopPlayback],
    );

    const setPageCursor = useCallback((on) => {
        if (on) {
            if (!cursorOwned.current) {
                document.body.style.cursor = "pointer";
                cursorOwned.current = true;
            }
            return;
        }
        if (!cursorOwned.current) return;
        if (document.body.style.cursor === "pointer") {
            document.body.style.cursor = "auto";
        }
        cursorOwned.current = false;
    }, []);

    useEffect(() => {
        const canvas = gl.domElement;

        const hitsFromEvent = (event) => {
            ndcFromPointerEvent(event, canvas, hoverNdc);
            return intersectPages(
                camera,
                [leftMesh.current, rightMesh.current],
                hoverNdc,
            );
        };

        const onPointerMove = () => {
            pointerOverCanvas.current = true;
        };

        const onPointerLeave = () => {
            pointerOverCanvas.current = false;
            hovering.current = false;
            setPageCursor(false);
        };

        const onPointerDown = (event) => {
            if (event.button !== 0 || turningRef.current) return;
            pointerOverCanvas.current = true;
            const hits = hitsFromEvent(event);
            if (hits.length === 0) return;

            if (!bookFocus.current) {
                setBookFocus(true);
                return;
            }

            const hit = hits[0];
            const isRight = hit.object === rightMesh.current;
            const pageIndex = isRight
                ? rightIndexRef.current
                : leftIndexRef.current;
            void handleMediaClick(pageIndex, hit.uv, isRight);
        };

        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerleave", onPointerLeave);
        canvas.addEventListener("pointerdown", onPointerDown);
        return () => {
            canvas.removeEventListener("pointermove", onPointerMove);
            canvas.removeEventListener("pointerleave", onPointerLeave);
            canvas.removeEventListener("pointerdown", onPointerDown);
            setPageCursor(false);
        };
    }, [camera, gl, handleMediaClick, setPageCursor]);

    const { focusedBrightness } = useControls("Book", {
        "Next page": button(() => {
            flipCommand.current = 1;
        }),
        "Previous page": button(() => {
            flipCommand.current = -1;
        }),
        focusedBrightness: {
            value: 1,
            min: 0.3,
            max: 1,
            step: 0.01,
            label: "Focus brightness",
        },
    });

    useFrame((_, delta) => {
        if (flipCommand.current !== 0) {
            const direction = flipCommand.current;
            flipCommand.current = 0;
            beginFlip(direction);
        }

        const play = playback.current;
        if (play.pageIndex >= 0) {
            const slot = slotsRef.current[play.pageIndex];
            const video = slot?.assets?.[play.photoIndex]?.video;
            if (play.fading) {
                play.fadeElapsed += delta;
                const t = Math.min(1, play.fadeElapsed / AUDIO_FADE);
                if (video) video.volume = 1 - t;
                if (t >= 1) {
                    stopPlayback(true);
                } else {
                    slot?.redraw(play.photoIndex);
                }
            } else if (video && !video.paused) {
                slot?.redraw(play.photoIndex);
            }
        }

        if (
            turningRef.current ||
            !pointerOverCanvas.current ||
            bookFocus.current
        ) {
            hovering.current = false;
        } else {
            hovering.current =
                intersectPages(
                    camera,
                    [leftMesh.current, rightMesh.current],
                    pointer,
                ).length > 0;
        }
        setPageCursor(hovering.current);

        hoverAmount.current = THREE.MathUtils.lerp(
            hoverAmount.current,
            hovering.current ? 1 : 0,
            1 - Math.exp(-HOVER_EASE * delta),
        );

        const fadeStep = 1 - Math.exp(-PHOTO_FADE_EASE * delta);
        const fades = photoFade.current;
        const loaded = slotsRef.current;
        for (let i = 0; i < fades.length; i++) {
            const target = loaded[i]?.texture ? 1 : 0;
            fades[i] += (target - fades[i]) * fadeStep;
        }

        const focus = bookFocus.amount;
        const hover = hoverAmount.current;
        const diffuse = 1 - focus;
        const emit =
            focus * focusedBrightness + hover * (1 - focus) * HOVER_BRIGHTNESS;
        const leftIdx = leftIndexRef.current;
        const rightIdx = rightIndexRef.current;
        stylePageMaterial(leftMat.current, fades[leftIdx] ?? 0, diffuse, emit);
        stylePageMaterial(
            rightMat.current,
            fades[rightIdx] ?? 0,
            diffuse,
            emit,
        );
        if (turningRef.current && flip.current) {
            const sheet = flip.current.sheet;
            stylePageMaterial(
                turnFrontMat.current,
                fades[sheet * 2 + 2] ?? 0,
                diffuse,
                emit,
            );
            stylePageMaterial(
                turnBackMat.current,
                fades[sheet * 2 + 1] ?? 0,
                diffuse,
                emit,
            );
        }

        const motion = flip.current;
        if (!motion) return;

        motion.elapsed += delta;
        const u = Math.min(1, motion.elapsed / FLIP_DURATION);
        const t = THREE.MathUtils.lerp(
            motion.from,
            motion.to,
            easeInOutCubic(u),
        );
        posePageGeometry(turnGeo, t);

        if (u >= 1) {
            const nextSpread =
                motion.to === 1 ? motion.sheet + 1 : motion.sheet;
            spreadRef.current = nextSpread;
            setSpread(nextSpread);
            turningRef.current = false;
            flip.current = null;
            setTurning(false);
        }
    });

    const sheet = turning ? (flip.current?.sheet ?? spread) : null;
    const leftIndex = turning ? sheet * 2 : spread * 2;
    const rightIndex = turning ? sheet * 2 + 3 : spread * 2 + 1;
    const turnFrontIndex = turning ? sheet * 2 + 2 : -1;
    const turnBackIndex = turning ? sheet * 2 + 1 : -1;
    leftIndexRef.current = leftIndex;
    rightIndexRef.current = rightIndex;

    const activePages = useMemo(() => {
        const indices = new Set();
        const spreads = new Set([spread - 1, spread, spread + 1]);
        if (sheet != null) {
            spreads.add(sheet);
            spreads.add(sheet + 1);
        }
        for (const next of spreads) {
            if (next < 0 || next > lastSpread) continue;
            for (const index of pageIndicesForSpread(next, pages.length)) {
                indices.add(index);
            }
        }
        return indices;
    }, [spread, sheet, lastSpread, pages.length]);

    const warmedPages = useRef(new Set());
    for (const index of activePages) warmedPages.current.add(index);

    return (
        <group position={position} rotation={rotation} scale={scale}>
            {pages.map((page, index) => (
                <PageTextureSlot
                    key={index}
                    page={page}
                    flipX={index % 2 === 1}
                    onSlot={slotSetters[index]}
                    enabled={warmedPages.current.has(index)}
                />
            ))}

            <SheetFace
                name="LeftPage"
                geometry={leftGeo}
                map={slots[leftIndex]?.texture}
                meshRef={leftMesh}
                materialRef={leftMat}
                side={THREE.FrontSide}
                lift={0.00035}
            />
            {rightIndex < pages.length && (
                <SheetFace
                    name="RightPage"
                    geometry={rightGeo}
                    map={slots[rightIndex]?.texture}
                    meshRef={rightMesh}
                    materialRef={rightMat}
                    side={THREE.FrontSide}
                    lift={0.00035}
                />
            )}
            {turning && (
                <>
                    <SheetFace
                        name="TurningPage"
                        geometry={turnGeo}
                        map={slots[turnFrontIndex]?.texture}
                        materialRef={turnFrontMat}
                        side={THREE.FrontSide}
                        renderOrder={1}
                        lift={0.0008}
                    />
                    <SheetFace
                        geometry={turnGeo}
                        map={slots[turnBackIndex]?.texture}
                        materialRef={turnBackMat}
                        side={THREE.BackSide}
                        renderOrder={1}
                        lift={0.0008}
                    />
                </>
            )}
        </group>
    );
}
