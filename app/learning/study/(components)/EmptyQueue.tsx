"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Plus, BookOpen } from "lucide-react";

export function EmptyQueue() {
  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardContent className="pt-6 text-center space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
            <p className="text-muted-foreground">
              No cards due for review right now. Add new notes to start learning
              more vocabulary.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Link href="/learning/notes/new">
              <Button className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add New Note
              </Button>
            </Link>
            <Link href="/learning/notes">
              <Button variant="outline" className="w-full">
                <BookOpen className="h-4 w-4 mr-2" />
                View All Notes
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
