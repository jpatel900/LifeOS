import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Final UX Loop C2-S7 (#687 finding 1, "BRANDED 404"): the App Router's own
 * unmatched-route boundary. Before this file existed, any unrouted path
 * (`/cockpit`, `/day`, a typo, an old bookmark that never got a redirect
 * shim) fell through to Next's bare framework default — an unbranded frame
 * with no way home, unrelated to every other screen this app renders.
 *
 * Deliberately NOT a `page.tsx`: this is Next's file-system convention for
 * "there is no route here," so `routeAllowlist.test.ts`'s strict-equality
 * glob over `page.tsx`/`page.ts` never sees it, and the 11-route allowlist
 * stays exactly as closed as it already was — see that file's own header
 * comment, which explains why a `not-found.tsx` cannot widen the allowlist
 * even in principle (nobody can `pnpm dev` navigate straight to "the 404,"
 * only ever land on it by requesting something else that does not exist).
 *
 * Same card language as `/login` (`workflow-primary-card` +
 * `workflow-flagship-card`, the same centered single-card frame) — plain
 * words, one calm sentence, one link home. No retry affordance: unlike
 * `global-error.tsx` (a render that THREW), nothing here failed — the URL
 * simply does not name anything this app serves, and the one honest next
 * step is the same for every case, so it is the only thing offered.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-md items-center">
      <Card className="workflow-primary-card workflow-flagship-card w-full">
        <CardHeader className="space-y-3">
          <CardTitle>Page not found</CardTitle>
          <CardDescription className="workflow-surface-body text-sm">
            There&apos;s nothing at this address. The link may be old, or the
            page never existed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">Go to Today</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
