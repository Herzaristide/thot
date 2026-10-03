"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, unwrap } from "@/lib/api/client";
import type { JobDetail } from "@/lib/api/types";

type MaintenanceKind =
  | "import_books"
  | "quality"
  | "align"
  | "purge"
  | "sync_payload"
  | "reprocess";

/** Lance une tâche de maintenance et la signale par un toast. */
export function useStartJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      kind: MaintenanceKind;
      params?: Record<string, unknown>;
      title?: string;
    }) =>
      unwrap(
        await api.POST("/v1/admin/jobs", {
          body: { kind: vars.kind, params: vars.params ?? {}, title: vars.title },
        }),
      ) as JobDetail,
    onSuccess: (job) => {
      toast.success(`${job.title} : tâche en file`, {
        action: { label: "Suivre", onClick: () => window.location.assign(`/jobs/${job.id}`) },
      });
      void qc.invalidateQueries({ queryKey: ["jobs"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
