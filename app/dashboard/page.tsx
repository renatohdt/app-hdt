"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppSessionTracker } from "@/components/app-session-tracker";
import { DashboardHomeScreen } from "@/components/dashboard-home-screen";
import { AppLoadingScreen, AppWorkoutUnavailableScreen } from "@/components/app-workout-states";
import { useWorkoutAppState } from "@/components/use-workout-app-state";

export default function DashboardPage() {
  return (
    <Suspense fallback={<AppLoadingScreen title="Carregando sua home" />}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const { loading, error, noWorkout, currentUserId, generatingWorkout, data, handleGenerateWorkoutNow } =
    useWorkoutAppState({
      searchUserId: searchParams.get("userId")
    });

  if (loading) {
    return <AppLoadingScreen title="Carregando sua home" />;
  }

  if (error || noWorkout || !data) {
    return (
      <>
        {currentUserId ? <AppSessionTracker userId={currentUserId} source="dashboard" /> : null}
        <AppWorkoutUnavailableScreen
          error={error}
          generatingWorkout={generatingWorkout}
          onGenerateWorkoutNow={handleGenerateWorkoutNow}
          autoRedirect={noWorkout}
        />
      </>
    );
  }

  return (
    <>
      <AppSessionTracker userId={currentUserId} source="dashboard" />
      <DashboardHomeScreen data={data} />
    </>
  );
}
