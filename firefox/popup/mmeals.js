// This file is shared between the Chrome and Firefox builds. Keep the copies in
// `chrome/popup/` and `firefox/popup/` identical.
//
// Both browsers expose the promise-based `browser` namespace here: Firefox
// natively, and Chrome (Manifest V3) exposes promise-based `chrome` APIs. So a
// single alias lets the rest of the code stay browser-agnostic.
const browser = globalThis.browser || globalThis.chrome;

const IS_FIREFOX = typeof globalThis.browser !== "undefined";

const API_BASE_URL = "https://api.managemeals.com";

// Namespace the stored auth cookies per browser so the two builds never clash.
const ACCESS_TOKEN_COOKIE_NAME = `mmeals_${
  IS_FIREFOX ? "firefox" : "chrome"
}_access_token`;
const REFRESH_TOKEN_COOKIE_NAME = `mmeals_${
  IS_FIREFOX ? "firefox" : "chrome"
}_refresh_token`;
const COOKIE_ACCESS_TOKEN_EXPIRE_SEC = 600;
const COOKIE_REFRESH_TOKEN_EXPIRE_SEC = 2629746;

const show = (selector) => document.querySelector(selector).classList.remove("hidden");
const hide = (selector) => document.querySelector(selector).classList.add("hidden");

const setStatus = (selector, message, variant) => {
  const el = document.querySelector(selector);
  el.textContent = message || "";
  el.className = message ? `alert ${variant}` : "alert hidden";
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char])
  );

/***
 * Auth token storage (cookies scoped to the API origin)
 */
const storeTokens = async (accessToken, refreshToken) => {
  const epoch = Math.floor(Date.now() / 1000);
  await browser.cookies.set({
    name: ACCESS_TOKEN_COOKIE_NAME,
    value: accessToken,
    expirationDate: epoch + COOKIE_ACCESS_TOKEN_EXPIRE_SEC,
    url: `${API_BASE_URL}/`,
  });
  await browser.cookies.set({
    name: REFRESH_TOKEN_COOKIE_NAME,
    value: refreshToken,
    expirationDate: epoch + COOKIE_REFRESH_TOKEN_EXPIRE_SEC,
    url: `${API_BASE_URL}/`,
  });
};

const readTokenCookies = async () => {
  const epoch = Math.floor(Date.now() / 1000);
  const cookieUrl = `${API_BASE_URL}/`;

  const accessCookie =
    (await browser.cookies.get({
      name: ACCESS_TOKEN_COOKIE_NAME,
      url: cookieUrl,
    })) || {};
  const refreshCookie =
    (await browser.cookies.get({
      name: REFRESH_TOKEN_COOKIE_NAME,
      url: cookieUrl,
    })) || {};

  let accessToken = accessCookie.value || "";
  if (!accessCookie.expirationDate || epoch >= accessCookie.expirationDate) {
    accessToken = "";
  }

  let refreshToken = refreshCookie.value || "";
  if (!refreshCookie.expirationDate || epoch >= refreshCookie.expirationDate) {
    refreshToken = "";
  }

  return { accessToken, refreshToken };
};

/***
 * Load the current tab URL and the available categories and tags
 */
const setCurrentTabUrl = async () => {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url || "";
    document.querySelector("input#url").value = url;
    return url;
  } catch (e) {
    console.error(e);
    return "";
  }
};

const loadData = async (accessToken) => {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const [categoriesRes, tagsRes] = await Promise.all([
    fetch(`${API_BASE_URL}/v1/categories`, { headers }),
    fetch(`${API_BASE_URL}/v1/tags`, { headers }),
  ]);

  if (!categoriesRes.ok || !tagsRes.ok) {
    throw new Error("Could not load categories and tags");
  }

  const categories = await categoriesRes.json();
  document.querySelector("#categories-list").innerHTML = categories
    .map(
      (c) =>
        `<button type="button" class="sm" data-uuid="${escapeHtml(
          c.uuid
        )}">${escapeHtml(c.name)}</button>`
    )
    .join("");

  const tags = await tagsRes.json();
  document.querySelector("#tags-list").innerHTML = tags
    .map(
      (t) =>
        `<button type="button" class="sm" data-uuid="${escapeHtml(
          t.uuid
        )}">${escapeHtml(t.name)}</button>`
    )
    .join("");
};

