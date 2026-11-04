import "./app.css";
import { mount } from "svelte";
import { initAppTheme } from "$lib/themes.svelte";
import { loadAndApplyCustomization } from "$lib/customization";
import App from "./App.svelte";

initAppTheme();
void loadAndApplyCustomization().catch(() => {});

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
