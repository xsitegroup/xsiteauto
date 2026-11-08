// XSite staff who can see every shop (the /admin page). Set SUPER_ADMINS to a comma list of login emails.
export const superAdmins = () => (process.env.SUPER_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isSuper = (email) => !!email && superAdmins().includes(String(email).toLowerCase());
