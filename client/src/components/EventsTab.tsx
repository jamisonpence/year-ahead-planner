import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin, Search, Globe, Calendar, Tag, Heart, Check, X,
  Loader2, Trash2, BookOpen, Plane, Plus,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventResult {
  source: string;
  externalId: string;
  name: string;
  description?: string;
  startDatetime?: string;
  endDatetime?: string;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  url?: string;
  imageUrl?: string;
  priceInfo?: string;
  classifications?: string;
}

export interface SavedEvent extends EventResult {
  id: number;
  status: string;
  notes?: string;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_BADGE: Record<string, { label: string; color: string }> = {
  ticketmaster: { label: "Ticketmaster", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  seatgeek:     { label: "SeatGeek",     color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
};

const EVENT_STATUS_OPTIONS = [
  { value: "want_to_attend", label: "Want to Attend", emoji: "🎟️" },
  { value: "attended",       label: "Attended",       emoji: "✅" },
  { value: "skipped",        label: "Skipped",        emoji: "⏭️" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatEventDate(dt?: string): string {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      year: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({
  event,
  savedId,
  onSave,
  onUnsave,
  saving,
}: {
  event: EventResult;
  savedId?: number;
  onSave: (e: EventResult) => void;
  onUnsave: (id: number) => void;
  saving: boolean;
}) {
  const badge = SOURCE_BADGE[event.source] ?? { label: event.source, color: "bg-secondary text-foreground" };
  const isSaved = savedId !== undefined;

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      {event.imageUrl && (
        <div className="h-36 overflow-hidden bg-muted">
          <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-snug line-clamp-2">{event.name}</p>
            {event.classifications && (
              <span className="text-[10px] text-muted-foreground">{event.classifications}</span>
            )}
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {event.startDatetime && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={11} />
            <span>{formatEventDate(event.startDatetime)}</span>
          </div>
        )}

        {(event.venueName || event.venueAddress) && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">
              {event.venueName}{event.venueAddress ? ` · ${event.venueAddress}` : ""}
            </span>
          </div>
        )}

        {event.priceInfo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tag size={11} />
            <span>{event.priceInfo}</span>
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-1">
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-secondary transition-colors"
            >
              <Globe size={11} /> Tickets
            </a>
          )}
          {isSaved ? (
            <button
              onClick={() => onUnsave(savedId!)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors group border border-green-200 dark:border-green-800"
            >
              <Check size={11} className="group-hover:hidden" />
              <X size={11} className="hidden group-hover:block" />
              <span className="group-hover:hidden">Saved</span>
              <span className="hidden group-hover:block">Remove</span>
            </button>
          ) : (
            <button
              onClick={() => onSave(event)}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Heart size={11} />}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SavedEventCard ────────────────────────────────────────────────────────────

function SavedEventCard({
  event,
  onDelete,
  onStatusChange,
  onCreateJournalEntry,
  onLinkToTrip,
}: {
  event: SavedEvent;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onCreateJournalEntry: (event: SavedEvent) => void;
  onLinkToTrip: (event: SavedEvent) => void;
}) {
  const badge = SOURCE_BADGE[event.source] ?? { label: event.source, color: "bg-secondary text-foreground" };

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      {event.imageUrl && (
        <div className="h-28 overflow-hidden bg-muted">
          <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-snug line-clamp-2 flex-1">{event.name}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* 2. Primary actions — status, tickets, contextual */}
        <div className="flex gap-1.5 flex-wrap mt-auto pt-1">
          {EVENT_STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onStatusChange(event.id, opt.value)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors
                ${event.status === opt.value
                  ? "bg-violet-500 text-white border-violet-500"
                  : "border-border text-muted-foreground hover:bg-secondary"}`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
          <button
            onClick={() => onDelete(event.id)}
            className="ml-auto p-1.5 rounded-lg hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors text-muted-foreground"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-secondary transition-colors"
          >
            <Globe size={11} /> View / Get Tickets
          </a>
        )}

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => onCreateJournalEntry(event)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <BookOpen size={10} /> Journal Entry
          </button>
          <button
            onClick={() => onLinkToTrip(event)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            <Plane size={10} /> Link to Trip
          </button>
        </div>

        {/* 3. Key metadata — date, venue */}
        {event.startDatetime && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-2 mt-1">
            <Calendar size={11} />
            <span>{formatEventDate(event.startDatetime)}</span>
          </div>
        )}

        {event.venueName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin size={11} />
            <span className="line-clamp-1">{event.venueName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EventsTab (main export) ───────────────────────────────────────────────────

// ── Event Journal Entry Modal ─────────────────────────────────────────────────

function EventJournalModal({ event, onClose }: { event: SavedEvent; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [content, setContent] = useState(`**${event.name}**\n\n`);
  const [mood, setMood] = useState("");

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/journal-entries", {
      title: event.name,
      content,
      mood: mood || null,
      date: new Date().toISOString().slice(0, 10),
      tags: event.classifications ?? null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      toast({ title: "Journal entry created!" });
      onClose();
    },
    onError: () => toast({ title: "Failed to create entry", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen size={16} className="text-primary" /> New Journal Entry
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">From: <strong>{event.name}</strong></p>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mood (optional)</label>
            <Input value={mood} onChange={e => setMood(e.target.value)} placeholder="e.g. excited, nostalgic" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={6}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button className="w-full gap-2" onClick={() => createMut.mutate()} disabled={!content.trim() || createMut.isPending}>
            <Plus size={14} /> Save Entry
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Link Event to Trip Modal ──────────────────────────────────────────────────

function LinkEventToTripModal({ event, onClose }: { event: SavedEvent; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: trips = [] } = useQuery<any[]>({ queryKey: ["/api/trips"] });

  const addItemMut = useMutation({
    mutationFn: (tripId: number) => apiRequest("POST", `/api/trips/${tripId}/items`, {
      name: event.name,
      type: "other",
      address: event.venueAddress ?? null,
      date: event.startDatetime ? event.startDatetime.slice(0, 10) : null,
      time: null, duration: null,
      notes: event.description ?? null,
      spotId: null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: `${event.name} linked to trip!` });
      onClose();
    },
    onError: () => toast({ title: "Failed to link event", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane size={16} className="text-primary" /> Link Event to Trip
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-3">Select a trip to link <strong>{event.name}</strong> to:</p>
        {trips.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Plane size={28} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm">No trips yet. Create a trip in the Trips section first.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {trips.map((trip: any) => (
              <button
                key={trip.id}
                onClick={() => addItemMut.mutate(trip.id)}
                disabled={addItemMut.isPending}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:bg-secondary transition-colors"
              >
                <span className="text-lg">{trip.emoji}</span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{trip.name}</p>
                  {trip.destination && <p className="text-xs text-muted-foreground truncate">{trip.destination}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── EventsTab (main export) ───────────────────────────────────────────────────

export default function EventsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [eventsView, setEventsView] = useState<"discover" | "upcoming" | "past" | "saved">("discover");
  const [journalEvent, setJournalEvent] = useState<SavedEvent | null>(null);
  const [linkTripEvent, setLinkTripEvent] = useState<SavedEvent | null>(null);
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState({ city: "", q: "", startDate: "", endDate: "" });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const { data: searchResults = [], isFetching: searching } = useQuery<EventResult[]>({
    queryKey: ["/api/events/search", searchParams],
    queryFn: () => {
      const p = new URLSearchParams();
      if (searchParams.city)      p.set("city", searchParams.city);
      if (searchParams.q)         p.set("q", searchParams.q);
      if (searchParams.startDate) p.set("startDate", searchParams.startDate);
      if (searchParams.endDate)   p.set("endDate", searchParams.endDate);
      return apiRequest("GET", `/api/events/search?${p}`).then(r => r.json());
    },
    enabled: hasSearched,
    staleTime: 60_000,
  });

  const { data: savedEvents = [] } = useQuery<SavedEvent[]>({
    queryKey: ["/api/events/saved"],
    queryFn: () => apiRequest("GET", "/api/events/saved").then(r => r.json()),
  });

  const savedMap = useMemo(() => {
    const m = new Map<string, SavedEvent>();
    for (const se of savedEvents) {
      m.set(`${se.source}:${se.externalId}`, se);
    }
    return m;
  }, [savedEvents]);

  const saveEventMut = useMutation({
    mutationFn: (event: EventResult) => apiRequest("POST", "/api/events/saved", event),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/events/saved"] }); setSavingKey(null); },
    onError: () => { toast({ title: "Failed to save event", variant: "destructive" }); setSavingKey(null); },
  });

  const unsaveEventMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/events/saved/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/events/saved"] }),
    onError: () => toast({ title: "Failed to remove event", variant: "destructive" }),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/events/saved/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/events/saved"] }),
  });

  const now = new Date().toISOString();
  const upcomingEvents = useMemo(() => savedEvents.filter(e => e.status === "want_to_attend" && (!e.startDatetime || e.startDatetime > now)), [savedEvents, now]);
  const pastEvents = useMemo(() => savedEvents.filter(e => e.status === "attended" || (e.startDatetime && e.startDatetime < now)), [savedEvents, now]);

  function handleSearch() {
    setSearchParams({ city, q: keyword, startDate, endDate });
    setHasSearched(true);
    setEventsView("discover");
  }

  function handleSave(event: EventResult) {
    const key = `${event.source}:${event.externalId}`;
    setSavingKey(key);
    saveEventMut.mutate(event);
  }

  return (
    <div className="space-y-5">
      {/* Search form */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2">
          <span>🎟️</span> Find Events
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <MapPin size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="City (e.g. Nashville)"
              value={city}
              onChange={e => setCity(e.target.value)}
              className="pl-8 text-sm"
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Keyword (e.g. jazz, comedy)"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="pl-8 text-sm"
              onKeyDown={e => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-1 block">From date</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium mb-1 block">To date</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm" />
          </div>
        </div>
        <Button onClick={handleSearch} disabled={searching} className="w-full gap-2">
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {searching ? "Searching..." : "Search Events"}
        </Button>
      </div>

      {/* Tab bar: Discover | Upcoming | Past | Saved */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
        {[
          { value: "discover" as const, label: "Discover" },
          { value: "upcoming" as const, label: `Upcoming (${upcomingEvents.length})` },
          { value: "past"     as const, label: `Past (${pastEvents.length})` },
          { value: "saved"    as const, label: `Saved (${savedEvents.length})` },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setEventsView(tab.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              eventsView === tab.value
                ? "bg-violet-500 text-white"
                : "border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Discover (browse results) */}
      {eventsView === "discover" && (
        <>
          {!hasSearched && (
            <div className="text-center py-16 text-muted-foreground">
              <span className="text-4xl block mb-3">🎟️</span>
              <p className="font-medium">Search for events near you</p>
              <p className="text-xs mt-1">Results from Ticketmaster & SeatGeek</p>
            </div>
          )}
          {hasSearched && searching && (
            <div className="text-center py-16 text-muted-foreground">
              <Loader2 size={28} className="animate-spin mx-auto mb-3" />
              <p className="text-sm">Searching Ticketmaster & SeatGeek...</p>
            </div>
          )}
          {hasSearched && !searching && searchResults.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <span className="text-4xl block mb-3">🔍</span>
              <p className="font-medium">No events found</p>
              <p className="text-xs mt-1">Try a different city or keyword</p>
            </div>
          )}
          {hasSearched && !searching && searchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {searchResults.map(event => {
                const key = `${event.source}:${event.externalId}`;
                const saved = savedMap.get(key);
                return (
                  <EventCard
                    key={key}
                    event={event}
                    savedId={saved?.id}
                    onSave={handleSave}
                    onUnsave={id => unsaveEventMut.mutate(id)}
                    saving={savingKey === key}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Upcoming events */}
      {eventsView === "upcoming" && (
        <>
          {upcomingEvents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <span className="text-4xl block mb-3">🗓️</span>
              <p className="font-medium">No upcoming events</p>
              <p className="text-xs mt-1">Events marked "Want to Attend" with future dates appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {upcomingEvents.map(event => (
                <SavedEventCard
                  key={event.id}
                  event={event}
                  onDelete={id => unsaveEventMut.mutate(id)}
                  onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                  onCreateJournalEntry={setJournalEvent}
                  onLinkToTrip={setLinkTripEvent}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Past events */}
      {eventsView === "past" && (
        <>
          {pastEvents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <span className="text-4xl block mb-3">📅</span>
              <p className="font-medium">No past events</p>
              <p className="text-xs mt-1">Events you've attended or that have passed appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {pastEvents.map(event => (
                <SavedEventCard
                  key={event.id}
                  event={event}
                  onDelete={id => unsaveEventMut.mutate(id)}
                  onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                  onCreateJournalEntry={setJournalEvent}
                  onLinkToTrip={setLinkTripEvent}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Saved events (all) */}
      {eventsView === "saved" && (
        <>
          {savedEvents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <span className="text-4xl block mb-3">🎫</span>
              <p className="font-medium">No saved events yet</p>
              <p className="text-xs mt-1">Search and save events you want to attend</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {savedEvents.map(event => (
                <SavedEventCard
                  key={event.id}
                  event={event}
                  onDelete={id => unsaveEventMut.mutate(id)}
                  onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                  onCreateJournalEntry={setJournalEvent}
                  onLinkToTrip={setLinkTripEvent}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Contextual modals */}
      {journalEvent && <EventJournalModal event={journalEvent} onClose={() => setJournalEvent(null)} />}
      {linkTripEvent && <LinkEventToTripModal event={linkTripEvent} onClose={() => setLinkTripEvent(null)} />}
    </div>
  );
}
