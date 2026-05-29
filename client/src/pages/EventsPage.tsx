import { useState } from "react";
import EventsTab from "@/components/EventsTab";
import EventFormModal from "@/components/modals/EventFormModal";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";

export default function EventsPage() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <PageShell
        title="Events"
        subtitle="Discover and track events"
        action={
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus size={14} /> Add Event
          </Button>
        }
      >
        {/* Cross-nav to Calendar */}
        <div className="mb-3">
          <a href="#/calendar" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <Calendar size={11} /> View your Calendar →
          </a>
        </div>
        <EventsTab />
      </PageShell>

      <EventFormModal open={addOpen} onClose={() => setAddOpen(false)} editEvent={null} />
    </>
  );
}
