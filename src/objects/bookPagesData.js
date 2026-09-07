import pages from "./bookPages.json";

const album = (name) => `./album/${encodeURIComponent(name.normalize("NFD"))}`;

const captionDefaults = {
    size: 0.04,
    fontFamily: "Caveat, cursive",
    fontWeight: 500,
    fontStyle: "normal",
    color: "#2c2c2c",
    align: "center",
    letterSpacing: 0,
};

function hydrateMedia(item) {
    return {
        ...item,
        src: album(item.src),
        ...(item.poster ? { poster: album(item.poster) } : {}),
    };
}

export const BOOK_PAGES = pages.map((page) => ({
    ...page,
    photos: (page.photos ?? []).map(hydrateMedia),
    texts: (page.texts ?? []).map((item) => ({ ...captionDefaults, ...item })),
    stamps: (page.stamps ?? []).map(hydrateMedia),
}));
