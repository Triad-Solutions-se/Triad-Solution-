import { PageHeader } from "@/components/PageHeader";
import { BookkeepingTabs } from "./BookkeepingTabs";

export default function BookkeepingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Bokföring" subtitle="Godkänn förslagen, så bokförs de enligt BAS med moms och verifikationsnummer." />
      <BookkeepingTabs />
      <div className="no-scroll-fade">{children}</div>
    </>
  );
}
