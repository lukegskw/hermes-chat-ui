const SESSION_PARAMETER = "session";

export const readSessionDeepLink = (href: string): string => {
  try {
    return new URL(href).searchParams.get(SESSION_PARAMETER)?.trim() ?? "";
  } catch {
    return "";
  }
};

export const withoutSessionDeepLink = (href: string): string => {
  try {
    const url = new URL(href);
    url.searchParams.delete(SESSION_PARAMETER);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
};
