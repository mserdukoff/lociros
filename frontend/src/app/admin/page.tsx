import { redirect } from "next/navigation";
import { ADMIN_URL } from "@/lib/admin-url";

export default function AdminPage() {
  redirect(ADMIN_URL);
}
