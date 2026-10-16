import { AppNavigation } from "@/components/app-navigation";
import { WorkspaceSettings } from "@/components/workspace-settings";
export default function SettingsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <WorkspaceSettings />
      </section>
    </main>
  );
}
