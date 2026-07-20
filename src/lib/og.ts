import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";

export const getOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const req = getWebRequest();
  if (!req) return "";
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
});
