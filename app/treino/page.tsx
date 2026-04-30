"use client";

import { AppSessionTracker } from "@/components/app-session-tracker";
import { TrainingScreen } from "@/components/training-screen";
import { TreinoLoadingScreen, AppWorkoutUnavailableScreen } from "@/components/app-workout-states";
import { useWorkoutAppState } from "@/components/use-workout-app-state";
import { PushPromptModal } from "@/components/push-prompt-modal";

export default function TreinoPage() {
  const { loading, error, noWorkout, currentUserId, generatingWorkout, data, handleGenerateWorkoutNow, reloadWorkout, applyWorkoutUpdate } =
    useWorkoutAppState();

  if (loading) {
    return <TreinoLoadingScreen />;
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
      <TrainingScreen data={data} reloadWorkout={reloadWorkout} applyWorkoutUpdate={applyWorkoutUpdate} />
      <PushPromptModal />
    </>
  );
}
