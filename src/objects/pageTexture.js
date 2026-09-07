/**
 * Synopsis:
 *
 * Album page albedo: paint photos, stamps, captions, and shadows into a
 * CanvasTexture so each page is one GPU sample. Also loads media, hit-tests
 * clicks in UV space, and drives video playback overlays.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export const EMPTY_TEXTS = [];
export const EMPTY_STAMPS = [];

export function unsplashPhoto(id, width = 900) {
    return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
}

const DEFAULT_SHADOW = {
    blur: 16,
    offsetX: 0,
    offsetY: 0,
    color: "rgba(32, 22, 14, 0.5)",
};

export const PLAY_ICON_RADIUS = 0.16;

export function isVideoSrc(src) {
    return /\.(mp4|webm|mov)(?:$|\?)/i.test(decodeURIComponent(src ?? ""));
}

/**
 * Draw paper + photos + stamps + text + contact shadows once into a CanvasTexture.
 * GPU cost is a single albedo sample; layout changes recompose on the CPU.
 *
 * Photo fields (UV space, 0–1):
 *   src, x, y     — image/video URL and center
 *   poster        — optional still for video pages
 *   rotation      — radians, clockwise in UV
 *   scale         — image width as a fraction of the page
 *   border        — optional white matte, as a fraction of page width
 *
 * Text fields (UV space, 0–1):
 *   text, x, y    — string (use \\n for line breaks) and block center
 *   rotation      — radians, clockwise in UV
 *   size          — font size as a fraction of the page width
 *   fontFamily, fontWeight, fontStyle
 *   color, align  — fill color; left | center | right
 *   lineHeight    — multiple of font size (default 1.25)
 *   letterSpacing — extra tracking, as a fraction of font size
 *   maxWidth      — optional wrap width as a fraction of the page
 *
 * Stamp fields (UV space, 0–1; no shadows, source alpha is preserved):
 *   src, x, y     — image URL and center
 *   rotation      — radians, clockwise in UV
 *   scale         — image width as a fraction of the page
 */
export function paintPage(
    ctx,
    {
        assets,
        photos,
        texts = [],
        stamps = [],
        stampImages = [],
        size = 1024,
        paper = "#efe6d6",
        gutter = null,
        shadow = DEFAULT_SHADOW,
        flipX = false,
        playingPhotoIndex = -1,
    },
) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (flipX) {
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
    }

    paintPaper(ctx, size, paper, gutter);

    for (let i = 0; i < photos.length; i++) {
        drawPhoto(
            ctx,
            assets[i],
            photos[i],
            size,
            shadow,
            i === playingPhotoIndex,
        );
    }

    for (let i = 0; i < stamps.length; i++) {
        drawStamp(ctx, stampImages[i], stamps[i], size);
    }

    for (const item of texts) {
        drawText(ctx, item, size);
    }
}

export function composePageTexture(options) {
    const size = options.size ?? 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });
    paintPage(ctx, { ...options, size });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

export function mediaHitAt(photos, assets, uv, flipX = false) {
    if (!uv || !photos?.length) return null;

    const x = flipX ? 1 - uv.x : uv.x;
    const y = uv.y;

    for (let i = photos.length - 1; i >= 0; i--) {
        const photo = photos[i];
        const asset = assets?.[i];
        if (!asset?.video) continue;

        const { width, height } = photoSize(photo, asset);
        const dx = x - photo.x;
        const dy = y - photo.y;
        const rot = -(photo.rotation ?? 0);
        const lx = dx * Math.cos(rot) - dy * Math.sin(rot);
        const ly = dx * Math.sin(rot) + dy * Math.cos(rot);
        if (Math.abs(lx) > width / 2 || Math.abs(ly) > height / 2) continue;

        const iconR = Math.min(width, height) * PLAY_ICON_RADIUS;
        return {
            photoIndex: i,
            onIcon: lx * lx + ly * ly <= iconR * iconR,
        };
    }

    return null;
}

