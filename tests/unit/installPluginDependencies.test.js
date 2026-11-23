import JSZip from "jszip";
import Url from "utils/Url";
import * as version from "utils/version";
import { expect, it, vi } from "vitest";
import { loadSourceModule } from "../helpers/loadSourceModule";

const API_BASE = "https://acode.app/api";
const PLUGIN_DIR = "file:///data/plugins";
const esm = (value) => ({ __esModule: true, default: value });

async function pluginZip(id, dependencies) {
	const zip = new JSZip();
	zip.file(
		"plugin.json",
		JSON.stringify({ id, name: id, main: "main.js", dependencies }),
	);
	zip.file("main.js", "");
	return zip.generateAsync({ type: "arraybuffer" });
}

async function setup(registry, zips, installed = {}) {
	const reads = [];
	const confirm = vi.fn(async () => true);
	const fsOperation = (...parts) => {
		const url = parts.length > 1 ? Url.join(...parts) : parts[0];
		return {
			exists: async () =>
				url === PLUGIN_DIR || url.slice(PLUGIN_DIR.length + 1) in installed,
			createDirectory: async () => {},
			createFile: async () => {},
			writeFile: async () => {},
			delete: async () => {},
			lsDir: async () => [],
			readFile: async () => {
				reads.push(url);
				const installedId = url.match(/\/plugins\/(\w+)\/plugin\.json$/)?.[1];
				if (installedId in installed) return installed[installedId];
				if (url.startsWith(`${API_BASE}/plugin/download/`)) {
					const id = url.slice(`${API_BASE}/plugin/download/`.length);
					const zip = zips[id.split("?")[0]];
					if (zip) return zip;
				} else if (url.startsWith(`${API_BASE}/plugin/`)) {
					const manifest = registry[url.slice(`${API_BASE}/plugin/`.length)];
					if (manifest) return manifest;
				} else if (zips[url]) {
					return zips[url];
				}
				throw new Error(`404 ${url}`);
			},
		};
	};
	const loaderDialog = {
		show() {},
		setMessage() {},
		destroy() {},
	};
	const { default: installPlugin } = loadSourceModule(
		"src/lib/installPlugin.js",
		{
			fileSystem: esm(fsOperation),
			"dialogs/alert": esm(vi.fn()),
			"dialogs/confirm": esm(confirm),
			"dialogs/loader": esm({ create: () => loaderDialog }),
			"handlers/purchase": esm(vi.fn()),
			jszip: esm(JSZip),
			"utils/helpers": esm({
				promisify: async () => [],
				checkAPIStatus: async () => true,
			}),
			"utils/Url": esm(Url),
			"utils/version": version,
			"./config": esm({ API_BASE }),
			"./installState": esm({
				new: async () => ({
					exists: () => false,
					isUpdated: async () => true,
					save: async () => {},
					clear: async () => {},
				}),
			}),
			"./loadPlugins": { loadPluginWithTimeout: async () => {} },
		},
		{
			strings: { installing: "Installing...", loading: "Loading" },
			PLUGIN_DIR,
			DATA_STORAGE: "file:///data",
			device: { uuid: "x", version: 14 },
			BuildInfo: { packageName: "com.foxdebug.acode" },
			window: { log() {} },
			iap: {},
		},
	);
	return { installPlugin, reads, confirm };
}

const registry = {
	b: { id: "b", name: "B", version: "1.0.0", dependencies: ["c"] },
	c: { id: "c", name: "C", version: "1.0.0" },
};

async function zips() {
	return {
		"file:///sdcard/a.zip": await pluginZip("a", ["b"]),
		b: await pluginZip("b", ["c"]),
		c: await pluginZip("c"),
	};
}

function downloads(reads) {
	return reads
		.filter((url) => url.includes("/plugin/download/"))
		.map((url) => url.split("?")[0]);
}

it("installs a dependency's own dependencies", async () => {
	const { installPlugin, reads, confirm } = await setup(registry, await zips());

	await installPlugin("file:///sdcard/a.zip");

	expect(confirm.mock.calls[0][1]).toMatch(/<br \/><br \/>C, B$/);
	expect(downloads(reads)).toEqual([
		`${API_BASE}/plugin/download/c`,
		`${API_BASE}/plugin/download/b`,
	]);
});

it("skips a nested dependency that is already up to date", async () => {
	const { installPlugin, reads, confirm } = await setup(
		registry,
		await zips(),
		{ c: { version: "1.0.0" } },
	);

	await installPlugin("file:///sdcard/a.zip");

	expect(confirm.mock.calls[0][1]).toMatch(/<br \/><br \/>B$/);
	expect(downloads(reads)).toEqual([`${API_BASE}/plugin/download/b`]);
});
