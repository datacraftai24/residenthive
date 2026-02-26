import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

let initialized = false;

export function initPostHog() {
  if (!POSTHOG_KEY || initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
  });
  initialized = true;
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
) {
  if (!POSTHOG_KEY) return;
  posthog.identify(userId, properties);
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function resetPostHog() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
