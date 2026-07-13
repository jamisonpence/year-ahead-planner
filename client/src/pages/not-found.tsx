import { Link } from "wouter";
import { Compass, ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="w-14 h-14 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-4">
          <Compass className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">We can't find that page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have moved, or the link might be out of date.
        </p>
        <Link href="/dashboard">
          <a className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">
            Back to Today <ArrowRight size={15} />
          </a>
        </Link>
      </div>
    </div>
  );
}
