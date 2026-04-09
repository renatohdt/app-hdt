"use client";

import { AppSessionTracker } from "@/components/app-session-tracker";
import { CalendarScreen } from "@/components/calendar-screen";
import { AppLoadingScreen, AppWorkoutUnavailableScreen } from "@/components/app-workout-states";
import { useWorkoutAppState } from "@/components/use-workout-app-state";

export default function CalendarioPage() {
  const { loading, error, noWorkout, currentUserId, generatingWorkout, data, handleGenerateWorkoutNow } =
    useWorkoutAppState();

  if (loading) {
    return <AppLoadingScreen title="Montando seu calendario" />;
  }

  if (error || noWorkout || !data) {
    return (
      <>
        {currentUserId ? <AppSessionTracker userId={currentUserId} source="calendar" /> : null}
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
      <AppSessionTracker userId={currentUserId} source="calendar" />
      <CalendarScreen data={data} />
    </>
  );
}
