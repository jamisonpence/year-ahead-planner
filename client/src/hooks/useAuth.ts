import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return { user: user ?? null, isLoading };
}
