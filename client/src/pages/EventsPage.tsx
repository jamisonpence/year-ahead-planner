import EventsTab from "@/components/EventsTab";

export default function EventsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-3 pb-6 pt-3">
        <EventsTab />
      </div>
    </div>
  );
}
