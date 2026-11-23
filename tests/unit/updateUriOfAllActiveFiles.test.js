import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fileSystem", () => ({ default: vi.fn() }));
vi.mock("dialogs/alert", () => ({ default: vi.fn() }));
vi.mock("lib/adRewards", () => ({ default: {} }));
vi.mock("lib/config", () => ({ default: {} }));
vi.mock("lib/fileIcons", () => ({ default: {} }));
vi.mock("lib/startAd", () => ({
	interstitialAd: null,
	requestBannerForPage: vi.fn(),
}));

import helpers from "utils/helpers";

function openTabs(...uris) {
	const files = uris.map((uri) => ({
		uri,
		filename: uri.split("/").at(-1),
	}));
	globalThis.editorManager = {
		files,
		onupdate: vi.fn(),
		emit: vi.fn(),
	};
	return files;
}

describe("helpers.updateUriOfAllActiveFiles", () => {
	beforeEach(() => {
		delete globalThis.editorManager;
	});
	afterEach(() => {
		delete globalThis.editorManager;
	});

	it("keeps the sub-path of files nested in a renamed folder", () => {
		const files = openTabs(
			"file:///sdcard/proj/src/index.js",
			"file:///sdcard/proj/src/components/Button.js",
			"file:///sdcard/proj/src/a/b/c.js",
		);

		helpers.updateUriOfAllActiveFiles(
			"file:///sdcard/proj/src",
			"file:///sdcard/proj/lib",
		);

		expect(files.map((file) => file.uri)).toEqual([
			"file:///sdcard/proj/lib/index.js",
			"file:///sdcard/proj/lib/components/Button.js",
			"file:///sdcard/proj/lib/a/b/c.js",
		]);
	});

	it("leaves sibling folders that share the name prefix alone", () => {
		const [inside, sibling] = openTabs(
			"file:///sdcard/proj/src/index.js",
			"file:///sdcard/proj/src-old/legacy.js",
		);

		helpers.updateUriOfAllActiveFiles(
			"file:///sdcard/proj/src",
			"file:///sdcard/proj/lib",
		);

		expect(inside.uri).toBe("file:///sdcard/proj/lib/index.js");
		expect(sibling.uri).toBe("file:///sdcard/proj/src-old/legacy.js");
	});

	it("detaches only files inside a deleted folder", () => {
		const [inside, sibling] = openTabs(
			"file:///sdcard/proj/src/x.js",
			"file:///sdcard/proj/src-old/legacy.js",
		);

		helpers.updateUriOfAllActiveFiles("file:///sdcard/proj/src", null);

		expect(inside.uri).toBeNull();
		expect(sibling.uri).toBe("file:///sdcard/proj/src-old/legacy.js");
	});

	it("moves a file whose own url was renamed to the new url", () => {
		const [file] = openTabs("file:///sdcard/proj/old.js");

		helpers.updateUriOfAllActiveFiles(
			"file:///sdcard/proj/old.js",
			"file:///sdcard/proj/new.js",
		);

		expect(file.uri).toBe("file:///sdcard/proj/new.js");
	});
});
