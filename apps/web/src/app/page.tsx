"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="grid gap-4">
      <h1 className="sr-only">LifeOS</h1>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-3xl">LifeOS</CardTitle>
          <CardDescription>
            Calm command center for captures, planning, and focused execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/capture">Capture now</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/execute">Continue current task</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Next action</CardTitle>
          <CardDescription>
            Quick Capture: capture one thought, send it to review, then plan the
            first block.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="sr-only">Quick Capture</p>
          Use the Capture screen in the navigation above to save new thoughts and
          send them to review.
        </CardContent>
      </Card>
    </main>
  );
}
