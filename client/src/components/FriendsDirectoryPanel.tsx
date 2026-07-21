import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Cake, MapPin, ChevronDown, Users } from "lucide-react";

type DirectoryFriend = {
  id: number; name: string; avatarUrl: string | null;
  birthday: string | null;
  locationCity: string | null; locationRegion: string | null; locationCountry: string | null;
};

type Directory = {
  friends: DirectoryFriend[];
  withBirthday: number;
  locations: { city: string; region: string | null; friends: { id: number; name: string; avatarUrl: string | null }[] }[];
};

function daysUntil(iso: string): number | null {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function monthDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  return new Date(2000, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url
    ? <img src={url} alt="" className="w-7 h-7 rounded-full shrink-0" />
    : <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[11px] font-bold shrink-0">
        {name?.charAt(0)?.toUpperCase() ?? "?"}
      </div>;
}

/**
 * Birthdays and locations pulled from friends' own profiles.
 *
 * Everything here is data friends chose to share — the server strips anything
 * marked private before it reaches the client, so there's no filtering to do.
 * Renders nothing at all when no friend has shared anything, rather than showing
 * an empty shell.
 */
export default function FriendsDirectoryPanel() {
  const [showAllBirthdays, setShowAllBirthdays] = useState(false);

  const { data } = useQuery<Directory>({
    queryKey: ["/api/friends/directory"],
    queryFn: () => apiRequest("GET", "/api/friends/directory").then(r => r.json()),
    retry: false,
  });

  const upcoming = useMemo(() => {
    if (!data?.friends) return [];
    return data.friends
      .filter(f => f.birthday)
      .map(f => ({ ...f, days: daysUntil(f.birthday!) ?? 999 }))
      .sort((a, b) => a.days - b.days);
  }, [data]);

  if (!data) return null;
  const hasBirthdays = upcoming.length > 0;
  const hasLocations = (data.locations?.length ?? 0) > 0;
  if (!hasBirthdays && !hasLocations) return null;

  const shown = showAllBirthdays ? upcoming : upcoming.slice(0, 4);

  return (
    <div className="grid gap-3 sm:grid-cols-2 mb-5">
      {hasBirthdays && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Cake size={14} className="text-pink-500" />
            <h3 className="text-sm font-semibold">Birthdays</h3>
            <span className="text-[11px] text-muted-foreground">from their profiles</span>
          </div>
          <div className="space-y-1.5">
            {shown.map(f => (
              <Link key={f.id} href={`/profile/${f.id}`}>
                <a className="flex items-center gap-2.5 py-1 rounded-lg hover:bg-secondary/50 transition-colors">
                  <Avatar name={f.name} url={f.avatarUrl} />
                  <span className="text-sm truncate flex-1">{f.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{monthDay(f.birthday!)}</span>
                  {f.days <= 30 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/10 text-pink-600 dark:text-pink-400 font-medium shrink-0">
                      {f.days === 0 ? "today" : f.days === 1 ? "tomorrow" : `${f.days}d`}
                    </span>
                  )}
                </a>
              </Link>
            ))}
          </div>
          {upcoming.length > 4 && (
            <button onClick={() => setShowAllBirthdays(s => !s)}
                    className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
              {showAllBirthdays ? "Show less" : `Show all ${upcoming.length}`}
              <ChevronDown size={11} className={showAllBirthdays ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          )}
        </div>
      )}

      {hasLocations && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <MapPin size={14} className="text-sky-500" />
            <h3 className="text-sm font-semibold">Where your friends are</h3>
          </div>
          <div className="space-y-2.5">
            {data.locations.slice(0, 5).map(loc => (
              <div key={loc.city}>
                <p className="text-xs font-medium flex items-center gap-1.5">
                  {loc.city}{loc.region ? `, ${loc.region}` : ""}
                  <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-0.5">
                    <Users size={9} />{loc.friends.length}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {loc.friends.slice(0, 8).map(f => (
                    <Link key={f.id} href={`/profile/${f.id}`}>
                      <a title={f.name}><Avatar name={f.name} url={f.avatarUrl} /></a>
                    </Link>
                  ))}
                  {loc.friends.length > 8 && (
                    <span className="text-[11px] text-muted-foreground self-center">+{loc.friends.length - 8}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
