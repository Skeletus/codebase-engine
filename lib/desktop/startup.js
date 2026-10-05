// Injected by the native shell before frontend scripts: survives failed hydration.
(() => {
  let ready = false;
  let fallback;
  const timer = setTimeout(() => {
    if (ready || !document.body) return;
    fallback = document.createElement("section");
    fallback.id = "desktop-startup-error";
    fallback.setAttribute("role", "alert");
    fallback.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#171717;color:#eee;padding:32px;font:14px system-ui";
    const heading = document.createElement("h1");
    heading.textContent = "Codebase Intelligence could not finish starting";
    const message = document.createElement("p");
    message.textContent = "The frontend did not initialize within 15 seconds. Reload to retry, or restart the app and inspect its terminal output. Your stored analyses have not been deleted.";
    const retry = document.createElement("button");
    retry.textContent = "Reload application";
    retry.addEventListener("click", () => location.reload());
    fallback.append(heading, message, retry);
    document.body.append(fallback);
  }, 15000);
  window.addEventListener("desktop-ui-ready", () => {
    ready = true;
    clearTimeout(timer);
    fallback?.remove();
  }, { once: true });
})();