export function usePageTexture(
    photos,
    gutter = null,
    texts = EMPTY_TEXTS,
    stamps = EMPTY_STAMPS,
    flipX = false,
    enabled = true,
) {
    const photoKey = photos
        .map((photo) => `${photo.src}|${photo.poster ?? ""}`)
        .join("|");
    const layoutKey = photos
        .map(
            (photo) =>
                `${photo.x}|${photo.y}|${photo.rotation ?? 0}|${photo.scale ?? 0.5}|${photo.border ?? ""}`,
        )
        .join(";");
    const textKey = texts
        .map((item) =>
            [
                item.text,
                item.x,
                item.y,
                item.rotation ?? 0,
                item.size ?? "",
                item.color ?? "",
                item.fontFamily ?? "",
                item.fontWeight ?? "",
                item.fontStyle ?? "",
                item.align ?? "",
            ].join("|"),
        )
        .join(";");
    const stampSrcKey = stamps.map((stamp) => stamp.src ?? "").join("|");
    const stampLayoutKey = stamps
        .map(
            (stamp) =>
                `${stamp.x}|${stamp.y}|${stamp.rotation ?? 0}|${stamp.scale ?? 0.5}`,
        )
        .join(";");

    const photosRef = useRef(photos);
    const textsRef = useRef(texts);
    const stampsRef = useRef(stamps);
    photosRef.current = photos;
    textsRef.current = texts;
    stampsRef.current = stamps;

    const [assets, setAssets] = useState(null);
    const [stampImages, setStampImages] = useState(null);
    const [fontsReady, setFontsReady] = useState(false);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        setAssets(null);

        Promise.all(photosRef.current.map(loadAsset)).then((loaded) => {
            if (!cancelled) {
                setAssets(loaded);
                return;
            }
            disposeAssets(loaded);
        });

        return () => {
            cancelled = true;
        };
    }, [enabled, photoKey]);

    useEffect(() => {
        if (!enabled) return undefined;

        let cancelled = false;
        const currentStamps = stampsRef.current;
        if (currentStamps.length === 0) {
            setStampImages([]);
            return undefined;
        }

        setStampImages(null);
        Promise.all(currentStamps.map((stamp) => loadImage(stamp.src))).then(
            (loaded) => {
                if (!cancelled) setStampImages(loaded);
            },
        );

        return () => {
            cancelled = true;
        };
    }, [enabled, stampSrcKey]);

    useEffect(() => () => disposeAssets(assets), [assets]);

    useEffect(() => {
        if (!enabled) return undefined;

        const currentTexts = textsRef.current;
        if (
            typeof document === "undefined" ||
            !document.fonts ||
            currentTexts.length === 0
        ) {
            setFontsReady(true);
            return undefined;
        }

        let cancelled = false;
        setFontsReady(false);
        const specs = currentTexts.map((item) => fontSpec(item, 16));
        Promise.all([
            document.fonts.ready,
            ...specs.map((spec) =>
                document.fonts.load(spec).catch(() => undefined),
            ),
        ]).then(() => {
            if (!cancelled) setFontsReady(true);
        });

        return () => {
            cancelled = true;
        };
    }, [enabled, textKey]);

    const texture = useMemo(() => {
        if (!assets || !stampImages || !fontsReady) return null;
        return composePageTexture({
            assets,
            photos: photosRef.current,
            texts: textsRef.current,
            stamps: stampsRef.current,
            stampImages,
            gutter,
            flipX,
        });
    }, [
        assets,
        stampImages,
        fontsReady,
        photoKey,
        layoutKey,
        textKey,
        stampSrcKey,
        stampLayoutKey,
        gutter,
        flipX,
    ]);

    const textureRef = useRef(texture);
    const assetsRef = useRef(assets);
    const stampImagesRef = useRef(stampImages);
    textureRef.current = texture;
    assetsRef.current = assets;
    stampImagesRef.current = stampImages;

    const redraw = useCallback(
        (playingPhotoIndex = -1) => {
            const tex = textureRef.current;
            const loaded = assetsRef.current;
            if (!tex?.image || !loaded) return;
            const ctx = tex.image.getContext("2d", { alpha: false });
            paintPage(ctx, {
                assets: loaded,
                photos: photosRef.current,
                texts: textsRef.current,
                stamps: stampsRef.current,
                stampImages: stampImagesRef.current,
                size: tex.image.width,
                gutter,
                flipX,
                playingPhotoIndex,
            });
            tex.needsUpdate = true;
        },
        [gutter, flipX],
    );

    useEffect(() => () => texture?.dispose(), [texture]);

    return useMemo(
        () => (texture ? { texture, assets, redraw } : null),
        [texture, assets, redraw],
    );
}

