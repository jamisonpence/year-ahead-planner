import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Link2, Plus, Search, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type GraphEntity = {
  type: string;
  id: number;
  typeLabel: string;
  title: string;
  subtitle?: string | null;
  href: string;
};

type GraphLink = {
  id: number;
  relation: string;
  notes?: string | null;
  other: GraphEntity;
};

type GraphResponse = {
  entity: GraphEntity;
  links: GraphLink[];
};

type Props = {
  entityType: string;
  entityId: number;
  title?: string;
};

const RELATIONS = [
  { value: "related", label: "Related" },
  { value: "supports", label: "Supports" },
  { value: "shared_with", label: "Shared with" },
  { value: "recommended_by", label: "Recommended by" },
  { value: "visited_with", label: "Visited with" },
  { value: "planned_for", label: "Planned for" },
  { value: "inspired_by", label: "Inspired by" },
  { value: "memory", label: "Memory" },
  { value: "accountability", label: "Accountability" },
  { value: "interest", label: "Shared interest" },
];

const relationLabel = (value: string) =>
  RELATIONS.find((relation) => relation.value === value)?.label ?? value.replace(/_/g, " ");

export default function LifeGraphPanel({ entityType, entityId, title = "Connections" }: Props) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState("related");
  const graphKey = ["/api/life-graph", entityType, String(entityId)];

  const { data, isLoading } = useQuery<GraphResponse>({
    queryKey: graphKey,
    queryFn: async () => (await apiRequest("GET", `/api/life-graph/${entityType}/${entityId}`)).json(),
  });

  const { data: searchResults = [] } = useQuery<GraphEntity[]>({
    queryKey: ["/api/life-graph/search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const q = encodeURIComponent(query.trim());
      return (await apiRequest("GET", `/api/life-graph/search?q=${q}`)).json();
    },
  });

  const filteredResults = useMemo(() => {
    const existing = new Set((data?.links ?? []).map((link) => `${link.other.type}:${link.other.id}`));
    return searchResults.filter((item) => {
      if (item.type === entityType && item.id === entityId) return false;
      return !existing.has(`${item.type}:${item.id}`);
    });
  }, [data?.links, entityId, entityType, searchResults]);

  const connect = useMutation({
    mutationFn: (target: GraphEntity) =>
      apiRequest("POST", "/api/life-graph", {
        sourceType: entityType,
        sourceId: entityId,
        targetType: target.type,
        targetId: target.id,
        relation,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphKey });
      setQuery("");
      toast({ title: "Connection added" });
    },
  });

  const unlink = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/life-graph/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphKey });
      toast({ title: "Connection removed" });
    },
  });

  return (
    <section className="rounded-xl border bg-card p-4 mt-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Link2 size={14} className="text-primary" />
            {title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Link the people, places, media, notes, habits, and plans that make this matter.
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{data?.links.length ?? 0}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_150px] gap-2 mb-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search anything in MyLifos"
            className="h-9 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-secondary"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <Select value={relation} onValueChange={setRelation}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RELATIONS.map((item) => (
              <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.trim().length >= 2 && (
        <div className="mb-3 rounded-lg border bg-background overflow-hidden">
          {filteredResults.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-3">No available matches yet.</p>
          ) : (
            filteredResults.slice(0, 8).map((item) => (
              <button
                key={`${item.type}:${item.id}`}
                type="button"
                onClick={() => connect.mutate(item)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/70 transition-colors border-b last:border-b-0"
              >
                <span className="text-[10px] font-semibold uppercase text-muted-foreground border rounded-full px-1.5 py-0.5 shrink-0">
                  {item.typeLabel}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{item.title}</span>
                  {item.subtitle && <span className="block text-xs text-muted-foreground truncate">{item.subtitle}</span>}
                </span>
                <Plus size={14} className="text-primary shrink-0" />
              </button>
            ))
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground py-2">Loading connections...</p>
      ) : data?.links.length ? (
        <div className="space-y-1.5">
          {data.links.map((link) => (
            <div key={link.id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground border rounded-full px-1.5 py-0.5 shrink-0">
                {link.other.typeLabel}
              </span>
              <Link href={link.other.href}>
                <a className="min-w-0 flex-1 hover:underline">
                  <span className="block text-sm font-medium truncate">{link.other.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {relationLabel(link.relation)}{link.other.subtitle ? ` • ${link.other.subtitle}` : ""}
                  </span>
                </a>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => unlink.mutate(link.id)}
                title="Remove connection"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed py-5 px-3 text-center">
          <p className="text-sm font-medium">No connections yet</p>
          <p className="text-xs text-muted-foreground mt-1">Search above to connect this to the rest of your life.</p>
        </div>
      )}
    </section>
  );
}
