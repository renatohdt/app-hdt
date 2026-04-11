export type Goal = "lose_weight" | "gain_muscle" | "body_recomposition" | "improve_conditioning";
export type Experience = "no_training" | "lt_6_months" | "6_to_12_months" | "gt_1_year";
export type Gender = "male" | "female";
export type Situation =
  | "cant_stay_consistent"
  | "no_results"
  | "dont_know_correctly"
  | "could_get_better";
export type MuscleConnection = "clear" | "sometimes" | "rarely" | "never";
export type Wrist = "dont_touch" | "not_touch" | "just_touch" | "overlap";
export type BodyType = "endomorph" | "mesomorph" | "ectomorph" | "unknown";
export type Location = "gym" | "home";
export type StructuredPlan = "coach" | "self" | "no";
export type HomeEquipment =
  | "halteres"
  | "elasticos"
  | "fitball"
  | "fita_suspensa"
  | "caneleira"
  | "kettlebell"
  | "nenhum";

export type UserProfile = "beginner_lost" | "false_intermediate" | "inconsistent" | "stagnated";

export type QuizAnswers = {
  goal: Goal;
  experience: Experience;
  gender: Gender;
  age: number;
  weight: number;
  height: number;
  profession: string;
  situation: Situation;
  mindMuscle: MuscleConnection;
  wrist: Wrist;
  body_type_raw?: Wrist | string;
  body_type?: BodyType | string;
  location: Location;
  equipment: HomeEquipment[];
  days: number;
  time: number;
  structuredPlan: StructuredPlan;
};

export type ExerciseRecord = {
  id: string;
  name: string;
  name_normalized?: string;
  tags?: string[];
  muscle?: string;
  muscle_groups?: string[];
  type?: string;
  location?: string[];
  level?: string | string[];
  equipment?: string[];
  metadata?: {
    muscle?: string;
    muscle_groups?: string[];
    muscles?: string[];
    type?: string;
    location?: string[];
    level?: string | string[];
    equipment?: string[];
  };
  video_url: string | null;
};

export type WorkoutBlockType =
  | "normal"
  | "mobility"
  | "superset"
  | "bi-set"
  | "tri-set"
  | "drop-set"
  | "rest-pause"
  | "cluster"
  | "isometria"
  | "tempo_controlado"
  | "parciais"
  | "pre-exaustao"
  | "pos-exaustao"
  | "circuit";

export type CombinedBlockType = Extract<WorkoutBlockType, "superset" | "bi-set" | "tri-set" | "circuit">;

export type WorkoutExercise = {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  type?: string;
  method?: string | null;
  technique?: string | null;
  blockType?: WorkoutBlockType;
  trainingTechnique?: string | null;
  rationale?: string | null;
  notes?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  muscleGroups?: string[];
  videoUrl?: string | null;
  order?: string | null;
  blockId?: string | null;
  blockLabel?: string | null;
  rounds?: string | null;
  restAfterRound?: string | null;
  blockNotes?: string | null;
};

export type WorkoutSingleItem = WorkoutExercise & {
  type: "mobility" | "exercise";
};

export type WorkoutCombinedBlockItem = {
  type: "combined_block";
  blockType: CombinedBlockType;
  blockLabel: string;
  rounds: string;
  restAfterRound: string;
  notes?: string | null;
  exercises: WorkoutExercise[];
};

export type WorkoutSectionItem = WorkoutSingleItem | WorkoutCombinedBlockItem;

export type WorkoutSection = {
  title: string;
  subtitle: string;
  focus: string;
  splitType?: string;
  sessionFocus?: string;
  focusLabel?: string;
  rationale?: string | null;
  progressionTip?: string | null;
  estimatedDurationMinutes?: number;
  durationRange?: string | null;
  timeFitRationale?: string | null;
  mobility: WorkoutExercise[];
  exercises: WorkoutExercise[];
  items?: WorkoutSectionItem[];
};

export type WorkoutPlan = {
  title: string;
  subtitle: string;
  estimatedDuration: string;
  estimatedDurationMinutes?: number;
  durationRange?: string | null;
  timeFitRationale?: string | null;
  focus: string[];
  splitType?: string;
  rationale?: string | null;
  sessionCount?: number;
  blockDurationWeeks?: number;
  totalSessions?: number;
  sessionStrategyReason?: string | null;
  planCycleId?: string | null;
  progressionNotes?: string | null;
  sections: WorkoutSection[];
  exercises: WorkoutExercise[];
};

export type DiagnosisResult = {
  profile: UserProfile;
  title: string;
  message: string;
  trainingShift: string;
};
