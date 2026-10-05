export const router = {
  navigate(path: string | { pathname: string }) {
    const value = typeof path === "string" ? path : path.pathname;
    window.dispatchEvent(
      new CustomEvent("preview-route", {
        detail: value.split("/").pop() || "index",
      }),
    );
  },
  setParams() {},
};
export const useLocalSearchParams = () => ({});
export const useIsFocused = () => true;
export const usePathname = () => location.pathname;
