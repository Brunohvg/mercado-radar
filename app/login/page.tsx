import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { adminAuthConfig } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return <LoginForm configured={adminAuthConfig().configured} />;
}
