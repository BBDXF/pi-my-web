import "./app.css";
import { mount } from "svelte";
import { initAppTheme } from "$lib/themes.svelte";
import { initFonts } from "$lib/fonts.svelte";
import { loadAndApplyCustomization } from "$lib/customization";
import App from "./App.svelte";

initAppTheme();
initFonts();
void loadAndApplyCustomization().catch(() => {});

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
