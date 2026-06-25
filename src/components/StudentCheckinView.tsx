"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityCheckin } from "@/components/ActivityCheckin";
import { TrafficCheckin } from "@/components/TrafficCheckin";
import type { UserDoc } from "@/lib/types";

export function StudentCheckinView({ userDoc }: { userDoc: UserDoc }) {
  const [checkinType, setCheckinType] = useState<"traffic" | "activity">("traffic");

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex gap-2">
            <Button
              variant={checkinType === "traffic" ? "default" : "outline"}
              onClick={() => setCheckinType("traffic")}
              className="flex-1"
            >
              จราจร
            </Button>
            <Button
              variant={checkinType === "activity" ? "default" : "outline"}
              onClick={() => setCheckinType("activity")}
              className="flex-1"
            >
              กิจกรรม
            </Button>
          </div>

          {checkinType === "traffic" ? (
            <TrafficCheckin userDoc={userDoc} />
          ) : (
            <ActivityCheckin userDoc={userDoc} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
