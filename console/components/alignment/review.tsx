"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Empty, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api, errorMessage, unwrap } from "@/lib/api/client";
import { score } from "@/lib/format";

type Verdict = "correct" | "partial" | "incorrect";

export function ReviewPage() {
  const qc = useQueryClient();
  const [round, setRound] = useState(0);
  const [comment, setComment] = useState("");
  const [count, setCount] = useState(0);
  const sample = useQuery({
    queryKey: ["alignment", "sample", round],
    queryFn: async () => unwrap(await api.GET("/v1/alignment/sample")),
    retry: false,
  });
  const verdict = useMutation({
    mutationFn: async (v: Verdict) => {
      const s = sample.data;
      if (!s) return;
      unwrap(
        await api.POST("/v1/alignment/reviews", {
          body: {
            source: { edition_id: s.source.edition_id, seq: s.source.seq },
            unit_id: s.unit_id,
            verdict: v,
            is_sample: true,
            comment: comment || null,
          },
        }),
      );
    },
    onSuccess: () => {
      setCount((c) => c + 1);
      setComment("");
      setRound((r) => r + 1);
      void qc.invalidateQueries({ queryKey: ["alignment", "precision"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || verdict.isPending || !sample.data) return;
      const map: Record<string, Verdict> = { "1": "correct", "2": "partial", "3": "incorrect" };
      if (map[e.key]) verdict.mutate(map[e.key]);
      if (e.key === "s") setRound((r) => r + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verdict, sample.data]);

  const s = sample.data;
  return (
    <>
      <PageHeader
        title="Vérification par échantillon"
        description="Des liens tirés au hasard : votre verdict mesure la précision réelle de chaque méthode d'alignement (intervalle de confiance dans l'atelier)."
        actions={
          <span className="text-sm text-muted-foreground tabular">
            {count} verdict(s) cette session
          </span>
        }
      />
      {sample.isLoading ? (
        <Loading rows={4} />
      ) : sample.error ? (
        sample.error instanceof ApiError && sample.error.status === 404 ? (
          <Empty>Aucun lien d'alignement à vérifier.</Empty>
        ) : (
          <ErrorBox error={sample.error} />
        )
      ) : s ? (
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Traduction</CardTitle>
                <span className="text-xs text-muted-foreground">segment {s.source.seq}</span>
              </CardHeader>
              <CardContent className="font-serif text-[15px] leading-relaxed">
                {s.source.text}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Référence</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {s.method} · score {score(s.score)}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 font-serif text-[15px] leading-relaxed">
                {s.reference.map((r) => (
                  <p key={r.seq}>{r.text}</p>
                ))}
              </CardContent>
            </Card>
          </div>
          <Input
            className="mt-4"
            placeholder="Commentaire (facultatif)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              onClick={() => verdict.mutate("correct")}
              disabled={verdict.isPending}
              className="bg-ok text-background hover:bg-ok/90"
            >
              <Check aria-hidden /> Juste{" "}
              <kbd className="rounded border border-current/40 px-1 text-xs">1</kbd>
            </Button>
            <Button
              onClick={() => verdict.mutate("partial")}
              disabled={verdict.isPending}
              variant="outline"
            >
              Partiel <kbd className="rounded border px-1 text-xs">2</kbd>
            </Button>
            <Button
              onClick={() => verdict.mutate("incorrect")}
              disabled={verdict.isPending}
              variant="destructive"
            >
              <X aria-hidden /> Faux{" "}
              <kbd className="rounded border border-current/40 px-1 text-xs">3</kbd>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setRound((r) => r + 1)}
              disabled={verdict.isPending}
            >
              <SkipForward aria-hidden /> Passer{" "}
              <kbd className="rounded border px-1 text-xs">s</kbd>
            </Button>
            {verdict.isPending && (
              <Loader2 className="size-5 animate-spin self-center" aria-hidden />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
