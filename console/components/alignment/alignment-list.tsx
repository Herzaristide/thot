"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, Loading } from "@/components/common/misc";
import { PageHeader } from "@/components/common/page-header";
import { AlignmentBadge } from "@/components/common/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, unwrap } from "@/lib/api/client";
import { languageName, num, percent, relativeTime, score } from "@/lib/format";

function PrecisionCard() {
  const { data } = useQuery({
    queryKey: ["alignment", "precision"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/alignment/precision")),
  });
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Précision mesurée</CardTitle>
        <Link href="/alignment/review" className="text-xs text-muted-foreground underline">
          vérifier un échantillon
        </Link>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">
            Aucun échantillon vérifié. La précision se mesure en jugeant des liens tirés au hasard.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Méthode</TableHead>
                <TableHead className="text-right">Vérifiés</TableHead>
                <TableHead className="text-right">Précision</TableHead>
                <TableHead className="text-right">Intervalle 95 %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((p) => (
                <TableRow key={p.method}>
                  <TableCell className="font-mono text-xs">{p.method}</TableCell>
                  <TableCell className="text-right tabular">{num(p.reviews)}</TableCell>
                  <TableCell className="text-right tabular">
                    {p.precision === null ? "–" : percent(p.precision)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular text-muted-foreground">
                    {p.wilson_low === null
                      ? "–"
                      : `${percent(p.wilson_low)} – ${percent(p.wilson_high ?? 0)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const TABS = [
  { value: "todo", label: "À traiter", status: ["doubtful", "pending"] },
  { value: "all", label: "Toutes", status: undefined },
  { value: "reliable", label: "Fiables", status: ["reliable"] },
  { value: "rejected", label: "Rejetées", status: ["rejected"] },
];

export function AlignmentList() {
  const [tab, setTab] = useState("todo");
  const status = TABS.find((t) => t.value === tab)?.status;
  const { data, error, isLoading } = useQuery({
    queryKey: ["alignment", "editions", tab],
    queryFn: async () =>
      unwrap(
        await api.GET("/v1/admin/alignment/editions", {
          params: { query: { status, sort: "todo" } },
        }),
      ),
  });
  return (
    <>
      <PageHeader
        title="Atelier d'alignement"
        description="Traductions alignées sur l'édition de référence de leur œuvre : corriger les liens douteux, juger la qualité."
      />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div>
          <Tabs value={tab} onValueChange={setTab} className="mb-3">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorBox error={error} />
          ) : !data?.length ? (
            <Empty>Rien à traiter ici.</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Édition</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Alignés</TableHead>
                  <TableHead className="text-right">Score moyen</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Faibles</TableHead>
                  <TableHead className="hidden lg:table-cell">Corrections</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.edition_id}>
                    <TableCell className="max-w-sm">
                      <Link
                        href={`/alignment/${e.edition_id}`}
                        className="font-medium hover:underline"
                      >
                        {e.work_title}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {languageName(e.language)} → {languageName(e.reference_language)} ·{" "}
                        {e.title} · {relativeTime(e.updated_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <AlignmentBadge status={e.status} />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular">
                      {e.aligned_ratio === null ? "–" : percent(e.aligned_ratio)}
                      <div className="text-xs text-muted-foreground">
                        {num(e.n_aligned_segments)}/{num(e.n_segments)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{score(e.mean_score)}</TableCell>
                    <TableCell className="hidden text-right tabular lg:table-cell">
                      {e.low_score_ratio === null ? "–" : percent(e.low_score_ratio)}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {e.manual_links} lien(s) manuel(s), {e.reviews} verdict(s)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <PrecisionCard />
      </div>
    </>
  );
}