/***
 * Import the recipe with the selected categories and tags
 */
const importRecipe = async (accessToken, selectedCategories, selectedTags) => {
  const addButton = document.querySelector("#add-button");
  const url = document.querySelector("input#url").value.trim();

  if (!url) {
    setStatus("#import-status", "Please enter a URL.", "error");
    return;
  }

  addButton.classList.add("disabled");
  addButton.textContent = "Adding...";
  setStatus("#import-status", "");

  try {
    const res = await fetch(
      `${API_BASE_URL}/v1/recipes/import?url=${encodeURIComponent(url)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoryUuids: [...selectedCategories],
          tagUuids: [...selectedTags],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Import request failed with status ${res.status}`);
    }

    setStatus("#import-status", "Recipe added!", "success");
    // Give the user a moment to read the confirmation before closing.
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    console.error(e);
    setStatus(
      "#import-status",
      "Could not retrieve a recipe from this page. Please try another page.",
      "error"
    );
    addButton.classList.remove("disabled");
    addButton.textContent = "Add";
  }
};

/***
 * Wire up the category/tag toggles and the import form
 */
const wireImportContent = (accessToken) => {
  const selectedCategories = new Set();
  const selectedTags = new Set();

  const wireToggles = (containerSelector, selected) => {
    document
      .querySelector(containerSelector)
      .addEventListener("click", (e) => {
        const button = e.target.closest("button[data-uuid]");
        if (!button) {
          return;
        }
        e.preventDefault();

        const uuid = button.getAttribute("data-uuid");
        if (button.classList.toggle("selected")) {
          selected.add(uuid);
        } else {
          selected.delete(uuid);
        }
      });
  };

  wireToggles("#categories-list", selectedCategories);
  wireToggles("#tags-list", selectedTags);

  document
    .querySelector("#import-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      importRecipe(accessToken, selectedCategories, selectedTags);
    });
};

const showImportContent = async (accessToken) => {
  // Load before switching views so a failure leaves the login view intact.
  await loadData(accessToken);
  hide("#login-content");
  show("#import-content");
  wireImportContent(accessToken);
};

/***
 * Login form
 */
const wireLoginContent = () => {
  document.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    hide("#login-error");

    try {
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const res = await fetch(`${API_BASE_URL}/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(`Login failed with status ${res.status}`);
      }

      const resJson = await res.json();
      await storeTokens(resJson.accessToken, resJson.refreshToken);
      await showImportContent(resJson.accessToken);
    } catch (err) {
      console.error(err);
      show("#login-error");
    }
  });
};

/***
 * Init
 */
const init = async () => {
  const url = await setCurrentTabUrl();

  // The import API only works with regular web pages.
  if (!/^https?:\/\//i.test(url)) {
    hide("#popup-content");
    show("#error-content");
    return;
  }

  let { accessToken, refreshToken } = await readTokenCookies();

  // If the access token has expired but the refresh token is still valid,
  // exchange it for a new pair.
  if (!accessToken && refreshToken) {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/auth/refresh-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: refreshToken }),
      });

      if (!res.ok) {
        throw new Error(`Token refresh failed with status ${res.status}`);
      }

      const resJson = await res.json();
      await storeTokens(resJson.accessToken, resJson.refreshToken);
      accessToken = resJson.accessToken;
      refreshToken = resJson.refreshToken;
    } catch (e) {
      console.error(e);
      accessToken = "";
      refreshToken = "";
    }
  }

  if (accessToken && refreshToken) {
    try {
      await showImportContent(accessToken);
      return;
    } catch (e) {
      console.error(e);
      hide("#import-content");
    }
  }

  wireLoginContent();
};

init();
