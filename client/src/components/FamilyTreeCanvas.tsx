/**
 * FamilyTreeCanvas — interactive pan/zoom family-tree built on React Flow + Dagre.
 *
 * Features
 *  • Infinite canvas with mouse / trackpad pan + zoom
 *  • Dagre hierarchical auto-layout (TB)
 *  • Draggable nodes (positions transient; reset on fit-view)
 *  • Relationship edges: parent-child (solid), spouse (dashed), sibling (dotted)
 *  • Click any node → right side-panel edit form
 *  • Controls: zoom-in, zoom-out, fit-view, add-person
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, useReactFlow,
  ReactFlowProvider,
  Handle, Position,
  type Node, type Edge, type NodeProps, MarkerType,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import type { FamilyMember } from "@shared/schema";
import {
  useQuery, useMutation, useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, X, Trash2, ZoomIn, ZoomOut, Maximize2, User,
} from "lucide-react";

// ── constants ──────────────────────────────────────────────────────────────────
const NODE_W  = 110;
const NODE_H  = 130;
const RANK_SEP = 90;
const NODE_SEP = 30;

// Generation rank assigned per role — used for Dagre ranking hints
const ROLE_RANK: Record<string, number> = {
  great_grandparent: 0,
  in_law_grandparent: 0,
  grandparent: 1,
  parent: 2, aunt_uncle: 2,
  in_law_parent: 2,
  sibling: 3, self: 3, spouse: 3, cousin: 3, in_law_sibling: 3,
  niece_nephew: 4, child: 4,
  grandchild: 5,
  other: 6,
};

const ROLES = [
  { value: "great_grandparent",  label: "Great-Grandparent",   emoji: "👴" },
  { value: "grandparent",        label: "Grandparent",          emoji: "🧓" },
  { value: "parent",             label: "Parent",               emoji: "👨‍👧" },
  { value: "aunt_uncle",         label: "Aunt / Uncle",         emoji: "🧑" },
  { value: "cousin",             label: "Cousin",               emoji: "🧑‍🤝‍🧑" },
  { value: "sibling",            label: "Sibling",              emoji: "🧑‍🤝‍🧑" },
  { value: "self",               label: "Me",                   emoji: "⭐" },
  { value: "spouse",             label: "Spouse / Partner",     emoji: "💑" },
  { value: "niece_nephew",       label: "Niece / Nephew",       emoji: "🧒" },
  { value: "child",              label: "Child",                emoji: "👶" },
  { value: "grandchild",         label: "Grandchild",           emoji: "🍼" },
  { value: "in_law_grandparent", label: "Grandparent-in-Law",  emoji: "👴" },
  { value: "in_law_parent",      label: "Parent-in-Law",        emoji: "👨‍👧" },
  { value: "in_law_sibling",     label: "Sibling-in-Law",       emoji: "🧑‍🤝‍🧑" },
  { value: "other",              label: "Other",                emoji: "👤" },
];

const SIDES = [
  { value: "none",     label: "—"           },
  { value: "paternal", label: "Paternal 👨" },
  { value: "maternal", label: "Maternal 👩" },
];

const GENDERS = [
  { value: "male",    label: "Male",   symbol: "♂" },
  { value: "female",  label: "Female", symbol: "♀" },
  { value: "other",   label: "Other",  symbol: "⚧" },
  { value: "unknown", label: "?",      symbol: "?" },
];

// ── colour helpers ─────────────────────────────────────────────────────────────
function roleColor(m: FamilyMember): string {
  if (m.role === "self")                return "#0f766e";
  if (m.role === "sibling")             return "#0d9488";
  if (m.role === "spouse")              return "#7c3aed";
  if (m.role === "child")               return "#0e7490";
  if (m.role === "grandchild")          return "#155e75";
  if (m.role === "great_grandparent")   return "#475569";
  if (m.role === "aunt_uncle")          return "#6d28d9";
  if (m.role === "cousin")              return "#8b5cf6";
  if (m.role === "niece_nephew")        return "#0891b2";
  if (m.role === "in_law_grandparent")  return "#92400e";
  if (m.role === "in_law_parent")       return "#b45309";
  if (m.role === "in_law_sibling")      return "#d97706";
  if (m.role === "other")               return "#475569";
  if (m.side === "paternal")            return "#1d4ed8";
  if (m.side === "maternal")            return "#c2410c";
  if (m.role === "grandparent")         return "#1e40af";
  if (m.role === "parent")              return "#1d4ed8";
  return "#475569";
}

function roleLabel(m: FamilyMember): string {
  if (m.role === "self")               return "YOU";
  if (m.role === "sibling")            return m.gender === "female" ? "SISTER" : m.gender === "male" ? "BROTHER" : "SIBLING";
  if (m.role === "spouse")             return "SPOUSE";
  if (m.role === "child")              return m.gender === "female" ? "DAUGHTER" : m.gender === "male" ? "SON" : "CHILD";
  if (m.role === "grandchild")         return "GRANDCHILD";
  if (m.role === "great_grandparent")  return "GREAT-GRANDPARENT";
  if (m.role === "aunt_uncle")         return m.gender === "female" ? "AUNT" : m.gender === "male" ? "UNCLE" : "AUNT/UNCLE";
  if (m.role === "cousin")             return "COUSIN";
  if (m.role === "niece_nephew")       return m.gender === "female" ? "NIECE" : m.gender === "male" ? "NEPHEW" : "NIECE/NEPHEW";
  if (m.role === "in_law_grandparent") return m.gender === "female" ? "GRANDMA-IN-LAW" : "GRANDPA-IN-LAW";
  if (m.role === "in_law_parent")      return m.gender === "female" ? "MOTHER-IN-LAW" : "FATHER-IN-LAW";
  if (m.role === "in_law_sibling")     return m.gender === "female" ? "SISTER-IN-LAW" : m.gender === "male" ? "BROTHER-IN-LAW" : "SIBLING-IN-LAW";
  if (m.role === "grandparent") {
    const side = m.side && m.side !== "none" ? m.side.toUpperCase() + " " : "";
    return side + (m.gender === "female" ? "GRANDMA" : "GRANDPA");
  }
  if (m.role === "parent") return m.gender === "female" ? "MOTHER" : "FATHER";
  return m.role.replace(/_/g, " ").toUpperCase();
}

// ── Dagre layout ───────────────────────────────────────────────────────────────
function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: RANK_SEP, nodesep: NODE_SEP, marginx: 40, marginy: 40 });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  // Only route parent-child edges through dagre (not spouse dashes)
  edges
    .filter(e => e.data?.edgeType !== "spouse" && e.data?.edgeType !== "sibling")
    .forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return { ...n, position: { x: 0, y: 0 } };
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

// ── Edge builder ───────────────────────────────────────────────────────────────
function buildEdges(members: FamilyMember[]): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();

  function addEdge(source: string, target: string, type: string, opts: Partial<Edge> = {}) {
    const key = `${source}->${target}-${type}`;
    if (seen.has(key) || source === target) return;
    seen.add(key);
    edges.push({
      id: `e-${key}`,
      source, target,
      type: "smoothstep",
      ...opts,
      data: { edgeType: type, ...opts.data },
    } as Edge);
  }

  const byId = new Map(members.map(m => [m.id, m]));
  const self    = members.find(m => m.role === "self");
  const spouse  = members.filter(m => m.role === "spouse");
  const parents = members.filter(m => m.role === "parent");
  const gps     = members.filter(m => m.role === "grandparent");
  const ggps    = members.filter(m => m.role === "great_grandparent");
  const children     = members.filter(m => m.role === "child");
  const grandChildren = members.filter(m => m.role === "grandchild");
  const siblings = members.filter(m => m.role === "sibling");

  // 1. Explicit parent links
  members.forEach(m => {
    const m2 = m as any;
    if (m2.parent1Id && byId.has(m2.parent1Id))
      addEdge(String(m2.parent1Id), String(m.id), "parent-child", {
        style: { stroke: "#10b981", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      });
    if (m2.parent2Id && byId.has(m2.parent2Id))
      addEdge(String(m2.parent2Id), String(m.id), "parent-child", {
        style: { stroke: "#10b981", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
      });
  });

  // helper: does this member already have an explicit parent edge pointing to it?
  function hasExplicitParent(m: FamilyMember): boolean {
    const m2 = m as any;
    return (m2.parent1Id && byId.has(m2.parent1Id)) || (m2.parent2Id && byId.has(m2.parent2Id));
  }

  // 2. Inferred role-chain edges (skip nodes that already have explicit parent links)
  // great-grandparent → grandparent
  if (ggps.length === 1) {
    gps.filter(g => !hasExplicitParent(g)).forEach(g =>
      addEdge(String(ggps[0].id), String(g.id), "parent-child", {
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      })
    );
  }

  // grandparent → parent (match by side)
  const patGPs = gps.filter(g => g.side === "paternal");
  const matGPs = gps.filter(g => g.side === "maternal");
  const patP   = parents.filter(p => p.side === "paternal");
  const matP   = parents.filter(p => p.side === "maternal");
  const noSideP = parents.filter(p => !p.side || p.side === "none");

  function connectGpToParents(gpList: FamilyMember[], pList: FamilyMember[], color: string) {
    if (gpList.length === 0 || pList.length === 0) return;
    const source = gpList.length === 1 ? String(gpList[0].id) : String(gpList[0].id);
    pList.filter(p => !hasExplicitParent(p)).forEach(p =>
      addEdge(String(gpList[0].id), String(p.id), "parent-child", {
        style: { stroke: color, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color },
      })
    );
    if (gpList.length === 2) {
      pList.filter(p => !hasExplicitParent(p)).forEach(p =>
        addEdge(String(gpList[1].id), String(p.id), "parent-child", {
          style: { stroke: color, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        })
      );
    }
  }
  connectGpToParents(patGPs, patP, "#3b82f6");
  connectGpToParents(matGPs, matP, "#f97316");
  if (gps.filter(g => !g.side || g.side === "none").length > 0) {
    connectGpToParents(gps.filter(g => !g.side || g.side === "none"), noSideP, "#94a3b8");
  }

  // parent → self (and siblings)
  if (self) {
    parents.forEach(p =>
      addEdge(String(p.id), String(self.id), "parent-child", {
        style: { stroke: roleColor(p), strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: roleColor(p) },
      })
    );
    siblings.filter(s => !hasExplicitParent(s)).forEach(s =>
      parents.forEach(p =>
        addEdge(String(p.id), String(s.id), "parent-child", {
          style: { stroke: roleColor(p), strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: roleColor(p) },
        })
      )
    );
  }

  // self + spouse → children
  if (self) {
    const coupledParents = spouse.length > 0 ? [self, ...spouse] : [self];
    children.filter(c => !hasExplicitParent(c)).forEach(c => {
      coupledParents.forEach(p =>
        addEdge(String(p.id), String(c.id), "parent-child", {
          style: { stroke: "#0e7490", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#0e7490" },
        })
      );
    });
  }

  // child → grandchild
  children.forEach(child =>
    grandChildren.filter(gc => !hasExplicitParent(gc)).forEach(gc =>
      addEdge(String(child.id), String(gc.id), "parent-child", {
        style: { stroke: "#155e75", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#155e75" },
      })
    )
  );

  // 3. Spouse edges (dashed horizontal)
  if (self) {
    spouse.forEach(s =>
      addEdge(String(self.id), String(s.id), "spouse", {
        type: "straight",
        style: { stroke: "#7c3aed", strokeWidth: 2, strokeDasharray: "6,4" },
        data: { edgeType: "spouse" },
      })
    );
  }

  // 4. Sibling edges (subtle dotted) — connect each sibling to self
  if (self && siblings.length > 0) {
    siblings.forEach(sib =>
      addEdge(String(sib.id), String(self.id), "sibling", {
        type: "straight",
        style: { stroke: "#0d9488", strokeWidth: 1.5, strokeDasharray: "3,5" },
        data: { edgeType: "sibling" },
      })
    );
  }

  return edges;
}

// ── Custom node component ──────────────────────────────────────────────────────
interface NodeData {
  member: FamilyMember;
  onSelect: (m: FamilyMember) => void;
  selected: boolean;
}

function FamilyNode({ data }: NodeProps) {
  const { member, onSelect, selected } = data as NodeData;
  const color = roleColor(member);
  const label = roleLabel(member);
  const gSym  = member.gender === "male" ? "♂" : member.gender === "female" ? "♀" : null;

  return (
    <div
      onClick={() => onSelect(member)}
      className="flex flex-col items-center cursor-pointer select-none"
      style={{ width: NODE_W }}
    >
      <Handle type="target"  position={Position.Top}    style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source"  position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source"  id="left"  position={Position.Left}  style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source"  id="right" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />

      {/* circle */}
      <div className="relative">
        <div
          className="w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-md transition-all duration-150"
          style={{
            backgroundColor: color,
            border: selected ? "3px solid white" : "2px solid rgba(255,255,255,0.4)",
            boxShadow: selected ? `0 0 0 3px ${color}, 0 4px 12px rgba(0,0,0,0.4)` : "0 2px 8px rgba(0,0,0,0.3)",
            transform: selected ? "scale(1.08)" : "scale(1)",
          }}
        >
          <User size={28} className="text-white/80" />
          {member.isDeceased ? (
            <div className="absolute inset-0 rounded-full bg-black/35 flex items-center justify-center">
              <span className="text-white text-sm font-bold">†</span>
            </div>
          ) : null}
        </div>
        {gSym && (
          <div
            className="absolute top-0 right-0 w-[18px] h-[18px] rounded-full bg-white flex items-center justify-center text-[10px] font-bold shadow-sm"
            style={{ color }}
          >
            {gSym}
          </div>
        )}
      </div>

      {/* name */}
      <p className="text-[11px] font-semibold text-center leading-tight mt-2 line-clamp-2 px-0.5 text-white drop-shadow">
        {member.name}
      </p>
      {/* role */}
      <p className="text-[9px] font-bold uppercase tracking-widest text-center mt-0.5" style={{ color }}>
        {label}
      </p>
      {/* birth year */}
      {member.birthYear && (
        <p className="text-[9px] text-white/50 mt-0.5">
          {member.isDeceased && member.deathYear
            ? `${member.birthYear}–${member.deathYear}`
            : `b. ${member.birthYear}`}
        </p>
      )}
    </div>
  );
}

