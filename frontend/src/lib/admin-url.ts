/** The admin dashboard is its own app (`admin/` in the repo). */
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.lociros.com").replace(/\/$/, "");
