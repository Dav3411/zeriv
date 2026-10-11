import { redirect } from "next/navigation";

// /brands 진입 시 /orgs로 redirect
export default function BrandsPage() {
  redirect("/orgs");
}
