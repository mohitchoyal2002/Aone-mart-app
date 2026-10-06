const navigate = (
  path: string | { pathname: string; params?: Record<string, string> },
) => {
  const value = typeof path === "string" ? path : path.pathname;
  const params = typeof path === "string" ? {} : path.params || {};
  window.__previewRouteParams = params;
  window.dispatchEvent(
    new CustomEvent("preview-route", {
      detail: value.startsWith("/product/")
        ? "product"
        : value.split("/").pop() || "index",
    }),
  );
};
export const router = {
  navigate,
  push: navigate,
  replace: navigate,
  back: () => navigate("/(customer)/index"),
  canGoBack: () => true,
  setParams() {},
};
export const useLocalSearchParams = () =>
  window.__previewRouteParams ||
  Object.fromEntries(new URLSearchParams(location.search));
export const useIsFocused = () => true;
export const usePathname = () => location.pathname;