const nodeTypes = { familyMember: FamilyNode };

// ── Blank form ─────────────────────────────────────────────────────────────────
const BLANK_FORM = {
  name: "", gender: "unknown", role: "other", side: "none",
  birthYear: "", deathYear: "", birthPlace: "", notes: "", isDeceased: false,
  parent1Id: null as number | null,
  parent2Id: null as number | null,
};

// ── Inner canvas (needs ReactFlowProvider context) ─────────────────────────────
function Inner() {
  const qc         = useQueryClient();
  const { toast }  = useToast();
  const { fitView } = useReactFlow();

  const { data: members = [], isLoading } = useQuery<FamilyMember[]>({
    queryKey: ["/api/family-members"],
    queryFn: () => apiRequest("GET", "/api/family-members").then(r => r.json()),
  });

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/family-members", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/family-members"] }); setPanel(null); toast({ title: "Person added!" }); },
    onError: () => toast({ title: "Failed to add", variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/family-members/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/family-members"] }); toast({ title: "Saved!" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/family-members/${id}`).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/family-members"] }); setPanel(null); toast({ title: "Removed" }); },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  // ── Panel state ──────────────────────────────────────────────────────────────
  type PanelMode = { mode: "edit"; member: FamilyMember } | { mode: "add" };
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const [form, setForm]   = useState({ ...BLANK_FORM });

  function openAdd() {
    setForm({ ...BLANK_FORM });
    setPanel({ mode: "add" });
  }
  function openEdit(member: FamilyMember) {
    setForm({
      name: member.name, gender: member.gender ?? "unknown",
      role: member.role, side: member.side ?? "none",
      birthYear: member.birthYear?.toString() ?? "",
      deathYear: member.deathYear?.toString() ?? "",
      birthPlace: member.birthPlace ?? "", notes: member.notes ?? "",
      isDeceased: !!member.isDeceased,
      parent1Id: (member as any).parent1Id ?? null,
      parent2Id: (member as any).parent2Id ?? null,
    });
    setPanel({ mode: "edit", member });
  }
  function closePanel() { setPanel(null); }

  function savePanel() {
    if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(), gender: form.gender, role: form.role, side: form.side,
      birthYear: form.birthYear ? parseInt(form.birthYear) : null,
      deathYear: form.deathYear ? parseInt(form.deathYear) : null,
      birthPlace: form.birthPlace || null, notes: form.notes || null,
      isDeceased: form.isDeceased ? 1 : 0,
      parent1Id: form.parent1Id, parent2Id: form.parent2Id,
    };
    if (panel?.mode === "edit") updateMut.mutate({ id: panel.member.id, data: payload });
    else addMut.mutate(payload);
  }

  // ── Build RF nodes/edges ─────────────────────────────────────────────────────
  const selectedId = panel?.mode === "edit" ? panel.member.id : null;

  const rfEdges = useMemo(() => buildEdges(members), [members]);

  const rfNodes: Node[] = useMemo(() => members.map(m => ({
    id: String(m.id),
    type: "familyMember",
    data: {
      member: m,
      onSelect: openEdit,
      selected: m.id === selectedId,
    },
    position: { x: 0, y: 0 }, // overwritten by dagre
    draggable: true,
  })), [members, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const layouted = useMemo(() => layoutNodes(rfNodes, rfEdges), [rfNodes, rfEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layouted);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  // Update when data changes
  useEffect(() => {
    setNodes(layoutNodes(rfNodes, rfEdges));
    setEdges(rfEdges);
    // Small delay so DOM settles, then fit
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 120);
    return () => clearTimeout(t);
  }, [rfNodes, rfEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full" style={{ minHeight: 0 }}>
      {/* Canvas */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="rgba(255,255,255,0.07)"
          />

          {/* Custom toolbar */}
          <Panel position="top-right" className="flex flex-col gap-1.5 p-1.5">
            <button
              onClick={() => fitView({ padding: 0.15, duration: 400 })}
              className="w-8 h-8 rounded-lg bg-card/80 border backdrop-blur shadow-sm flex items-center justify-center hover:bg-secondary transition-colors"
              title="Fit view"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={openAdd}
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm text-white transition-transform hover:scale-110"
              style={{ backgroundColor: "#2563eb" }}
              title="Add person"
            >
              <Plus size={15} />
            </button>
          </Panel>

          {/* Edge legend */}
          <Panel position="bottom-left">
            <div className="bg-card/70 backdrop-blur border rounded-xl px-3 py-2 text-[10px] space-y-1 shadow">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-emerald-500" />
                <span className="text-muted-foreground">Parent → Child</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 border-t-2 border-dashed border-violet-500" />
                <span className="text-muted-foreground">Spouse</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 border-t border-dotted border-teal-500" />
                <span className="text-muted-foreground">Sibling</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Side panel */}
      {panel && (
        <div
          className="w-72 border-l bg-card flex flex-col overflow-hidden shrink-0"
          style={{ animation: "slideInRight 0.18s ease" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold text-sm">
              {panel.mode === "add" ? "Add Person" : "Edit Person"}
            </span>
            <div className="flex items-center gap-1">
              {panel.mode === "edit" && (
                <button
                  onClick={() => {
                    if (confirm(`Remove ${panel.member.name}?`))
                      deleteMut.mutate(panel.member.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                onClick={closePanel}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input placeholder="Full name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            {/* Relationship */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Relationship</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.emoji} {r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Side */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Side</label>
              <Select value={form.side} onValueChange={v => setForm(f => ({ ...f, side: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIDES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Gender */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Gender</label>
              <div className="flex gap-1">
                {GENDERS.map(g => (
                  <button key={g.value} type="button"
                    onClick={() => setForm(f => ({ ...f, gender: g.value }))}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                      form.gender === g.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}>
                    {g.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Birth / Death */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Birth Year</label>
                <Input type="number" placeholder="1945" value={form.birthYear}
                  onChange={e => setForm(f => ({ ...f, birthYear: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Death Year</label>
                <Input type="number" placeholder="if deceased" value={form.deathYear}
                  onChange={e => setForm(f => ({ ...f, deathYear: e.target.value }))} />
              </div>
            </div>

            {/* Birthplace */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Birthplace</label>
              <Input placeholder="City, Country" value={form.birthPlace}
                onChange={e => setForm(f => ({ ...f, birthPlace: e.target.value }))} />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Textarea placeholder="Stories, memories…" rows={2}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="resize-none text-sm" />
            </div>

            {/* Parent links */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parents</p>
              {(["Parent 1 (Father/A)", "Parent 2 (Mother/B)"] as const).map((lbl, idx) => {
                const key = idx === 0 ? "parent1Id" : "parent2Id";
                return (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{lbl}</label>
                    <Select
                      value={form[key]?.toString() ?? "none"}
                      onValueChange={v => setForm(f => ({ ...f, [key]: v === "none" ? null : parseInt(v) }))}
                    >
                      <SelectTrigger className="text-xs h-8"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {members
                          .filter(m => panel?.mode !== "edit" || m.id !== panel.member.id)
                          .map(m => (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              {m.name} ({roleLabel(m)})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              {/* Children of this person */}
              {panel?.mode === "edit" && (() => {
                const kids = members.filter(m =>
                  (m as any).parent1Id === panel.member.id || (m as any).parent2Id === panel.member.id
                );
                if (!kids.length) return null;
                return (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Children</label>
                    <div className="flex flex-wrap gap-1">
                      {kids.map(k => (
                        <span key={k.id} className="px-2 py-0.5 rounded-full bg-secondary text-xs border">
                          {k.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Deceased */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.isDeceased}
                onChange={e => setForm(f => ({ ...f, isDeceased: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <span className="text-sm text-muted-foreground">Mark as deceased</span>
            </label>
          </div>

          {/* Footer */}
          <div className="p-3 border-t flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={closePanel}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" onClick={savePanel}
              disabled={!form.name.trim() || addMut.isPending || updateMut.isPending}>
              {panel.mode === "add" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        /* Hide React Flow attribution */
        .react-flow__attribution { display: none !important; }
        /* Override RF handle dots to be invisible */
        .react-flow__handle { background: transparent !important; border: none !important; }
      `}</style>
    </div>
  );
}

// ── Public export ──────────────────────────────────────────────────────────────
export default function FamilyTreeCanvas() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
