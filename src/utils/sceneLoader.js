/**
 * Coordinates the loading overlay → title intro → 3D scene preload sequence.
 *
 * Call `preloadSceneAssets()` once at startup. Subscribe to `subscribeTitleReady`
 * before mounting the Canvas so the title can play first, then mount
 * `<SceneReadyGate />` inside the Canvas. Register album stills with
 * `registerPageImages()` and call `notifyInitialPagesReady()` when the first
 * page textures exist. `subscribeSceneReady` fires when all of those are done;
 * typically wire it to `dismissLoadingOverlay()`. Use `subscribeOverlayGone`
 * for animations that should wait until the overlay is fully removed.
 */

import { useEffect, useRef } from "react";
import { DefaultLoadingManager } from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { isVideoSrc, loadImage } from "../objects/pageTexture";

gsap.registerPlugin(SplitText);

const SCENE_GLB = "./Desk.glb";
const SCENE_TEXTURES = [
    "./BakeMap.webp",
    "./BakeMap2.webp",
    "./AT_AT.jpg",
    "./perlin.png",
];

const SCENE_FILES = new Set([
    "Desk.glb",
    "BakeMap.webp",
    "BakeMap2.webp",
    "AT_AT.jpg",
    "perlin.png",
]);

const listeners = new Set();
const titleListeners = new Set();
let started = false;
let sceneLoadStarted = false;
let assetsReady = false;
let sceneMounted = false;
let titleReady = false;
let pageStillsReady = false;
let initialPagesReady = false;
let pagesReady = false;
let notified = false;
let pageStillUrls = [];

function fileName(url) {
    try {
        const path = decodeURIComponent(String(url).split("?")[0]);
        return path.split("/").pop();
    } catch {
        return String(url);
    }
}

function flush() {
    if (
        notified ||
        !assetsReady ||
        !sceneMounted ||
        !titleReady ||
        !pagesReady
    ) {
        return;
    }
    notified = true;
    for (const listener of listeners) listener();
    listeners.clear();
}

function markAssetsReady() {
    if (assetsReady) return;
    assetsReady = true;
    flush();
}

function markSceneMounted() {
    if (sceneMounted) return;
    sceneMounted = true;
    // The Canvas tree only commits after useGLTF / useTexture resolve,
    // so a cache hit (HMR) still counts as assets ready.
    assetsReady = true;
    flush();
}

function markTitleReady() {
    if (titleReady) return;
    titleReady = true;
    flush();
    requestAnimationFrame(beginSceneLoad);
}

function tryMarkPagesReady() {
    if (pagesReady || !pageStillsReady || !initialPagesReady) return;
    pagesReady = true;
    flush();
}

export function registerPageImages(pages) {
    const urls = new Set();
    for (const page of pages ?? []) {
        for (const photo of page.photos ?? []) {
            if (photo.poster) urls.add(photo.poster);
            if (photo.src && !isVideoSrc(photo.src)) urls.add(photo.src);
        }
        for (const stamp of page.stamps ?? []) {
            if (stamp.src) urls.add(stamp.src);
        }
    }
    pageStillUrls = [...urls];
}

export function notifyInitialPagesReady() {
    if (initialPagesReady) return;
    initialPagesReady = true;
    tryMarkPagesReady();
}

function preloadPageStills() {
    if (pageStillUrls.length === 0) {
        pageStillsReady = true;
        tryMarkPagesReady();
        return;
    }

    Promise.all(pageStillUrls.map((url) => loadImage(url))).then(() => {
        pageStillsReady = true;
        tryMarkPagesReady();
    });
}

function beginSceneLoad() {
    if (sceneLoadStarted) return;
    sceneLoadStarted = true;
    watchSceneAssets();
    useGLTF.preload(SCENE_GLB);
    for (const url of SCENE_TEXTURES) {
        useTexture.preload(url);
    }
    preloadPageStills();
    for (const listener of titleListeners) listener();
    titleListeners.clear();
}

function revealLandscapeHint() {
    document
        .querySelector(".loading-landscape-hint")
        ?.classList.add("is-visible");
}

function playTitleIntro() {
    revealLandscapeHint();

    const title = document.querySelector(".loading-title");
    if (!title) {
        markTitleReady();
        return;
    }

    const start = () => {
        try {
            const split = SplitText.create(title, {
                type: "words, chars",
            });
            const chars = split.chars;

            if (!chars.length) {
                title.classList.add("is-split");
                markTitleReady();
                return;
            }

            title.classList.add("is-split");

            const intro = gsap.timeline({
                onComplete: markTitleReady,
            });

            intro.from(
                chars,
                {
                    y: 56,
                    duration: 0.85,
                    stagger: 0.034,
                    ease: "back.out(1.8)",
                    force3D: true,
                },
                0,
            );
            intro.from(
                chars,
                {
                    opacity: 0,
                    duration: 0.45,
                    stagger: 0.034,
                    ease: "power2.out",
                },
                0,
            );
        } catch {
            title.classList.add("is-split");
            markTitleReady();
        }
    };

    const fonts = document.fonts;
    if (fonts?.ready) {
        fonts.ready.then(start).catch(start);
    } else {
        start();
    }
}

function watchSceneAssets() {
    const pending = new Set(SCENE_FILES);
    const manager = DefaultLoadingManager;
    const prevProgress = manager.onProgress;
    const prevError = manager.onError;

    const settle = (url) => {
        if (assetsReady) return;
        pending.delete(fileName(url));
        if (pending.size > 0) return;

        manager.onProgress = prevProgress;
        manager.onError = prevError;
        markAssetsReady();
    };

    manager.onProgress = (url, loaded, total) => {
        prevProgress?.(url, loaded, total);
        settle(url);
    };
    manager.onError = (url) => {
        prevError?.(url);
        settle(url);
    };
}

export function preloadSceneAssets() {
    if (started) return;
    started = true;
    playTitleIntro();
}

export function subscribeTitleReady(listener) {
    if (sceneLoadStarted) {
        listener();
    } else {
        titleListeners.add(listener);
    }
    return () => titleListeners.delete(listener);
}

export function subscribeSceneReady(listener) {
    if (notified) {
        listener();
    } else {
        listeners.add(listener);
    }
    return () => listeners.delete(listener);
}

export function SceneReadyGate() {
    const sent = useRef(false);

    useEffect(() => {
        if (sent.current) return;
        sent.current = true;
        const frame = requestAnimationFrame(() => markSceneMounted());
        return () => cancelAnimationFrame(frame);
    }, []);

    return null;
}

const overlayGoneListeners = new Set();
let overlayGone = false;

function markOverlayGone() {
    if (overlayGone) return;
    overlayGone = true;
    for (const listener of overlayGoneListeners) listener();
    overlayGoneListeners.clear();
}

export function subscribeOverlayGone(listener) {
    if (overlayGone) {
        listener();
    } else {
        overlayGoneListeners.add(listener);
    }
    return () => overlayGoneListeners.delete(listener);
}

export function dismissLoadingOverlay() {
    const overlay = document.getElementById("loading-overlay");
    if (!overlay) {
        markOverlayGone();
        return;
    }
    if (overlay.classList.contains("is-hidden")) return;

    overlay.classList.add("is-hidden");
    overlay.setAttribute("aria-busy", "false");
    overlay.setAttribute("aria-hidden", "true");

    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        overlay.remove();
        markOverlayGone();
    };

    overlay.addEventListener("transitionend", (event) => {
        if (event.propertyName === "opacity") remove();
    });
    window.setTimeout(remove, 1200);
}
