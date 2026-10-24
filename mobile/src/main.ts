import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");

if (window.visualViewport) {
	const vv = window.visualViewport;
	const update = () =>
		document.documentElement.style.setProperty(
			"--kb",
			`${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`,
		);
	vv.addEventListener("resize", update);
	vv.addEventListener("scroll", update);
}
