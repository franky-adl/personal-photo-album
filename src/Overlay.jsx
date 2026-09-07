import { useEffect, useId, useRef, useState } from "react";
import { subscribeOverlayGone } from "./utils/sceneLoader";

const GITHUB_URL = "https://github.com/franky-adl/personal-photo-album";

const MODEL_CREDITS = [
    {
        name: "Desk Globe",
        href: "https://www.blendkit.com/asset-gallery-detail/25f2ec5a-fdc1-45e8-9644-7a57a581b3f4/",
        license: "Royalty free",
    },
    {
        name: "AT-AT walker",
        href: "https://sketchfab.com/3d-models/at-at-walker-star-wars-low-poly-719c023782fb4bb9898d15f9e3fcee6b",
        license: "CC Attribution",
    },
    {
        name: "BB8 Droid",
        href: "https://sketchfab.com/3d-models/bb8-droid-8d4f7dbd7dbd476c81e2a4c9bf0664f8",
        license: "CC Attribution",
    },
    {
        name: "Cup of coffee",
        href: "https://www.blenderkit.com/asset-gallery-detail/51c87c04-94ad-4978-b47d-a2b08fb01d96/",
        license: "Royalty free",
    },
    {
        name: "Minimalist LED Desk Lamp Black",
        href: "https://www.blenderkit.com/asset-gallery-detail/6892f7e9-d666-4848-8774-78da222d082b/",
        license: "Royalty free",
    },
    {
        name: "Individual Book Collection 1",
        href: "https://www.blenderkit.com/asset-gallery-detail/21733b10-75b3-4315-ad5d-d0dba6976f6e/",
        license: "Royalty free",
    },
    {
        name: "Decor Set - Perfume - Diffuser",
        href: "https://www.blendkit.com/asset-gallery-detail/ae037638-2aa6-4c04-ad28-3e150e44f196/",
        license: "Royalty free",
    },
    {
        name: "Book Anglomania",
        href: "https://www.blendkit.com/asset-gallery-detail/1db6b2ef-a78c-478f-82f9-131f7f0570af/",
        license: "Royalty free",
    },
    {
        name: "Notebook Checker Leather And Pen",
        href: "https://www.blendkit.com/asset-gallery-detail/9468bd0d-afbc-46ba-b1d9-1c2e72d56b71/",
        license: "Royalty free",
    },
    {
        name: "Monstera Plant",
        href: "https://www.blendkit.com/asset-gallery-detail/40baafef-1b26-4ca2-9ee4-75b011040264/",
        license: "Royalty free",
    },
];

function fabClass(...parts) {
    return parts.filter(Boolean).join(" ");
}

function InfoIcon() {
    return (
        <svg
            className="overlay-fab-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
            <path
                d="M12 11.1v5.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
            />
            <circle cx="12" cy="8.05" r="1.05" fill="currentColor" />
        </svg>
    );
}

function GithubIcon() {
    return (
        <svg
            className="overlay-fab-icon overlay-fab-icon-github"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path
                fill="currentColor"
                d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.28-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.22.7.82.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12z"
            />
        </svg>
    );
}

function CreditsModal({ open, onClose, titleId }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        const previouslyFocused = document.activeElement;
        dialogRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="credits-modal" role="presentation">
            <button
                type="button"
                className="credits-modal-backdrop"
                aria-label="Close credits"
                onClick={onClose}
            />
            <div
                ref={dialogRef}
                className="credits-modal-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="credits-modal-header">
                    <h2 id={titleId} className="credits-modal-title">
                        Credits
                    </h2>
                    <button
                        type="button"
                        className="credits-modal-close"
                        aria-label="Close credits"
                        onClick={onClose}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                        >
                            <path
                                d="M6 6l12 12M18 6 6 18"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
                <p className="credits-modal-intro">
                    Album photos are from free image platforms; the video is from{" "}
                    <a
                        href="https://pixabay.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Pixabay
                    </a>
                    . Sources of the free Blender models used in the scene:
                </p>
                <ul className="credits-modal-list">
                    {MODEL_CREDITS.map((credit) => (
                        <li key={credit.href}>
                            <a
                                href={credit.href}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {credit.name}
                            </a>
                            <span className="credits-modal-license">
                                {credit.license}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function Overlay() {
    const titleId = useId();
    const [ready, setReady] = useState(false);
    const [creditsOpen, setCreditsOpen] = useState(false);

    useEffect(() => subscribeOverlayGone(() => setReady(true)), []);

    return (
        <>
            <button
                type="button"
                className={fabClass(
                    "overlay-fab",
                    "overlay-fab-credits",
                    ready && "is-visible",
                )}
                aria-label="Open credits"
                aria-expanded={creditsOpen}
                aria-haspopup="dialog"
                onClick={() => setCreditsOpen(true)}
            >
                <InfoIcon />
            </button>
            <a
                className={fabClass(
                    "overlay-fab",
                    "overlay-fab-github",
                    ready && "is-visible",
                )}
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View source on GitHub"
            >
                <GithubIcon />
            </a>
            <CreditsModal
                open={creditsOpen}
                onClose={() => setCreditsOpen(false)}
                titleId={titleId}
            />
        </>
    );
}
