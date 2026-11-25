import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { WorkspaceSettings } from "@/components/workspace-settings";
export default function SettingsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="configuracoes" current="/configuracoes" />
        <WorkspaceSettings />
      </section>
    </main>
  );
}