function paintPaper(ctx, size, paper, gutter) {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, size, size);

    if (!gutter) return;

    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    if (gutter === "right") {
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(0.8, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(42, 28, 18, 0.4)");
    } else {
        gradient.addColorStop(0, "rgba(42, 28, 18, 0.4)");
        gradient.addColorStop(0.2, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
}

function drawPhoto(ctx, asset, photo, size, shadow, playing = false) {
    const { x, y, rotation = 0, border = 0.016 } = photo;
    const { width, height } = photoSize(photo, asset);
    const photoWidth = width * size;
    const photoHeight = height * size;
    const matte = border * size;
    const cx = x * size;
    const cy = y * size;

    ctx.save();
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    ctx.fillStyle = "#f7f2ea";
    ctx.fillRect(
        -photoWidth / 2 - matte,
        -photoHeight / 2 - matte,
        photoWidth + matte * 2,
        photoHeight + matte * 2,
    );

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const drawn = drawMedia(
        ctx,
        asset,
        playing,
        -photoWidth / 2,
        -photoHeight / 2,
        photoWidth,
        photoHeight,
    );
    if (!drawn) {
        ctx.fillStyle = "#c8b8a4";
        ctx.fillRect(
            -photoWidth / 2,
            -photoHeight / 2,
            photoWidth,
            photoHeight,
        );
    }

    if (asset?.video && !playing) {
        drawPlayIcon(ctx, photoWidth, photoHeight);
    }

    ctx.restore();
}

function drawStamp(ctx, image, stamp, size) {
    if (!image) return;

    const { x, y, rotation = 0 } = stamp;
    const scale = stamp.scale ?? 0.5;
    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    const aspect =
        sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1;
    const stampWidth = scale * size;
    const stampHeight = stampWidth / aspect;

    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.translate(x * size, y * size);
    ctx.rotate(rotation);
    ctx.drawImage(
        image,
        -stampWidth / 2,
        -stampHeight / 2,
        stampWidth,
        stampHeight,
    );
    ctx.restore();
}

function photoSize(photo, asset) {
    const scale = photo.scale ?? 0.5;
    const sourceWidth = asset?.width || 0;
    const sourceHeight = asset?.height || 0;
    const aspect =
        sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 1.5;
    return { width: scale, height: scale / aspect };
}

function mediaSource(asset, playing) {
    const video = asset?.video;
    if (
        video &&
        video.readyState >= 2 &&
        (playing || video.currentTime > 0.04)
    ) {
        return video;
    }
    return asset?.preview ?? null;
}

function drawMedia(ctx, asset, playing, dx, dy, dw, dh) {
    const source = mediaSource(asset, playing);
    if (!source) return false;

    if (source === asset?.video) {
        const vw = source.videoWidth;
        const vh = source.videoHeight;
        const previewLandscape = (asset.width || 0) >= (asset.height || 0);
        const frameLandscape = vw >= vh;
        if (vw && vh && previewLandscape !== frameLandscape) {
            ctx.save();
            ctx.translate(dx + dw / 2, dy + dh / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(source, -dh / 2, -dw / 2, dh, dw);
            ctx.restore();
            return true;
        }
    }

    ctx.drawImage(source, dx, dy, dw, dh);
    return true;
}

function drawPlayIcon(ctx, photoWidth, photoHeight) {
    const radius = Math.min(photoWidth, photoHeight) * PLAY_ICON_RADIUS;

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(22, 16, 12, 0.4)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.055);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.94)";
    ctx.stroke();

    const height = radius * 0.86;
    const width = height * 0.78;
    const ax = -width * 0.22;
    const ay = -height / 2;
    const bx = -width * 0.22;
    const by = height / 2;
    const cx = width * 0.68;
    const cy = 0;
    const corner = height * 0.1;

    ctx.beginPath();
    ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
    ctx.arcTo(bx, by, cx, cy, corner);
    ctx.arcTo(cx, cy, ax, ay, corner);
    ctx.arcTo(ax, ay, bx, by, corner);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = radius * 0.12;
    ctx.fill();
    ctx.restore();
}

export function loadImage(src) {
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
    });
}

