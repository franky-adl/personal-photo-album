import "./style.css";
import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { CineonToneMapping } from "three";
import Experience from "./Experience.jsx";
import { setBookFocus, subscribeBookFocus } from "./Camera";
import { requestPageFlip, subscribePageNav } from "./objects/BookPages.jsx";
import {
    dismissLoadingOverlay,
    preloadSceneAssets,
    subscribeSceneReady,
    subscribeTitleReady,
} from "./utils/sceneLoader";

function hudClass(...parts) {
    return parts.filter(Boolean).join(" ");
}

function BookHud() {
    const [focused, setFocused] = useState(false);
    const [pageNav, setPageNav] = useState({ canPrev: false, canNext: true });

    useEffect(() => subscribeBookFocus(setFocused), []);
    useEffect(() => subscribePageNav(setPageNav), []);

    return (
        <>
            <button
                type="button"
                className={hudClass("book-back", focused && "is-visible")}
                aria-label="Back to desk"
                aria-hidden={!focused}
                tabIndex={focused ? 0 : -1}
                onClick={() => setBookFocus(false)}
            >
                <img src="./arrow-left.png" width="32" height="32" alt="" />
            </button>
            <button
                type="button"
                className={hudClass(
                    "page-nav",
                    "page-nav-prev",
                    focused && "is-visible",
                    !pageNav.canPrev && "is-disabled",
                )}
                aria-label="Previous page"
                aria-hidden={!focused}
                tabIndex={focused && pageNav.canPrev ? 0 : -1}
                disabled={!pageNav.canPrev}
                onClick={() => requestPageFlip(-1)}
            >
                <span className="page-nav-icon">
                    <img src="./arrow.png" width="32" height="32" alt="" />
                </span>
            </button>
            <button
                type="button"
                className={hudClass(
                    "page-nav",
                    "page-nav-next",
                    focused && "is-visible",
                    !pageNav.canNext && "is-disabled",
                )}
                aria-label="Next page"
                aria-hidden={!focused}
                tabIndex={focused && pageNav.canNext ? 0 : -1}
                disabled={!pageNav.canNext}
                onClick={() => requestPageFlip(1)}
            >
                <span className="page-nav-icon">
                    <img src="./arrow.png" width="32" height="32" alt="" />
                </span>
            </button>
        </>
    );
}

function App() {
    const [canLoadScene, setCanLoadScene] = useState(false);

    useEffect(() => subscribeTitleReady(() => setCanLoadScene(true)), []);
    useEffect(() => subscribeSceneReady(dismissLoadingOverlay), []);

    return (
        <>
            {canLoadScene && (
                <Canvas
                    gl={{
                        toneMapping: CineonToneMapping,
                        toneMappingExposure: 1.1,
                    }}
                    camera={{
                        fov: 21,
                        near: 0.1,
                        far: 200,
                        position: [6, 3.8, 1.5],
                    }}
                >
                    <Experience />
                </Canvas>
            )}
            <BookHud />
        </>
    );
}

preloadSceneAssets();

const root = ReactDOM.createRoot(document.querySelector("#root"));
root.render(<App />);
