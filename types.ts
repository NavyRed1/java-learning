/** Curriculum data model. Source of truth for /data. No UI imports allowed here. */

export type Id = string; // kebab-case, stable, never renamed
export type Difficulty = "easy" | "medium" | "hard";
export type Depth = "core" | "survey"; // survey = awareness-level tool/framework topics
export type ContentStatus = "outline" | "authored" | "reviewed";

export type GroupId =
  | "basics" | "oop" | "collections" | "concurrency" | "advanced" | "functional"
  | "build-tools" | "web-frameworks" | "database-access" | "documentation"
  | "logging" | "testing";

export interface Phase {
  id: Id; order: number; title: string; summary: string;
  weeks: { start: number; end: number };
}

/** Editorial layer (28 UX milestones). Not part of roadmap.sh. */
export interface Milestone {
  id: Id; order: number; phase: Id; title: string; summary: string;
}

export interface Subtopic { id: Id; title: string; summary: string }
export interface Exercise { id: Id; title: string; prompt: string; starterCode?: string; hints?: string[]; /** self-check criteria the learner ticks off after trying the task */ checks?: string[]; solutionRef?: Id }
export interface Resource {
  id: Id; title: string; url: string; kind:
    | "official-docs" | "book" | "course" | "article" | "practice" | "framework-docs"
    | "database" | "testing" | "tool";
  free: boolean; topics: Id[]; summary: string;
}

/** One node of the roadmap.sh Java diagram, plus our teaching content. */
export interface Topic {
  id: Id;
  order: number;                 // global learning order; prerequisites must have a lower order
  title: string;                 // equals roadmap.sh label (never renamed)
  sourceLabel: string;           // label frozen in roadmap-sh-nodes.json
  group: GroupId;
  cluster: string | null;        // sub-box on the roadmap, e.g. "Unit Testing"
  phase: Id;
  milestone: Id;
  description: string;
  objectives: string[];
  subtopics: Subtopic[];
  difficulty: Difficulty;
  estimatedMinutes: number;
  depth: Depth;
  prerequisites: Id[];           // hard edges (gate "recommended next")
  relatedTopics: Id[];           // soft edges (navigation only)
  examples: Id[];
  exercises: Exercise[];
  quizIds: Id[];
  resources: Id[];
  contentStatus: ContentStatus;  // release gate requires "authored" or "reviewed"
}

/** Authored in Prompt 5; stored in data/content/<topic-id>.json */
export interface TopicContent {
  topicId: Id;
  whyItMatters: string;
  mentalModel: string;
  syntaxReference: string;
  syntaxLanguage?: CodeLanguage;
  commonMistakes: { mistake: string; fix: string }[];
  comparisons?: { with: Id; summary: string }[];
  supporting?: { title: string; body: string }[]; // clearly labelled non-roadmap material
  lineByLine: { exampleId: Id; notes: { lines: string; text: string }[] }[];
}

export type CodeLanguage = "java" | "shell" | "text";
export interface Example {
  id: Id; title: string; topics: Id[]; file: string; code: string; language?: CodeLanguage; // default java
  takeaways: string[]; runnable: boolean; javaVersion: string;
  /** Authored documentation of what the program prints. Never a live execution result. */
  expectedOutput?: string;
  /** "error" when the documented output is a failure (exception, compiler message) */
  outputKind?: "stdout" | "error";
}

export type QuizFormat = "multiple-choice" | "true-false" | "output-prediction" | "find-the-error";
export interface QuizQuestion {
  id: Id; scope: "global" | "phase" | "topic"; topic: Id; phase?: Id; format: QuizFormat;
  prompt: string; code?: string; options: string[]; correct: number[]; explanation: string;
  difficulty: Difficulty;
}

export interface Project {
  id: Id; title: string; level: "beginner" | "intermediate" | "advanced";
  summary: string; topics: Id[]; prerequisites: Id[];
  milestones: { id: Id; title: string; topics: Id[] }[];
}
export interface Habit { id: Id; group: "daily" | "weekly" | "before-moving-on"; text: string; week?: number }
export interface WeekPlan {
  week: number; focus: string; milestones: Id[]; practice: Id[]; project?: Id; review: string; habits: Id[];
}

/** Progress model (browser, versioned). The ONLY progress source. */
export type TopicStatus = "not-started" | "in-progress" | "completed";
export interface ProgressStateV1 {
  version: 1;
  topics: Record<Id, { status: TopicStatus; updatedAt: string; completedAt?: string; subtopicsDone?: Id[]; exercisesDone?: Id[] }>;
  quizAttempts: { id: string; scope: QuizQuestion["scope"]; ref?: Id; at: string; score: number; total: number; wrong: Id[] }[];
  habits: Record<Id, string[]>;      // habitId -> ISO dates ticked
  projects: Record<Id, { milestonesDone: Id[]; completedAt?: string }>;
  lastTopicId?: Id;
}

/** Execution abstraction (ADR-0003). Real backend plugs in later. */
export interface ExecutionRequest { source: string; mainClass?: string; javaVersion?: string }
export type ExecutionResult =
  | { status: "unavailable"; reason: string }
  | { status: "ok"; stdout: string; stderr: string; durationMs: number }
  | { status: "compile-error" | "runtime-error" | "timeout"; diagnostics: { line?: number; message: string }[]; stdout?: string; stderr?: string };
export interface ExecutionProvider { readonly id: string; isAvailable(): Promise<boolean>; run(req: ExecutionRequest): Promise<ExecutionResult> }

/** Baseline traceability (data/baseline/sagar-baseline.json) */
export interface BaselineCoverage {
  milestone?: Id; topics?: Id[]; deliveredBy?: "projects"; supporting?: string; placementNote?: string;
}
