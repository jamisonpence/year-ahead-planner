import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Hobby } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PageShell from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  HOBBY_TYPE_MAP, HOBBY_TYPES,
  HobbyPlan,
  parsePlans, setPlansInExtra,
  HobbyPlanRichCard,
} from "./HobbiesPage";

export default function HobbyPlanDetailPage() {
  const { id, planId } = useParams<{ id: string; planId: string }>();
  const hobbyId = Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: hobbies = [], isLoading } = useQuery<Hobby[]>({
    queryKey: ["/api/hobbies"],
    queryFn: async () => { const r = await apiRequest("GET", "/api/hobbies"); return r.json(); },
  });

  const hobby = hobbies.find(h => h.id === hobbyId) ?? null;
  const plans = hobby ? parsePlans(hobby.extraJson ?? "{}") : [];
  const goals = hobby ? parseGoals(hobby.extraJson ?? "{}") : [];
  const plan = plans.find(p => p.id === planId) ?? null;

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiRequest("PATCH", `/api/hobbies/${id}`, data);
      return r.json() as Promise<Hobby>;
    },
    onSuccess: (updated) => {
      qc.setQueryData<Hobby[]>(["/api/hobbies"], (old = []) => old.map(h => h.id === updated.id ? updated : h));
    },
  });

  const updatePlans = (updated: HobbyPlan[]) => {
    if (!hobby) return;
    updateMut.mutate({ id: hobbyId, data: { extraJson: setPlansInExtra(hobby.extraJson ?? "{}", updated) } });
  };

  if (isLoading) {
    return (
      <PageShell title="Plan" subtitle="Loading…">
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading…</div>
      </PageShell>
    );
  }

  if (!hobby || !plan) {
    return (
      <PageShell title="Plan not found" subtitle="">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-muted-foreground text-sm">This plan doesn't exist or was removed.</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/hobbies/${hobbyId}`)}>
            <ArrowLeft size={14} className="mr-1.5" /> Back to Hobby
          </Button>
        </div>
      </PageShell>
    );
  }

  const typeInfo = HOBBY_TYPE_MAP[hobby.hobbyType as any] ?? HOBBY_TYPES[0];

  const handleToggleStep = (pid: string, stepId: string, done: boolean) => {
    updatePlans(plans.map(p => p.id === pid
      ? { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, done } : s) }
      : p));
  };

  const handleToggleMilestone = (pid: string, milestoneId: string, completed: boolean) => {
    updatePlans(plans.map(p => p.id === pid
      ? { ...p, milestones: (p.milestones ?? []).map(m => m.id === milestoneId ? { ...m, completedAt: completed ? new Date().toISOString() : undefined } : m) }
      : p));
  };

  const handleToggleActive = (pid: string) => {
    updatePlans(plans.map(p => p.id === pid
      ? { ...p, isActive: !p.isActive, startDate: (!p.isActive && !p.startDate) ? new Date().toISOString().slice(0, 10) : p.startDate }
      : p));
  };

  const handlePause = (pid: string) => {
    updatePlans(plans.map(p => p.id === pid ? { ...p, isActive: false, isPaused: true } : p));
  };

  const handleResume = (pid: string) => {
    updatePlans(plans.map(p => p.id === pid ? { ...p, isActive: true, isPaused: false } : p));
  };

  const handleComplete = (pid: string) => {
    updatePlans(plans.map(p => p.id === pid
      ? { ...p, isActive: false, isPaused: false, completedAt: new Date().toISOString() }
      : p));
    toast({ title: "Plan completed! 🎉" });
  };

  const handleDelete = (pid: string) => {
    updatePlans(plans.filter(p => p.id !== pid));
    navigate(`/hobbies/${hobbyId}`);
    toast({ title: "Plan deleted" });
  };

  return (
    <PageShell
      title={plan.title}
      subtitle={hobby.name}
      action={
        <Button variant="outline" size="sm" onClick={() => navigate(`/hobbies/${hobbyId}`)}>
          <ArrowLeft size={14} className="mr-1.5" /> {hobby.name}
        </Button>
      }
    >
      <HobbyPlanRichCard
        plan={plan}
        hobbyColor={typeInfo.color}
        hobbyTypeLabel={typeInfo.label}
        onToggleStep={(stepId, done) => handleToggleStep(plan.id, stepId, done)}
        onToggleMilestone={(milestoneId, completed) => handleToggleMilestone(plan.id, milestoneId, completed)}
        onToggleActive={() => handleToggleActive(plan.id)}
        onPause={() => handlePause(plan.id)}
        onResume={() => handleResume(plan.id)}
        onComplete={() => handleComplete(plan.id)}
        onDelete={() => handleDelete(plan.id)}
        onEdit={() => {}}
      />
    </PageShell>
  );
}
