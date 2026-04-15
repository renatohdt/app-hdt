"use client";

import { AppSessionTracker } from "@/components/app-session-tracker";
import { TrainingScreen } from "@/components/training-screen";
import { AppLoadingScreen, AppWorkoutUnavailableScreen } from "@/components/app-workout-states";
import { useWorkoutAppState } from "@/components/use-workout-app-state";

export default function TreinoPage() {
  const { loading, error, noWorkout, currentUserId, generatingWorkout, data, handleGenerateWorkoutNow, reloadWorkout } =
    useWorkoutAppState();

  if (loading) {
    return <AppLoadingScreen title="Carregando seu treino" />;
  }

  if (error || noWorkout || !data) {
    return (
      <>
        {currentUserId ? <AppSessionTracker userId={currentUserId} source="training" /> : null}
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
      <AppSessionTracker userId={currentUserId} source="training" />
      <TrainingScreen data={data} reloadWorkout={reloadWorkout} />
    </>
  );
}
