"use client";

import { AppSessionTracker } from "@/components/app-session-tracker";
import { ProgressScreen } from "@/components/progress-screen";
import { AppLoadingScreen, AppWorkoutUnavailableScreen } from "@/components/app-workout-states";
import { useWorkoutAppState } from "@/components/use-workout-app-state";

export default function ProgressoPage() {
  const { loading, error, noWorkout, currentUserId, generatingWorkout, data, handleGenerateWorkoutNow } =
    useWorkoutAppState();

  if (loading) {
    return <AppLoadingScreen title="Montando seu progresso" />;
  }

  if (error || noWorkout || !data) {
    return (
      <>
        {currentUserId ? <AppSessionTracker userId={currentUserId} source="progress" /> : null}
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
      <AppSessionTracker userId={currentUserId} source="progress" />
      <ProgressScreen data={data} />
    </>
  );
}
