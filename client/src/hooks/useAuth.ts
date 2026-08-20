import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/queryClient";
import { authHeaders } from "@/lib/nativeAuth";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  onboarded: boolean;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      // Spelled out rather than relying on the native fetch shim. This one request gates
      // the entire app behind a "Loading…" screen, so it should not depend on unrelated
      // startup code having run first.
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { ...authHeaders() },
        credentials: "include",
      });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { user: user ?? null, isLoading };
}