function createVideoElement(src) {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.playsInline = true;
    video.loop = true;
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.src = src;
    video.load();
    return video;
}

function waitForVideoFrame(video, timeoutMs = 15000) {
    return new Promise((resolve) => {
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("seeked", onSeeked);
            video.removeEventListener("error", onError);
            clearTimeout(timer);
            resolve(ok);
        };
        const onError = () => finish(false);
        const onSeeked = () => finish(video.videoWidth > 0);
        const onReady = () => {
            if (video.videoWidth === 0) return;
            try {
                video.currentTime = Math.min(
                    0.08,
                    (video.duration || 1) * 0.01,
                );
            } catch {
                finish(true);
            }
        };
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        const timer = setTimeout(
            () => finish(video.readyState >= 2 && video.videoWidth > 0),
            timeoutMs,
        );
        if (video.readyState >= 2 && video.videoWidth > 0) onReady();
    });
}

function captureVideoPreview(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas;
}

async function loadAsset(photo) {
    if (!isVideoSrc(photo.src)) {
        const preview = await loadImage(photo.src);
        return {
            preview,
            video: null,
            width: preview?.naturalWidth || 0,
            height: preview?.naturalHeight || 0,
        };
    }

    const video = createVideoElement(photo.src);
    let preview = photo.poster ? await loadImage(photo.poster) : null;
    if (!preview) {
        const ready = await waitForVideoFrame(video);
        if (ready) preview = captureVideoPreview(video);
        video.pause();
        try {
            video.currentTime = 0;
        } catch {
            /* ignore seek failures before metadata */
        }
    }

    return {
        preview,
        video,
        width: preview?.naturalWidth || preview?.width || video.videoWidth || 0,
        height:
            preview?.naturalHeight || preview?.height || video.videoHeight || 0,
    };
}

function disposeAssets(list) {
    if (!list) return;
    for (const asset of list) {
        const video = asset?.video;
        if (!video) continue;
        video.pause();
        video.removeAttribute("src");
        video.load();
    }
}

function fontSpec(item, fontSizePx) {
    const fontStyle = item.fontStyle ?? "normal";
    const fontWeight = item.fontWeight ?? 400;
    const fontFamily = item.fontFamily ?? "Caveat, cursive";
    return `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
}

function wrapLines(ctx, text, maxWidthPx) {
    const paragraphs = String(text ?? "").split("\n");
    if (!maxWidthPx) return paragraphs;

    const lines = [];
    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push("");
            continue;
        }

        const words = paragraph.split(/\s+/);
        let current = "";
        for (const word of words) {
            const next = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(next).width > maxWidthPx) {
                lines.push(current);
                current = word;
            } else {
                current = next;
            }
        }
        lines.push(current);
    }
    return lines;
}

function drawText(ctx, item, size) {
    const {
        text,
        x,
        y,
        rotation = 0,
        size: fontSizeUv = 0.04,
        fontFamily = "Caveat, cursive",
        fontWeight = 400,
        fontStyle = "normal",
        color = "#3a2f24",
        align = "center",
        lineHeight = 1.25,
        letterSpacing = 0,
        maxWidth,
    } = item;

    const fontSize = fontSizeUv * size;
    ctx.font = fontSpec({ fontStyle, fontWeight, fontFamily }, fontSize);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) {
        ctx.letterSpacing = `${letterSpacing * fontSize}px`;
    }

    const maxWidthPx = maxWidth ? maxWidth * size : undefined;
    const lines = wrapLines(ctx, text, maxWidthPx);
    const linePx = fontSize * lineHeight;
    const widths = lines.map((line) => ctx.measureText(line).width);
    const blockHeight = Math.max(lines.length, 1) * linePx;
    const startY = -blockHeight / 2 + fontSize * 0.82;

    ctx.save();
    ctx.translate(x * size, y * size);
    ctx.rotate(rotation);

    for (let i = 0; i < lines.length; i++) {
        let lineX = 0;
        if (align === "center") lineX = -widths[i] / 2;
        else if (align === "right") lineX = -widths[i];
        ctx.fillText(lines[i], lineX, startY + i * linePx);
    }

    ctx.restore();
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
