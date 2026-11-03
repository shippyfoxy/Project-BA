// The Pro paywall is built but stays off until traffic justifies charging.
// Set NEXT_PUBLIC_PAYWALL=on in Vercel and redeploy to switch it on: it is
// read at build time in the browser, so the server and pages always agree.
export const paywallOn = (): boolean => process.env.NEXT_PUBLIC_PAYWALL === "on";
