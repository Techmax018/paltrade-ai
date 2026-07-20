import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const getOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  if (!req) return "";
  try {
    return new URL(req.url).origin;
  } catch {
    return "";
  }
});
